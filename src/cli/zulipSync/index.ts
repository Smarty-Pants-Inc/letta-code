import { existsSync, readFileSync } from "node:fs";
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
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
  const controlPlaneSharedSecret =
    process.env.SMARTY_PANTS_ZULIP_FACADE_SHARED_SECRET;

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
    parts.push("**Paul → Letta**\n" + userText);
  }

  if (assistantText) {
    parts.push("**Letta → Paul**\n" + assistantText);
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
  }

  public async mirrorTurn(args: {
    userText?: string;
    assistantText?: string;
  }): Promise<void> {
    try {
      const content = formatMirroredTurn(args);
      if (!content) return;

      const thread = await this.resolveThread();
      if (!thread) return;

      await this.sendToZulip(
        `${normalizeBaseUrl(this.config.realmUrl)}/api/v1/messages`,
        new URLSearchParams({
          type: "stream",
          to: thread.streamName,
          topic: thread.topic,
          content,
        }),
      );
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
          binding_id: bindingId,
          runtimeAgentId: this.config.runtimeAgentId,
          runtime_agent_id: this.config.runtimeAgentId,
          conversationId: this.conversationId,
          conversation_id: this.conversationId,
          realmId: this.config.realmId,
          realm_id: this.config.realmId,
        },
      );

      const resolved = getRecord(resolveResult);
      const threadId = getFirstString(resolved, [
        "threadId",
        "thread_id",
        "zulipThreadId",
        "runtimeConversationThreadId",
      ]);

      if (!threadId) {
        const bootstrapped = await this.bootstrapThreadWithDedupe(bindingId);
        this.resolvedThread = bootstrapped;
        return bootstrapped;
      }

      const threadResult = await this.controlPlanePost("/s2s/zulip/threads/get", {
        bindingId,
        binding_id: bindingId,
        threadId,
        thread_id: threadId,
        realmId: this.config.realmId,
        realm_id: this.config.realmId,
      });

      const threadData = getRecord(threadResult);
      const topic =
        getFirstString(threadData, ["topic", "topicName", "threadTopic"]) ||
        getFirstString(resolved, ["topic", "topicName", "threadTopic"]);

      if (!topic) {
        this.resolvedThread = null;
        return null;
      }

      const streamName =
        getFirstString(threadData, ["streamName", "stream_name"]) ||
        this.config.streamName;

      this.resolvedThread = {
        bindingId,
        threadId,
        streamName,
        topic,
        anchorMessageId: getFirstNumber(threadData, [
          "anchorMessageId",
          "anchor_message_id",
          "firstMessageId",
          "first_message_id",
          "messageId",
          "message_id",
        ]),
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
    const anchor = await this.sendToZulip(
      `${normalizeBaseUrl(this.config.realmUrl)}/api/v1/messages`,
      new URLSearchParams({
        type: "stream",
        to: this.config.streamName,
        topic,
        content: `Thread bootstrap anchor for Letta conversation ${this.conversationId}`,
      }),
    );

    const anchorMessageId = getFirstNumber(anchor, ["id", "message_id", "messageId"]);
    if (!anchorMessageId) {
      throw new Error("Zulip bootstrap did not return an anchor message id");
    }

    const resolvedThread = getRecord(
      await this.controlPlanePost("/s2s/zulip/threads/resolve", {
        bindingId,
        binding_id: bindingId,
        runtimeAgentId: this.config.runtimeAgentId,
        runtime_agent_id: this.config.runtimeAgentId,
        realmId: this.config.realmId,
        realm_id: this.config.realmId,
        streamName: this.config.streamName,
        stream_name: this.config.streamName,
        topic,
        anchorMessageId,
        anchor_message_id: anchorMessageId,
      }),
    );

    const threadId = getFirstString(resolvedThread, [
      "threadId",
      "thread_id",
      "zulipThreadId",
      "id",
    ]);
    if (!threadId) {
      throw new Error("Control plane thread resolve did not return thread id");
    }

    await this.controlPlanePost("/s2s/zulip/runtime_conversation/upsert", {
      bindingId,
      binding_id: bindingId,
      runtimeAgentId: this.config.runtimeAgentId,
      runtime_agent_id: this.config.runtimeAgentId,
      conversationId: this.conversationId,
      conversation_id: this.conversationId,
      realmId: this.config.realmId,
      realm_id: this.config.realmId,
      threadId,
      thread_id: threadId,
      streamName: this.config.streamName,
      stream_name: this.config.streamName,
      topic,
      anchorMessageId,
      anchor_message_id: anchorMessageId,
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
      runtimeAgentId: this.config.runtimeAgentId,
      runtime_agent_id: this.config.runtimeAgentId,
      realmId: this.config.realmId,
      realm_id: this.config.realmId,
    });

    const bindings = getArray(listResult);
    for (const item of bindings) {
      const binding = getRecord(item);

      // Control-plane bindings/list returns smartyd.agentId.
      const smartyd = getRecord(binding.smartyd);
      const runtimeAgentId = getFirstString(smartyd, [
        "agentId",
        "agent_id",
        "runtimeAgentId",
        "runtime_agent_id",
      ]);
      if (runtimeAgentId !== this.config.runtimeAgentId) continue;

      const bindingId = getFirstString(binding, [
        "bindingId",
        "binding_id",
        "id",
      ]);
      if (bindingId) return bindingId;
    }

    return null;
  }

  private async controlPlanePost(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const baseUrl = normalizeBaseUrl(this.config.controlPlaneBaseUrl);
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.env.controlPlaneSharedSecret}`,
        "x-smarty-pants-secret": this.env.controlPlaneSharedSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Control plane request failed (${response.status}): ${body}`);
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
      throw new Error(`Zulip request failed (${response.status}): ${responseText}`);
    }

    return getRecord(responsePayload);
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
