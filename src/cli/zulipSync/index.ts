import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { debugLog, debugWarn } from "../../utils/debug";

interface SmartyProjectZulipConfig {
  schemaVersion: 1;
  realmUrl: string;
  realmId: string;
  streamName: string;
  controlPlaneBaseUrl: string;
  runtimeAgentId: string;
}

interface ZulipSyncEnv {
  zulipUserEmail: string;
  zulipUserApiKey: string;
  controlPlaneSharedSecret: string;
}

interface ResolvedThread {
  bindingId: string;
  threadId: string;
  streamName: string;
  topic: string;
  anchorMessageId?: number;
}

interface LocalDedupeEntry {
  kind: "mirror" | "bootstrap" | "rename";
  key: string;
  timestampMs: number;
  zulipMessageId?: number;
}

interface LocalDedupeState {
  schemaVersion: 1;
  realmId: string;
  runtimeAgentId: string;
  conversationId: string;
  updatedAtMs: number;
  entries: LocalDedupeEntry[];
}

const DEDUPE_SCHEMA_VERSION = 1;
const DEDUPE_MAX_ENTRIES = 50;
const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MIRROR_SENTINEL = "\u200B\u200C\u200B";

function hashToHex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sanitizePathComponent(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return (cleaned || "unknown").slice(0, 120);
}

function normalizeTurnText(value: string | undefined): string {
  return String(value || "").trim();
}

function buildMirrorDedupeKey(args: {
  conversationId: string;
  userText?: string;
  assistantText?: string;
}): string {
  const userText = normalizeTurnText(args.userText);
  const assistantText = normalizeTurnText(args.assistantText);
  const digest = hashToHex(
    `${args.conversationId}\n${userText}\n${assistantText}`,
  );
  return `mirror:${digest}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeSignedPath(endpointOrPath: string): string {
  const raw = String(endpointOrPath || "").trim();
  if (!raw) return "/";

  try {
    const u =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : new URL(raw, "http://localhost");
    return u.pathname || "/";
  } catch {
    const noQuery = raw.split("?")[0] || "/";
    if (noQuery.startsWith("/")) return noQuery;
    return `/${noQuery}`;
  }
}

function newS2sNonce(): string {
  try {
    return randomUUID();
  } catch {
    return randomBytes(16).toString("hex");
  }
}

function controlPlaneS2sAuthHeaders(args: {
  sharedSecret: string;
  method: string;
  endpointOrPath: string;
}): Record<string, string> {
  const secret = String(args.sharedSecret || "").trim();
  if (!secret) return {};

  const method =
    String(args.method || "")
      .trim()
      .toUpperCase() || "GET";
  const path = normalizeSignedPath(args.endpointOrPath);
  const timestamp = String(Date.now());
  const nonce = newS2sNonce();
  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}`;
  const signatureHex = createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest("hex");

  return {
    "X-SP-S2S-Timestamp": timestamp,
    "X-SP-S2S-Nonce": nonce,
    "X-SP-S2S-Signature": signatureHex,
  };
}

function deterministicTopicFromConversationId(conversationId: string): string {
  const normalized = conversationId.trim().replace(/\s+/g, "-");
  const fallback = "conversation";
  const suffix = normalized.length > 0 ? normalized : fallback;
  return `letta-${suffix}`.slice(0, 60);
}

