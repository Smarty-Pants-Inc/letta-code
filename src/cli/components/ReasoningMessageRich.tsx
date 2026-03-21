import { Box } from "ink";
import { memo } from "react";
import { useTokenStreamingConfig } from "../contexts/StreamingTextContext";
import { normalizeStreamingText } from "../helpers/normalizeStreamingText";
import { useTerminalWidth } from "../hooks/useTerminalWidth";
import { MarkdownDisplay } from "./MarkdownDisplay.js";
import { Text } from "./Text";
import { TypewriterGlowText } from "./TypewriterGlowText";

type ReasoningLine = {
  kind: "reasoning";
  id: string;
  text: string;
  phase: "streaming" | "finished";
};

/**
 * ReasoningMessageRich - Rich formatting version with special reasoning layout
 * This is a direct port from the old letta-code codebase to preserve the exact styling
 *
 * Features:
 * - Header row with "✻" symbol and "Thinking…" text
 * - Reasoning content indented with 2 spaces
 * - Full markdown rendering with dimmed colors
 * - Lossless newline normalization
 */
export const ReasoningMessage = memo(({ line }: { line: ReasoningLine }) => {
  const columns = useTerminalWidth();
  const contentWidth = Math.max(0, columns - 2);
  const streamCfg = useTokenStreamingConfig();

  const normalizedText = normalizeStreamingText(line.text);

  const useTypewriterGlow =
    line.phase === "streaming" &&
    streamCfg.enabled &&
    streamCfg.style === "typewriter-glow";

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text dimColor>✻</Text>
        </Box>
        <Box flexGrow={1} width={contentWidth}>
          <Text dimColor>Thinking…</Text>
        </Box>
      </Box>
      <Box height={1} />
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text> </Text>
        </Box>
        <Box flexGrow={1} width={contentWidth}>
          {useTypewriterGlow ? (
            <TypewriterGlowText text={normalizedText} dimColor={true} />
          ) : (
            <MarkdownDisplay text={normalizedText} dimColor={true} />
          )}
        </Box>
      </Box>
    </Box>
  );
});

ReasoningMessage.displayName = "ReasoningMessage";
