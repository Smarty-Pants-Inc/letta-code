import type { Letta } from "@letta-ai/letta-client";
import { APIError } from "@letta-ai/letta-client/core/error";

/**
 * Ensure an agent has all memory blocks required for conversation-isolated labels.
 *
 * Letta's conversation creation with `isolated_block_labels` requires that the
 * base agent already has blocks with those labels attached.
 */
export async function ensureIsolatedBlockLabels(
  client: Letta,
  agentId: string,
  labels: readonly string[],
): Promise<void> {
  for (const label of labels) {
    try {
      await client.agents.blocks.retrieve(label, { agent_id: agentId });
      continue;
    } catch (err) {
      if (
        !(err instanceof APIError) ||
        (err.status !== 404 && err.status !== 422)
      ) {
        throw err;
      }
    }

    // Missing: create an empty block and attach it.
    const block = await client.blocks.create({
      label,
      value: "",
      description: "Conversation-scoped memory (auto-managed).",
    });
    await client.agents.blocks.attach(block.id, { agent_id: agentId });
  }
}

export async function ensureConversationMemoryBlock(
  client: Letta,
  agentId: string,
): Promise<void> {
  const { CONVERSATION_MEMORY_BLOCK_LABEL } = await import("./memory");
  await ensureIsolatedBlockLabels(client, agentId, [
    CONVERSATION_MEMORY_BLOCK_LABEL,
  ]);
}