function findConfigPath(startDirectory: string): string | null {
  let current = resolve(startDirectory);

  while (true) {
    const candidate = join(current, ".smarty", "project", "zulip.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function parseConfig(raw: unknown): SmartyProjectZulipConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.schemaVersion !== 1) return null;
  if (
    !isNonEmptyString(obj.realmUrl) ||
    !isNonEmptyString(obj.realmId) ||
    !isNonEmptyString(obj.streamName) ||
    !isNonEmptyString(obj.controlPlaneBaseUrl) ||
    !isNonEmptyString(obj.runtimeAgentId)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    realmUrl: obj.realmUrl,
    realmId: obj.realmId,
    streamName: obj.streamName,
    controlPlaneBaseUrl: obj.controlPlaneBaseUrl,
    runtimeAgentId: obj.runtimeAgentId,
  };
}

function loadConfig(startDirectory: string): SmartyProjectZulipConfig | null {
  const path = findConfigPath(startDirectory);
  if (!path) return null;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    const config = parseConfig(parsed);
    if (!config) {
      debugWarn("zulip-sync", `Ignoring invalid config at ${path}`);
    }
    return config;
  } catch (error) {
    debugWarn("zulip-sync", "Failed to load config", error);
    return null;
  }
}

function readEnv(): ZulipSyncEnv | null {
  const zulipUserEmail = process.env.ZULIP_USER_EMAIL;
  const zulipUserApiKey = process.env.ZULIP_USER_API_KEY;
  const controlPlaneSharedSecret = process.env.CONTROL_PLANE_SHARED_SECRET;

  if (
    !isNonEmptyString(zulipUserEmail) ||
    !isNonEmptyString(zulipUserApiKey) ||
    !isNonEmptyString(controlPlaneSharedSecret)
  ) {
    return null;
  }

  return {
    zulipUserEmail,
    zulipUserApiKey,
    controlPlaneSharedSecret,
  };
}

function getArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  const candidates = ["items", "bindings", "data", "results"];
  for (const key of candidates) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function getRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  return data as Record<string, unknown>;
}

function getFirstString(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (isNonEmptyString(value)) return value;
  }
  return null;
}

