import { describe, expect, mock, test } from "bun:test";
import type Letta from "@letta-ai/letta-client";
import type { AgentState } from "@letta-ai/letta-client/resources/agents/agents";
import type { Message } from "@letta-ai/letta-client/resources/agents/messages";
import { getResumeData } from "../../agent/check-approval";

type ResumeAgentState = AgentState & {
  in_context_message_ids?: string[] | null;
};

function makeAgent(overrides: Partial<ResumeAgentState> = {}): AgentState {
  return {
    id: "agent-test",
    message_ids: ["msg-last"],
    ...overrides,
  } as ResumeAgentState;
}

function makeApprovalMessage(id = "msg-last"): Message {
  return {
    id,
    date: new Date().toISOString(),
    message_type: "approval_request_message",
    tool_calls: [
      {
        tool_call_id: "tool-1",
        name: "Bash",
        arguments: '{"command":"echo hi"}',
      },
    ],
  } as unknown as Message;
}

function makeUserMessage(id = "msg-last"): Message {
  return {
    id,
    date: new Date().toISOString(),
    message_type: "user_message",
  } as Message;
}

function makeAssistantMessage(
  id = "msg-assistant",
  date = new Date().toISOString(),
): Message {
  return {
    id,
    date,
    message_type: "assistant_message",
    content: [{ type: "text", text: `assistant:${id}` }],
  } as unknown as Message;
}

function makeDatedUserMessage(
  id = "msg-user",
  date = new Date().toISOString(),
): Message {
  return {
    id,
    date,
    message_type: "user_message",
    content: [{ type: "text", text: `user:${id}` }],
  } as unknown as Message;
}

