import { describe, expect, mock, test } from "bun:test";
import { recompileAgentSystemPrompt } from "../../agent/modify";

describe("recompileAgentSystemPrompt", () => {
  test("prefers the agent recompile endpoint when available", async () => {
    const agentsRecompileMock = mock(
      (_agentId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt"),
    );
    const conversationsRecompileMock = mock(
      (_conversationId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt-fallback"),
    );
    const client = {
      agents: {
        recompile: agentsRecompileMock,
      },
      conversations: {
        recompile: conversationsRecompileMock,
      },
    };

    const compiledPrompt = await recompileAgentSystemPrompt(
      "conv-123",
      "agent-123",
      true,
      client,
    );

    expect(compiledPrompt).toBe("compiled-system-prompt");
    expect(agentsRecompileMock).toHaveBeenCalledWith("agent-123", {
      dry_run: true,
      update_timestamp: undefined,
    });
    expect(conversationsRecompileMock).not.toHaveBeenCalled();
  });

  test("calls the agent recompile endpoint directly for agent-scoped form", async () => {
    const agentsRecompileMock = mock(
      (_agentId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt"),
    );
    const client = {
      agents: {
        recompile: agentsRecompileMock,
      },
    };

    const compiledPrompt = await recompileAgentSystemPrompt(
      "agent-123",
      {
        updateTimestamp: true,
        dryRun: true,
      },
      client,
    );

    expect(compiledPrompt).toBe("compiled-system-prompt");
    expect(agentsRecompileMock).toHaveBeenCalledWith("agent-123", {
      dry_run: true,
      update_timestamp: true,
    });
  });
  test("calls the conversation recompile endpoint with mapped params", async () => {
    const conversationsRecompileMock = mock(
      (_conversationId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt"),
    );
    const client = {
      conversations: {
        recompile: conversationsRecompileMock,
      },
    };

    const compiledPrompt = await recompileAgentSystemPrompt(
      "conv-123",
      "agent-123",
      true,
      client,
    );

    expect(compiledPrompt).toBe("compiled-system-prompt");
    expect(conversationsRecompileMock).toHaveBeenCalledWith("conv-123", {
      dry_run: true,
      agent_id: "agent-123",
    });
  });

  test("passes agent_id for default conversation recompiles", async () => {
    const conversationsRecompileMock = mock(
      (_conversationId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt"),
    );
    const client = {
      conversations: {
        recompile: conversationsRecompileMock,
      },
    };

    await recompileAgentSystemPrompt("default", "agent-123", undefined, client);

    expect(conversationsRecompileMock).toHaveBeenCalledWith("default", {
      dry_run: undefined,
      agent_id: "agent-123",
    });
  });

  test("passes non-default conversation ids through unchanged", async () => {
    const conversationsRecompileMock = mock(
      (_conversationId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt"),
    );
    const client = {
      conversations: {
        recompile: conversationsRecompileMock,
      },
    };

    await recompileAgentSystemPrompt(
      "['default']",
      "agent-123",
      undefined,
      client,
    );

    expect(conversationsRecompileMock).toHaveBeenCalledWith("['default']", {
      dry_run: undefined,
      agent_id: "agent-123",
    });
  });

  test("throws when conversation recompile has empty agent id", async () => {
    const conversationsRecompileMock = mock(
      (_conversationId: string, _params?: Record<string, unknown>) =>
        Promise.resolve("compiled-system-prompt"),
    );
    const client = {
      conversations: {
        recompile: conversationsRecompileMock,
      },
    };

    await expect(
      recompileAgentSystemPrompt("default", "", undefined, client),
    ).rejects.toThrow("recompileAgentSystemPrompt requires agentId");
    expect(conversationsRecompileMock).not.toHaveBeenCalled();
  });
});
