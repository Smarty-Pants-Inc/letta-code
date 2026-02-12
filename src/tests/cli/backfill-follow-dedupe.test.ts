import { describe, expect, test } from "bun:test";
import type { Message } from "@letta-ai/letta-client/resources/agents/messages";

import { createBuffers } from "../../cli/helpers/accumulator";
import { appendMessagesToBuffers } from "../../cli/helpers/backfill";

// These tests cover a subtle follow-mode case: polling can re-deliver the same
// tool call message (or variants of it). Incremental ingestion must be
// idempotent so we don't allocate a new line for the same tool_call_id.

function toolCallMsg(overrides: {
  id: string;
  tool_calls: Array<{ tool_call_id: string; name: string; arguments: string }>;
}): Message {
  return {
    id: overrides.id,
    date: new Date().toISOString(),
    message_type: "tool_call_message",
    tool_calls: overrides.tool_calls,
  } as unknown as Message;
}

describe("appendMessagesToBuffers (follow)", () => {
  test("is idempotent for repeated tool_call_message", () => {
    const b = createBuffers();
    const msg = toolCallMsg({
      id: "msg-1",
      tool_calls: [
        {
          tool_call_id: "call-1",
          name: "Bash",
          arguments: '{"command":"echo hi"}',
        },
      ],
    });

    appendMessagesToBuffers(b, [msg]);
    expect(
      [...b.byId.values()].filter((ln) => ln.kind === "tool_call"),
    ).toHaveLength(1);

    // Re-deliver the exact same message.
    appendMessagesToBuffers(b, [msg]);
    expect(
      [...b.byId.values()].filter((ln) => ln.kind === "tool_call"),
    ).toHaveLength(1);
  });

  test("is idempotent for parallel tool calls in a single message", () => {
    const b = createBuffers();
    const msg = toolCallMsg({
      id: "msg-2",
      tool_calls: [
        {
          tool_call_id: "call-1",
          name: "Bash",
          arguments: '{"command":"echo one"}',
        },
        {
          tool_call_id: "call-2",
          name: "Bash",
          arguments: '{"command":"echo two"}',
        },
      ],
    });

    appendMessagesToBuffers(b, [msg]);
    expect(
      [...b.byId.values()].filter((ln) => ln.kind === "tool_call"),
    ).toHaveLength(2);

    // Re-deliver; should update the existing two lines, not create new ones.
    appendMessagesToBuffers(b, [msg]);
    expect(
      [...b.byId.values()].filter((ln) => ln.kind === "tool_call"),
    ).toHaveLength(2);
  });
});
