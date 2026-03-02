/**
 * Best-effort notification to an external bridge (e.g. Zulip bridge) that a new
 * Letta run has started, so it can stream canonical run events from the Letta API.
 *
 * This is intentionally fire-and-forget and should never break the CLI.
 */

export type BridgeTurnNotification = {
  conversationId: string;
  agentId: string;
  lettaRunId: string;
  userMessage?: string;
  // If true, the bridge should not mirror userMessage as a bot message.
  suppressUserMessageMirror?: boolean;
  sessionId?: string;
  source?: string;
};

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function truthy(name: string): boolean {
  const v = env(name).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function sanitizeExternalPrompt(content: string): string {
  // Avoid leaking system-reminder blocks into Zulip as the human.
  return String(content || "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

async function getZulipUserCredentials(): Promise<
  { email: string; apiKey: string } | null
> {
  const envEmail = env("LETTA_CODE_ZULIP_USER_EMAIL") || env("ZULIP_USER_EMAIL");
  const email = envEmail.trim();
  if (!email) return null;

  const envKey = env("LETTA_CODE_ZULIP_USER_API_KEY") || env("ZULIP_USER_API_KEY");
  if (envKey.trim()) {
    return { email, apiKey: envKey.trim() };
  }

  try {
    const { getZulipUserApiKey } = await import("../utils/secrets");
    const apiKey = (await getZulipUserApiKey()) || "";
    if (apiKey.trim()) {
      return { email, apiKey: apiKey.trim() };
    }
  } catch {
    // Best-effort only.
  }

  return null;
}

async function postUserPromptToZulip(args: {
  realmUrl: string;
  streamId: number;
  topic: string;
  content: string;
  email: string;
  apiKey: string;
}): Promise<boolean> {
  const base = String(args.realmUrl || "").replace(/\/+$/, "");
  if (!base) return false;
  const url = `${base}/api/v1/messages`;

  const params = new URLSearchParams({
    type: "stream",
    to: String(Math.trunc(args.streamId)),
    topic: String(args.topic || ""),
    content: String(args.content || ""),
  });

  const auth = Buffer.from(`${args.email}:${args.apiKey}`, "utf-8").toString(
    "base64",
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const postedUserPromptRunIds = new Set<string>();

export function notifyBridgeTurnBestEffort(
  notification: BridgeTurnNotification,
): void {
  // By default we only notify for the top-level agent. Task/subagent processes can
  // generate many runs and will spam Zulip + trip rate limits if they inherit the
  // same bridge webhook env.
  const isSubagent =
    String(process.env.LETTA_CODE_AGENT_ROLE || "").toLowerCase() ===
    "subagent";
  const allowSubagents = truthy("LETTA_CODE_BRIDGE_NOTIFY_SUBAGENTS");
  if (isSubagent && !allowSubagents) return;

  const shouldPostAsUser = truthy("LETTA_CODE_ZULIP_POST_AS_USER");


  const maybePostUserPromptAsUser = async (): Promise<boolean> => {
    if (!shouldPostAsUser) return false;

    const userMessage = notification.userMessage;
    if (!userMessage) return false;

    const runId = notification.lettaRunId;
    if (postedUserPromptRunIds.has(runId)) return false;
    postedUserPromptRunIds.add(runId);

    try {
      const { autoBridgeLinkIfEnabled, getResolvedZulipLink } = await import(
        "./autoBridgeLink"
      );
      await autoBridgeLinkIfEnabled({
        agentId: notification.agentId,
        conversationId: notification.conversationId,
      });

      const link = getResolvedZulipLink(notification.conversationId);
      if (!link) return false;

      const creds = await getZulipUserCredentials();
      if (!creds) return false;

      const cleaned = sanitizeExternalPrompt(userMessage);
      if (!cleaned) return false;

      return await postUserPromptToZulip({
        realmUrl: link.realmUrl,
        streamId: link.streamId,
        topic: link.topic,
        content: cleaned,
        email: creds.email,
        apiKey: creds.apiKey,
      });
    } catch {
      return false;
    }
  };

  const sendOnce = (url: string, suppressUserMessageMirror: boolean): void => {
    const secret = env("LETTA_CODE_BRIDGE_WEBHOOK_SECRET");
    const allowInsecure = truthy("LETTA_CODE_ALLOW_INSECURE_BRIDGE_WEBHOOK");
    if (!secret && !allowInsecure) {
      return;
    }



    const sessionId =
      notification.sessionId ||
      String(process.env.LETTA_CODE_BRIDGE_SESSION_ID || "").trim() ||
      undefined;

    const body: Record<string, unknown> = {
      conversationId: notification.conversationId,
      agentId: notification.agentId,
      lettaRunId: notification.lettaRunId,
      source: notification.source || "smarty",
    };

    if (suppressUserMessageMirror) {
      body.suppressUserMessageMirror = true;
    }

    // Only include userMessage when auth is configured.
    if (secret && notification.userMessage) {
      body.userMessage = notification.userMessage;
    }
    if (sessionId) {
      body.sessionId = sessionId;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    // Fire-and-forget: keep it fast and never block the TUI.
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 1500);

    void fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    })
      .catch(() => {
        // Best-effort only.
      })
      .finally(() => {
        clearTimeout(timeout);
        ac.abort();
      });
  };

  const url = env("LETTA_CODE_BRIDGE_WEBHOOK_URL");
  if (url) {
    void (async () => {
      const suppress = await maybePostUserPromptAsUser();
      sendOnce(url, suppress);
    })();
    return;
  }

  // If auto-linking is enabled, attempt to establish the tunnel + resolve the
  // Zulip sessionId before dropping the notification.
  if (!truthy("LETTA_CODE_BRIDGE_AUTO")) return;

  void import("./autoBridgeLink")
    .then(({ autoBridgeLinkIfEnabled }) =>
      autoBridgeLinkIfEnabled({
        agentId: notification.agentId,
        conversationId: notification.conversationId,
      }),
    )
    .catch(() => {
      // Best-effort only.
    })
    .finally(() => {
      const nextUrl = env("LETTA_CODE_BRIDGE_WEBHOOK_URL");
      if (nextUrl) {
        void (async () => {
          const suppress = await maybePostUserPromptAsUser();
          sendOnce(nextUrl, suppress);
        })();
      }
    });
}

