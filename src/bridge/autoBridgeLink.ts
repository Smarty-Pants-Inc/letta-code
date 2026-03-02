import { type ChildProcess, spawn } from "node:child_process";
import net from "node:net";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

function truthy(name: string): boolean {
  const v = env(name).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function intEnv(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function findFreeLocalPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : null;
      server.close((err) => {
        if (err) reject(err);
        else if (typeof port === "number" && port > 0) resolve(port);
        else reject(new Error("failed to allocate free port"));
      });
    });
  });
}

type TunnelState = {
  sshHost: string;
  remotePort: number;
  localPort: number;
  proc: ChildProcess;
};

let tunnel: TunnelState | null = null;
let tunnelInit: Promise<TunnelState> | null = null;
let exitHookInstalled = false;

async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function ensureTunnel(params: {
  sshHost: string;
  remotePort: number;
  localPort?: number;
}): Promise<TunnelState> {
  if (
    tunnel &&
    tunnel.sshHost === params.sshHost &&
    tunnel.remotePort === params.remotePort
  ) {
    return tunnel;
  }

  if (tunnelInit) return await tunnelInit;

  tunnelInit = (async () => {
    const localPort = params.localPort ?? (await findFreeLocalPort());

    const args = [
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=2",
      "-L",
      `${localPort}:127.0.0.1:${params.remotePort}`,
      params.sshHost,
    ];

    const proc = spawn("ssh", args, {
      // Keep stdin as a pipe so Node types remain non-null-stream compatible.
      // We never write to it, but typing `ignore` would make stdin `null`.
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    if (!exitHookInstalled) {
      exitHookInstalled = true;
      const cleanup = () => {
        try {
          tunnel?.proc.kill();
        } catch {
          // ignore
        }
      };
      process.once("exit", cleanup);
      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
    }

    // Best-effort: wait briefly for the forwarded HTTP health endpoint.
    const baseUrl = `http://127.0.0.1:${localPort}`;
    const ok = await waitForHealth(baseUrl, 3500);
    if (!ok) {
      try {
        proc.kill();
      } catch {
        // ignore
      }
      throw new Error("bridge SSH tunnel did not become healthy in time");
    }

    const next: TunnelState = {
      sshHost: params.sshHost,
      remotePort: params.remotePort,
      localPort,
      proc,
    };
    tunnel = next;
    return next;
  })();

  try {
    return await tunnelInit;
  } finally {
    tunnelInit = null;
  }
}

type LinkResolveResponse =
  | {
      ok: true;
      linked: true;
      conversationId: string;
      threadId: string;
      sessionId: string;
      streamId: number;
      topic: string;
    }
  | { ok: true; linked: false; conversationId: string }
  | { ok: false; error: string };

async function resolveLink(params: {
  baseUrl: string;
  secret: string;
  conversationId: string;
  agentId?: string;
}): Promise<LinkResolveResponse> {
  const res = await fetch(`${params.baseUrl}/link/resolve`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.secret}`,
    },
    body: JSON.stringify({
      conversationId: params.conversationId,
      agentId: params.agentId,
    }),
    signal: AbortSignal.timeout(5000),
  });

  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || typeof json !== "object") {
    return {
      ok: false,
      error: `link resolve failed: ${res.status} ${text || res.statusText}`,
    };
  }

  return json as LinkResolveResponse;
}

const seenKeys = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export async function autoBridgeLinkIfEnabled(params: {
  agentId: string;
  conversationId: string;
}): Promise<void> {
  const enabled = truthy("LETTA_CODE_BRIDGE_AUTO");
  if (!enabled) return;

  const agentId = String(params.agentId || "").trim();
  const conversationId = String(params.conversationId || "").trim();
  if (!agentId || !conversationId || conversationId === "default") return;

  const key = `${agentId}:${conversationId}`;
  if (seenKeys.has(key)) return;

  const existing = inFlight.get(key);
  if (existing) return await existing;

  const run = (async () => {
    try {
      const sshHost = env("LETTA_CODE_BRIDGE_SSH_HOST");
      const secret = env("LETTA_CODE_BRIDGE_WEBHOOK_SECRET");
      if (!sshHost || !secret) return;

      const remotePort = intEnv("LETTA_CODE_BRIDGE_REMOTE_PORT", 8799);
      const forcedLocalPortRaw = env("LETTA_CODE_BRIDGE_LOCAL_PORT");
      const forcedLocalPort = forcedLocalPortRaw
        ? Number.parseInt(forcedLocalPortRaw, 10)
        : NaN;
      const localPort =
        Number.isFinite(forcedLocalPort) && forcedLocalPort > 0
          ? forcedLocalPort
          : undefined;

      const t = await ensureTunnel({ sshHost, remotePort, localPort });
      const baseUrl = `http://127.0.0.1:${t.localPort}`;

      // Ensure notifyBridgeTurnBestEffort can fire.
      process.env.LETTA_CODE_BRIDGE_WEBHOOK_URL = `${baseUrl}/notify/turn`;
      process.env.LETTA_CODE_BRIDGE_WEBHOOK_SECRET = secret;

      const out = await resolveLink({
        baseUrl,
        secret,
        conversationId,
        agentId,
      });

      if (out.ok && out.linked) {
        const sessionId = String(out.sessionId || "").trim();
        if (sessionId) {
          process.env.LETTA_CODE_BRIDGE_SESSION_ID = sessionId;
        }
      }

      seenKeys.add(key);
    } catch {
      // Best-effort only.
    }
  })();

  inFlight.set(key, run);
  try {
    await run;
  } finally {
    inFlight.delete(key);
  }
}
