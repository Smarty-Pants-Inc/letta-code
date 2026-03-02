/**
 * Utilities for sending messages to an agent via conversations
 **/

import type { Stream } from "@letta-ai/letta-client/core/streaming";
import type { MessageCreate } from "@letta-ai/letta-client/resources/agents/agents";
import type {
  ApprovalCreate,
  LettaStreamingResponse,
} from "@letta-ai/letta-client/resources/agents/messages";
import {
  captureToolExecutionContext,
  waitForToolsetReady,
} from "../tools/manager";
import { isTimingsEnabled } from "../utils/timing";
import { getClient } from "./client";

const streamRequestStartTimes = new WeakMap<object, number>();
const streamToolContextIds = new WeakMap<object, string>();
export type StreamRequestContext = {
  conversationId: string;
  resolvedConversationId: string;
  agentId: string | null;
  requestStartedAtMs: number;
  userMessage?: string;
};
const streamRequestContexts = new WeakMap<object, StreamRequestContext>();

export function getStreamRequestStartTime(
  stream: Stream<LettaStreamingResponse>,
): number | undefined {
  return streamRequestStartTimes.get(stream as object);
}

export function getStreamToolContextId(
  stream: Stream<LettaStreamingResponse>,
): string | null {
  return streamToolContextIds.get(stream as object) ?? null;
}

export function getStreamRequestContext(
  stream: Stream<LettaStreamingResponse>,
): StreamRequestContext | undefined {
  return streamRequestContexts.get(stream as object);
}

/**
 * Send a message to a conversation and return a streaming response.
 * Uses the conversations API for all conversations.
 *
 * For the "default" conversation (agent's primary message history without
 * an explicit conversation object), pass conversationId="default" and
 * provide agentId in opts. The server accepts agent IDs as the
 * conversation_id path parameter for agent-direct messaging.
 */
export async function sendMessageStream(
  conversationId: string,
  messages: Array<MessageCreate | ApprovalCreate>,
  opts: {
    streamTokens?: boolean;
    background?: boolean;
    agentId?: string; // Required when conversationId is "default"
  } = { streamTokens: true, background: true },
  // Disable SDK retries by default - state management happens outside the stream,
  // so retries would violate idempotency and create race conditions
  requestOptions: { maxRetries?: number; signal?: AbortSignal } = {
    maxRetries: 0,
  },
): Promise<Stream<LettaStreamingResponse>> {
  const requestStartTime = isTimingsEnabled() ? performance.now() : undefined;
  const requestStartedAtMs = Date.now();
  const client = await getClient();

  // Wait for any in-progress toolset switch to complete before reading tools
  // This prevents sending messages with stale tools during a switch
  await waitForToolsetReady();
  const { clientTools, contextId } = captureToolExecutionContext();

  // For "default" conversation, pass the agent ID to the conversations endpoint.
  // The server accepts agent-* IDs for agent-direct messaging.
  const resolvedConversationId =
    conversationId === "default" ? opts.agentId : conversationId;

  const userMessage = (() => {
    // Best-effort: capture the last user message content for external observability.
    // This should never affect correctness.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (!m || typeof m !== "object") continue;
      const rec = m as Record<string, unknown>;
      const role = typeof rec.role === "string" ? rec.role : null;
      const messageType =
        typeof rec.message_type === "string" ? rec.message_type : null;
      const isUser = role === "user" || messageType === "user_message";
      if (!isUser) continue;

      const content = rec.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((p) => {
            if (typeof p === "string") return p;
            if (p && typeof p === "object") {
              const part = p as Record<string, unknown>;
              const text = part.text;
              if (typeof text === "string") return text;
            }
            return "";
          })
          .join("");
      }
    }
    return undefined;
  })();

  if (!resolvedConversationId) {
    throw new Error(
      "agentId is required in opts when using default conversation",
    );
  }

  const enableThinkingEnv = String(
    process.env.LETTA_ENABLE_THINKING || process.env.ENABLE_THINKING || "",
  )
    .trim()
    .toLowerCase();
  const enableThinking =
    enableThinkingEnv === "1" ||
    enableThinkingEnv === "true" ||
    enableThinkingEnv === "yes";

  const includeReturnMessageTypes = enableThinking
    ? ([
        "assistant_message",
        "reasoning_message",
        "hidden_reasoning_message",
        "tool_call_message",
        "tool_return_message",
        "approval_request_message",
        "approval_response_message",
        "summary_message",
        "event_message",
      ] as string[])
    : undefined;

  if (process.env.DEBUG) {
    console.log(
      `[DEBUG] sendMessageStream: conversationId=${conversationId}, resolved=${resolvedConversationId}`,
    );
  }

  const body: any = {
    messages: messages,
    streaming: true,
    stream_tokens: opts.streamTokens ?? true,
    background: opts.background ?? true,
    client_tools: clientTools,
    include_compaction_messages: true,
    include_return_message_types: includeReturnMessageTypes,
    ...(enableThinking ? { enable_thinking: "true" } : {}),
  };

  const stream = await client.conversations.messages.create(
    resolvedConversationId,
    body,
    requestOptions,
  );

  if (requestStartTime !== undefined) {
    streamRequestStartTimes.set(stream as object, requestStartTime);
  }
  streamToolContextIds.set(stream as object, contextId);
  streamRequestContexts.set(stream as object, {
    conversationId,
    resolvedConversationId,
    agentId: opts.agentId ?? null,
    requestStartedAtMs,
    userMessage,
  });

  return stream;
}
