import { Box } from "ink";
import { memo } from "react";
import { useTokenStreamingConfig } from "../contexts/StreamingTextContext";
import { normalizeStreamingText } from "../helpers/normalizeStreamingText";
import { useTerminalWidth } from "../hooks/useTerminalWidth";
import { MarkdownDisplay } from "./MarkdownDisplay.js";
import { Text } from "./Text";
import { TypewriterGlowText } from "./TypewriterGlowText";

type AssistantLine = {
  kind: "assistant";
  id: string;
  text: string;
  phase: "streaming" | "finished";
};

/**
 * AssistantMessageRich - Rich formatting version with two-column layout
 * This is a direct port from the old letta-code codebase to preserve the exact styling
 *
 * Features:
 * - Left column (2 chars wide) with bullet point marker
 * - Right column with wrapped text content
 * - Lossless newline normalization
 * - Support for markdown rendering (when MarkdownDisplay is available)
 */
export const AssistantMessage = memo(({ line }: { line: AssistantLine }) => {
  const columns = useTerminalWidth();
  const contentWidth = Math.max(0, columns - 2);
  const streamCfg = useTokenStreamingConfig();

  const normalizedText = normalizeStreamingText(line.text);
  if (!normalizedText.trim()) {
    return null;
  }

  const useTypewriterGlow =
    line.phase === "streaming" &&
    streamCfg.enabled &&
    streamCfg.style === "typewriter-glow";

  return (
    <Box flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text>●</Text>
      </Box>
      <Box flexGrow={1} width={contentWidth}>
        {useTypewriterGlow ? (
          <TypewriterGlowText text={normalizedText} />
        ) : (
          <MarkdownDisplay text={normalizedText} hangingIndent={0} />
        )}
      </Box>
    </Box>
  );
});

AssistantMessage.displayName = "AssistantMessage";
