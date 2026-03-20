import { describe, expect, test } from "bun:test";
import { APIError } from "@letta-ai/letta-client/core/error";
import { ensureIsolatedBlockLabels } from "../../agent/isolatedBlocks";

describe("ensureIsolatedBlockLabels", () => {
  test("creates and attaches missing block when agent lookup returns 400 INVALID_ARGUMENT", async () => {
    const calls: string[] = [];
    const client = {
      agents: {
        blocks: {
          retrieve: async (label: string) => {
            calls.push(`retrieve:${label}`);
            throw new APIError(
              400,
              {
                detail:
                  "INVALID_ARGUMENT: Block with label 'conversation_memory' not found on agent 'agent-123'",
              },
              undefined,
              new Headers(),
            );
          },
          attach: async (blockId: string) => {
            calls.push(`attach:${blockId}`);
          },
        },
      },
      blocks: {
        create: async ({ label }: { label: string }) => {
          calls.push(`create:${label}`);
          return { id: "block-123" };
        },
      },
    };

    await ensureIsolatedBlockLabels(client as never, "agent-123", [
      "conversation_memory",
    ]);

    expect(calls).toEqual([
      "retrieve:conversation_memory",
      "create:conversation_memory",
      "attach:block-123",
    ]);
  });
});