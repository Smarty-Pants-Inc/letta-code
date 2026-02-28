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

export function notifyBridgeTurnBestEffort(notification: BridgeTurnNotification): void {
  const url = env("LETTA_CODE_BRIDGE_WEBHOOK_URL");
  if (!url) return;

  const secret = env("LETTA_CODE_BRIDGE_WEBHOOK_SECRET");
  const allowInsecure = truthy("LETTA_CODE_ALLOW_INSECURE_BRIDGE_WEBHOOK");
  if (!secret && !allowInsecure) {
    return;
  }

  const body: Record<string, unknown> = {
    conversationId: notification.conversationId,
    agentId: notification.agentId,
    lettaRunId: notification.lettaRunId,
    source: notification.source || "smarty",
  };

  // Only include userMessage when auth is configured.
  if (secret && notification.userMessage) {
    body.userMessage = notification.userMessage;
  }
  if (notification.sessionId) {
    body.sessionId = notification.sessionId;
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
}