describe("getResumeData", () => {
  test("includeMessageHistory=false still computes pending approvals without backfill (conversation path)", async () => {
    const conversationsRetrieve = mock(async () => ({
      in_context_message_ids: ["msg-last"],
    }));
    const conversationsList = mock(async () => ({
      getPaginatedItems: () => [],
    }));
    const agentsList = mock(async () => ({ items: [] }));
    const messagesRetrieve = mock(async () => [makeApprovalMessage()]);

    const client = {
      conversations: {
        retrieve: conversationsRetrieve,
        messages: { list: conversationsList },
      },
      agents: { messages: { list: agentsList } },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(client, makeAgent(), "conv-abc", {
      includeMessageHistory: false,
    });

    expect(conversationsRetrieve).toHaveBeenCalledTimes(1);
    expect(messagesRetrieve).toHaveBeenCalledTimes(1);
    expect(conversationsList).toHaveBeenCalledTimes(0);
    expect(resume.pendingApprovals).toHaveLength(1);
    expect(resume.pendingApprovals[0]?.toolName).toBe("Bash");
    expect(resume.messageHistory).toEqual([]);
  });

  test("includeMessageHistory=false skips default-conversation backfill calls", async () => {
    const conversationsRetrieve = mock(async () => ({
      in_context_message_ids: ["msg-last"],
    }));
    const conversationsList = mock(async () => ({
      getPaginatedItems: () => [],
    }));
    const agentsList = mock(async () => ({
      getPaginatedItems: () => [makeApprovalMessage()],
    }));
    const messagesRetrieve = mock(async () => [makeApprovalMessage()]);

    const client = {
      conversations: {
        retrieve: conversationsRetrieve,
        messages: { list: conversationsList },
      },
      agents: { messages: { list: agentsList } },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(
      client,
      makeAgent({
        message_ids: ["msg-last"],
        in_context_message_ids: ["msg-last"],
      }),
      "default",
      { includeMessageHistory: false },
    );

    expect(messagesRetrieve).toHaveBeenCalledTimes(1);
    expect(agentsList).toHaveBeenCalledTimes(0);
    expect(resume.pendingApprovals).toHaveLength(1);
    expect(resume.messageHistory).toEqual([]);
  });

  test("default conversation resume uses in-context ids instead of stale agent.message_ids", async () => {
    const agentsList = mock(async () => ({
      getPaginatedItems: () => [makeApprovalMessage("msg-default-latest")],
    }));
    const messagesRetrieve = mock(async () => [
      makeApprovalMessage("msg-live"),
    ]);

    const client = {
      agents: { messages: { list: agentsList } },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(
      client,
      makeAgent({
        message_ids: ["msg-stale"],
        in_context_message_ids: ["msg-live"],
      }),
      "default",
      { includeMessageHistory: false },
    );

    expect(messagesRetrieve).toHaveBeenCalledWith("msg-live");
    expect(messagesRetrieve).toHaveBeenCalledTimes(1);
    expect(agentsList).toHaveBeenCalledTimes(0);
    expect(resume.pendingApprovals).toHaveLength(1);
    expect(resume.pendingApprovals[0]?.toolCallId).toBe("tool-1");
  });

  test("default conversation falls back to default conversation stream when in-context ids are unavailable", async () => {
    const agentsList = mock(async () => ({
      getPaginatedItems: () => [makeApprovalMessage("msg-default-latest")],
    }));
    const messagesRetrieve = mock(async () => [makeUserMessage("msg-stale")]);

    const client = {
      agents: { messages: { list: agentsList } },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(
      client,
      makeAgent({ in_context_message_ids: [] }),
      "default",
      { includeMessageHistory: false },
    );

    expect(messagesRetrieve).toHaveBeenCalledTimes(0);
    expect(agentsList).toHaveBeenCalledTimes(1);
    expect(resume.pendingApprovals).toHaveLength(1);
    expect(resume.pendingApprovals[0]?.toolCallId).toBe("tool-1");
  });

  test("default behavior keeps backfill enabled when options are omitted", async () => {
    const conversationsRetrieve = mock(async () => ({
      in_context_message_ids: ["msg-last"],
    }));
    const agentsList = mock(async () => ({
      getPaginatedItems: () => [
        makeUserMessage("msg-a"),
        makeUserMessage("msg-b"),
      ],
    }));
    const messagesRetrieve = mock(async () => [makeUserMessage()]);

    const client = {
      conversations: {
        retrieve: conversationsRetrieve,
      },
      agents: { messages: { list: agentsList } },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(
      client,
      makeAgent({ in_context_message_ids: ["msg-last"] }),
      "default",
    );

    expect(messagesRetrieve).toHaveBeenCalledTimes(2);
    expect(agentsList).toHaveBeenCalledTimes(0);
    expect(resume.pendingApprovals).toHaveLength(0);
    expect(resume.messageHistory.length).toBeGreaterThan(0);
  });

  test("explicit conversation backfill prefers in-context ids over conversations.messages.list", async () => {
    const conversationsRetrieve = mock(async () => ({
      in_context_message_ids: ["msg-1", "msg-2"],
    }));
    const conversationsList = mock(async () => ({
      getPaginatedItems: () => [makeUserMessage("stale-list-msg")],
    }));
    const messagesRetrieve = mock(async (id: string) => {
      if (id === "msg-1") {
        return [makeDatedUserMessage("msg-1", "2026-03-20T22:00:00.000Z")];
      }
      if (id === "msg-2") {
        return [makeAssistantMessage("msg-2", "2026-03-20T22:01:00.000Z")];
      }
      return [];
    });

    const client = {
      conversations: {
        retrieve: conversationsRetrieve,
        messages: { list: conversationsList },
      },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(client, makeAgent(), "conv-abc");
    const retrievedIds = messagesRetrieve.mock.calls
      .map((call) => call[0])
      .sort();

    expect(conversationsRetrieve).toHaveBeenCalledTimes(1);
    expect(conversationsList).toHaveBeenCalledTimes(0);
    expect(messagesRetrieve).toHaveBeenCalledTimes(3);
    expect(retrievedIds).toEqual(["msg-1", "msg-2", "msg-2"]);
    expect(resume.messageHistory.map((msg) => msg.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);
  });

  test("default conversation backfill prefers in-context ids over default message list", async () => {
    const agentsList = mock(async () => ({
      getPaginatedItems: () => [makeUserMessage("stale-default-msg")],
    }));
    const messagesRetrieve = mock(async (id: string) => {
      if (id === "msg-1") {
        return [makeDatedUserMessage("msg-1", "2026-03-20T22:00:00.000Z")];
      }
      if (id === "msg-2") {
        return [makeAssistantMessage("msg-2", "2026-03-20T22:01:00.000Z")];
      }
      return [];
    });

    const client = {
      agents: { messages: { list: agentsList } },
      messages: { retrieve: messagesRetrieve },
    } as unknown as Letta;

    const resume = await getResumeData(
      client,
      makeAgent({ in_context_message_ids: ["msg-1", "msg-2"] }),
      "default",
    );
    const retrievedIds = messagesRetrieve.mock.calls
      .map((call) => call[0])
      .sort();

    expect(agentsList).toHaveBeenCalledTimes(0);
    expect(messagesRetrieve).toHaveBeenCalledTimes(3);
    expect(retrievedIds).toEqual(["msg-1", "msg-2", "msg-2"]);
    expect(resume.messageHistory.map((msg) => msg.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);
  });
});