function getFirstNumber(
  data: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function sanitizeMirroredContent(content: string): string {
  return content
    .replace(/@\*\*[^*]+\*\*/g, "")
    .replace(/@\*[^*]+\*/g, "")
    .trim();
}

function formatMirroredTurn(args: {
  userText?: string;
  assistantText?: string;
}): string {
  const userText = sanitizeMirroredContent(String(args.userText || "").trim());
  const assistantText = sanitizeMirroredContent(
    String(args.assistantText || "").trim(),
  );

  const parts: string[] = [];

  if (userText) {
    parts.push(`**Paul → Letta**\n${userText}`);
  }

  if (assistantText) {
    parts.push(`**Letta → Paul**\n${assistantText}`);
  }

  return parts.join("\n\n").trim();
}

export class LocalZulipSyncManager {
  private static readonly bootstrapInFlight = new Map<
    string,
    Promise<ResolvedThread | null>
  >();

  private readonly config: SmartyProjectZulipConfig;
  private readonly env: ZulipSyncEnv;
  private readonly conversationId: string;
  private readonly dedupeStatePath: string;
  private dedupeStateCache: LocalDedupeState | null = null;
  private resolvedThread: ResolvedThread | null | undefined;
  private lastResolveAttemptMs = 0;
  private resolveThreadInFlight: Promise<ResolvedThread | null> | null = null;

  public constructor(
    config: SmartyProjectZulipConfig,
    env: ZulipSyncEnv,
    conversationId: string,
  ) {
    this.config = config;
    this.env = env;
    this.conversationId = conversationId;
    this.dedupeStatePath = this.getDedupeStatePath();
  }

  public async mirrorTurn(args: {
    userText?: string;
    assistantText?: string;
  }): Promise<void> {
    try {
      const mirroredContent = formatMirroredTurn(args);
      if (!mirroredContent) return;
      const content = `${mirroredContent}${MIRROR_SENTINEL}`;

      const idempotencyKey = buildMirrorDedupeKey({
        conversationId: this.conversationId,
        userText: args.userText,
        assistantText: args.assistantText,
      });

      if (this.hasRecentDedupeEntry("mirror", idempotencyKey)) {
        debugLog("zulip-sync", "Skipping duplicate mirrored turn", {
          conversationId: this.conversationId,
          idempotencyKey,
        });
        return;
      }

      const thread = await this.resolveThread();
      if (!thread) return;

      const result = await this.sendToZulip(
        `${normalizeBaseUrl(this.config.realmUrl)}/api/v1/messages`,
        new URLSearchParams({
          type: "stream",
          to: thread.streamName,
          topic: thread.topic,
          content,
        }),
      );

      this.recordDedupeEntry({
        kind: "mirror",
        key: idempotencyKey,
        zulipMessageId: getFirstNumber(result, [
          "id",
          "message_id",
          "messageId",
        ]),
      });
    } catch (error) {
      debugWarn("zulip-sync", "Failed to mirror turn", error);
    }
  }

  public async renameConversationTopic(newTopic: string): Promise<void> {
    try {
      const topic = newTopic.trim();
      if (!topic) return;

      const thread = await this.resolveThread();
      if (!thread) return;
      if (!thread.anchorMessageId) {
        debugLog(
          "zulip-sync",
          "Skipping topic rename because thread anchor message id is missing",
        );
        return;
      }

      const renameKey = `rename:${thread.anchorMessageId}:${hashToHex(topic)}`;
      if (this.hasRecentDedupeEntry("rename", renameKey)) {
        debugLog("zulip-sync", "Skipping duplicate topic rename", {
          conversationId: this.conversationId,
          anchorMessageId: thread.anchorMessageId,
          topic,
        });
        return;
      }

      await this.sendToZulip(
        `${normalizeBaseUrl(this.config.realmUrl)}/api/v1/messages/${thread.anchorMessageId}`,
        new URLSearchParams({
          topic,
          propagate_mode: "change_all",
          send_notification_to_old_thread: "false",
          send_notification_to_new_thread: "false",
        }),
        "PATCH",
      );

      this.recordDedupeEntry({
        kind: "rename",
        key: renameKey,
        zulipMessageId: thread.anchorMessageId,
      });

      this.resolvedThread = { ...thread, topic };
    } catch (error) {
      debugWarn("zulip-sync", "Failed to rename Zulip topic", error);
    }
  }

  private async resolveThread(): Promise<ResolvedThread | null> {
    if (this.resolveThreadInFlight) {
      return this.resolveThreadInFlight;
    }

    const inFlight = this.resolveThreadInternal();
    this.resolveThreadInFlight = inFlight;
    try {
      return await inFlight;
    } finally {
      if (this.resolveThreadInFlight === inFlight) {
        this.resolveThreadInFlight = null;
      }
    }
  }

  private async resolveThreadInternal(): Promise<ResolvedThread | null> {
    const now = Date.now();
    if (
      this.resolvedThread !== undefined &&
      now - this.lastResolveAttemptMs < 30000
    ) {
      return this.resolvedThread;
    }

    this.lastResolveAttemptMs = now;

    try {
      const bindingId = await this.resolveBindingId();
      if (!bindingId) {
        this.resolvedThread = null;
        return null;
      }

      const resolveResult = await this.controlPlanePost(
        "/s2s/zulip/runtime_conversation/resolve_by_conversation_id",
        {
          bindingId,
          conversationId: this.conversationId,
          realmId: this.config.realmId,
        },
      );

      const resolved = getRecord(resolveResult);
      const threadId = getFirstString(resolved, ["threadId"]);

      if (!threadId) {
        const bootstrapped = await this.bootstrapThreadWithDedupe(bindingId);
        this.resolvedThread = bootstrapped;
        return bootstrapped;
      }

      const threadResult = await this.controlPlanePost(
        "/s2s/zulip/threads/get",
        {
          bindingId,
          threadId,
          realmId: this.config.realmId,
        },
      );

      const threadData = getRecord(threadResult);
      const topic =
        getFirstString(threadData, ["topic"]) ||
        getFirstString(resolved, ["topic"]);

      if (!topic) {
        this.resolvedThread = null;
        return null;
      }

      const streamName =
        getFirstString(threadData, ["streamName"]) || this.config.streamName;

      this.resolvedThread = {
        bindingId,
        threadId,
        streamName,
        topic,
        anchorMessageId: getFirstNumber(threadData, ["anchorMessageId"]),
      };
      return this.resolvedThread;
    } catch (error) {
      debugWarn("zulip-sync", "Failed to resolve thread mapping", error);
      this.resolvedThread = null;
      return null;
    }
  }

  private async bootstrapThreadWithDedupe(
    bindingId: string,
  ): Promise<ResolvedThread | null> {
    const dedupeKey = `${bindingId}:${this.conversationId}`;
    const existing = LocalZulipSyncManager.bootstrapInFlight.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const created = this.bootstrapThread(bindingId).finally(() => {
      LocalZulipSyncManager.bootstrapInFlight.delete(dedupeKey);
    });
    LocalZulipSyncManager.bootstrapInFlight.set(dedupeKey, created);
    return created;
  }

  private async bootstrapThread(
    bindingId: string,
  ): Promise<ResolvedThread | null> {
    const topic = deterministicTopicFromConversationId(this.conversationId);
    const bootstrapKey = `bootstrap:${this.conversationId}:${hashToHex(topic)}`;
    const previousBootstrap = this.getRecentDedupeEntry(
      "bootstrap",
      bootstrapKey,
    );

    // Control plane thread resolution is stream-id based.
    const streamId = await this.resolveZulipStreamIdByName(
      this.config.streamName,
    );
    if (!streamId) {
      throw new Error(
        `Failed to resolve Zulip stream id for stream name: ${this.config.streamName}`,
      );
    }

    let anchorMessageId = previousBootstrap?.zulipMessageId;
    if (!anchorMessageId) {
      const anchor = await this.sendToZulip(
        `${normalizeBaseUrl(this.config.realmUrl)}/api/v1/messages`,
        new URLSearchParams({
          type: "stream",
          to: this.config.streamName,
          topic,
          content: `Thread bootstrap anchor for Letta conversation ${this.conversationId}`,
        }),
      );

      anchorMessageId = getFirstNumber(anchor, [
        "id",
        "message_id",
        "messageId",
      ]);
      if (!anchorMessageId) {
        throw new Error("Zulip bootstrap did not return an anchor message id");
      }

      this.recordDedupeEntry({
        kind: "bootstrap",
        key: bootstrapKey,
        zulipMessageId: anchorMessageId,
      });
    } else {
      debugLog("zulip-sync", "Reusing previous bootstrap anchor message id", {
        conversationId: this.conversationId,
        anchorMessageId,
      });
    }

    const resolvedThread = getRecord(
      await this.controlPlanePost("/s2s/zulip/threads/resolve", {
        realmId: this.config.realmId,
        streamId: String(streamId),
        streamName: this.config.streamName,
        topic,
        anchorMessageId,
      }),
    );

    const threadId = getFirstString(resolvedThread, ["threadId"]);
    if (!threadId) {
      throw new Error("Control plane thread resolve did not return thread id");
    }

    await this.controlPlanePost("/s2s/zulip/runtime_conversation/upsert", {
      realmId: this.config.realmId,
      bindingId,
      threadId,
      conversationId: this.conversationId,
      source: "created",
    });

    return {
      bindingId,
      threadId,
      streamName: this.config.streamName,
      topic,
      anchorMessageId,
    };
  }

  private async resolveBindingId(): Promise<string | null> {
    const listResult = await this.controlPlanePost("/s2s/zulip/bindings/list", {
      realmId: this.config.realmId,
    });

    const bindings = getArray(listResult);
    for (const item of bindings) {
      const binding = getRecord(item);

      const runtime = getRecord(binding.runtime);
      const runtimeAgentId =
        getFirstString(runtime, ["runtimeAgentId"]) ||
        getFirstString(binding, ["runtimeAgentId"]);
      if (runtimeAgentId !== this.config.runtimeAgentId) continue;

      const bindingId = getFirstString(binding, ["bindingId"]);
      if (bindingId) return bindingId;
    }

    return null;
  }

  private async resolveZulipStreamIdByName(
    streamName: string,
  ): Promise<number | null> {
    const name = streamName.trim();
    if (!name) return null;

    const base = normalizeBaseUrl(this.config.realmUrl);
    const url = `${base}/api/v1/get_stream_id?stream=${encodeURIComponent(name)}`;
    const payload = await this.getFromZulip(url);
    const data = getRecord(payload);
    const id = getFirstNumber(data, ["stream_id", "streamId", "id"]);
    return typeof id === "number" ? id : null;
  }

  private async getFromZulip(url: string): Promise<unknown> {
    const token = Buffer.from(
      `${this.env.zulipUserEmail}:${this.env.zulipUserApiKey}`,
    ).toString("base64");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${token}`,
      },
    });

    const responseText = await response.text().catch(() => "");
    let responsePayload: unknown = null;
    try {
      responsePayload = responseText
        ? (JSON.parse(responseText) as unknown)
        : null;
    } catch {
      responsePayload = responseText;
    }

    if (!response.ok) {
      if (response.status === 401 && /invalid api key/i.test(responseText)) {
        debugWarn(
          "zulip-sync",
          "Zulip returned 401 Invalid API key. Verify ZULIP_USER_EMAIL is your Zulip delivery_email (Settings > Account & privacy), not your login identity.",
        );
      }
      throw new Error(`Zulip GET failed (${response.status}): ${responseText}`);
    }

    return responsePayload;
  }

  private async controlPlanePost(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const baseUrl = normalizeBaseUrl(this.config.controlPlaneBaseUrl);
    const url = `${baseUrl}${path}`;
    const signedHeaders = controlPlaneS2sAuthHeaders({
      sharedSecret: this.env.controlPlaneSharedSecret,
      method: "POST",
      endpointOrPath: path,
    });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Control plane request failed (${response.status}): ${body}`,
      );
    }

    return response.json();
  }

  private async sendToZulip(
    url: string,
    body: URLSearchParams,
    method: "POST" | "PATCH" = "POST",
  ): Promise<Record<string, unknown>> {
    const token = Buffer.from(
      `${this.env.zulipUserEmail}:${this.env.zulipUserApiKey}`,
    ).toString("base64");

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${token}`,
      },
      body,
    });

    const responseText = await response.text();
    let responsePayload: unknown = {};
    if (responseText.trim().length > 0) {
      try {
        responsePayload = JSON.parse(responseText) as unknown;
      } catch {
        responsePayload = { raw: responseText };
      }
    }

    if (!response.ok) {
      if (response.status === 401 && /invalid api key/i.test(responseText)) {
        debugWarn(
          "zulip-sync",
          "Zulip returned 401 Invalid API key. Verify ZULIP_USER_EMAIL is your Zulip delivery_email (Settings > Account & privacy), not your login identity.",
        );
      }
      throw new Error(
        `Zulip request failed (${response.status}): ${responseText}`,
      );
    }

    return getRecord(responsePayload);
  }

  private getDedupeStatePath(): string {
    const baseDir = join(
      process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
      "letta-code",
      "zulip-sync",
      sanitizePathComponent(this.config.realmId),
      sanitizePathComponent(this.config.runtimeAgentId),
    );

    return join(baseDir, `${sanitizePathComponent(this.conversationId)}.json`);
  }

  private loadDedupeState(): LocalDedupeState {
    if (this.dedupeStateCache) {
      return this.pruneDedupeState(this.dedupeStateCache);
    }

    const fallback: LocalDedupeState = {
      schemaVersion: DEDUPE_SCHEMA_VERSION,
      realmId: this.config.realmId,
      runtimeAgentId: this.config.runtimeAgentId,
      conversationId: this.conversationId,
      updatedAtMs: Date.now(),
      entries: [],
    };

    if (!existsSync(this.dedupeStatePath)) {
      this.dedupeStateCache = fallback;
      return fallback;
    }

    try {
      const parsed = JSON.parse(
        readFileSync(this.dedupeStatePath, "utf8"),
      ) as unknown;
      const obj = getRecord(parsed);

      const parsedSchema = getFirstNumber(obj, ["schemaVersion"]);
      const realmId = getFirstString(obj, ["realmId"]);
      const runtimeAgentId = getFirstString(obj, ["runtimeAgentId"]);
      const conversationId = getFirstString(obj, ["conversationId"]);

      if (
        parsedSchema !== DEDUPE_SCHEMA_VERSION ||
        realmId !== this.config.realmId ||
        runtimeAgentId !== this.config.runtimeAgentId ||
        conversationId !== this.conversationId
      ) {
        this.dedupeStateCache = fallback;
        return fallback;
      }

      const rawEntries = Array.isArray(obj.entries) ? obj.entries : [];
      const entries: LocalDedupeEntry[] = [];
      for (const item of rawEntries) {
        const entry = getRecord(item);
        const kind = getFirstString(entry, ["kind"]);
        const key = getFirstString(entry, ["key"]);
        const timestampMs = getFirstNumber(entry, ["timestampMs"]);
        if (
          (kind === "mirror" || kind === "bootstrap" || kind === "rename") &&
          key &&
          typeof timestampMs === "number"
        ) {
          entries.push({
            kind,
            key,
            timestampMs,
            zulipMessageId: getFirstNumber(entry, ["zulipMessageId"]),
          });
        }
      }

      this.dedupeStateCache = this.pruneDedupeState({
        schemaVersion: DEDUPE_SCHEMA_VERSION,
        realmId,
        runtimeAgentId,
        conversationId,
        updatedAtMs: getFirstNumber(obj, ["updatedAtMs"]) || Date.now(),
        entries,
      });

      return this.dedupeStateCache;
    } catch (error) {
      debugWarn("zulip-sync", "Failed to read local Zulip dedupe state", error);
      this.dedupeStateCache = fallback;
      return fallback;
    }
  }

  private pruneDedupeState(state: LocalDedupeState): LocalDedupeState {
    const cutoff = Date.now() - DEDUPE_TTL_MS;
    const recent = state.entries
      .filter((entry) => entry.timestampMs >= cutoff)
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .slice(-DEDUPE_MAX_ENTRIES);

    const pruned: LocalDedupeState = {
      ...state,
      updatedAtMs: Date.now(),
      entries: recent,
    };
    this.dedupeStateCache = pruned;
    return pruned;
  }

  private persistDedupeState(state: LocalDedupeState): void {
    try {
      mkdirSync(dirname(this.dedupeStatePath), { recursive: true });
      writeFileSync(
        this.dedupeStatePath,
        JSON.stringify(state, null, 2),
        "utf8",
      );
    } catch (error) {
      debugWarn(
        "zulip-sync",
        "Failed to persist local Zulip dedupe state",
        error,
      );
    }
  }

  private getRecentDedupeEntry(
    kind: LocalDedupeEntry["kind"],
    key: string,
  ): LocalDedupeEntry | null {
    const state = this.loadDedupeState();
    for (let index = state.entries.length - 1; index >= 0; index -= 1) {
      const entry = state.entries[index];
      if (entry && entry.kind === kind && entry.key === key) {
        return entry;
      }
    }
    return null;
  }

  private hasRecentDedupeEntry(
    kind: LocalDedupeEntry["kind"],
    key: string,
  ): boolean {
    return this.getRecentDedupeEntry(kind, key) !== null;
  }

  private recordDedupeEntry(params: {
    kind: LocalDedupeEntry["kind"];
    key: string;
    zulipMessageId?: number;
  }): void {
    const state = this.loadDedupeState();
    const entries = state.entries.filter(
      (entry) => !(entry.kind === params.kind && entry.key === params.key),
    );

    entries.push({
      kind: params.kind,
      key: params.key,
      timestampMs: Date.now(),
      zulipMessageId: params.zulipMessageId,
    });

    const nextState = this.pruneDedupeState({
      ...state,
      entries,
      updatedAtMs: Date.now(),
    });
    this.persistDedupeState(nextState);
  }
}

export function createLocalZulipSyncManager(params: {
  workingDirectory: string;
  agentId: string;
  conversationId: string;
}): LocalZulipSyncManager | null {
  const { workingDirectory, agentId, conversationId } = params;
  if (conversationId === "default") {
    return null;
  }

  const config = loadConfig(workingDirectory);
  if (!config) {
    return null;
  }

  if (config.runtimeAgentId !== agentId) {
    return null;
  }

  const env = readEnv();
  if (!env) {
    return null;
  }

  return new LocalZulipSyncManager(config, env, conversationId);
}
