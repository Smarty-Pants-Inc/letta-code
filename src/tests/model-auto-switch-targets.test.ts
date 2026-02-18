import { describe, expect, test } from "bun:test";

import { resolveModelAutoSwitchTargets } from "../agent/model";

describe("resolveModelAutoSwitchTargets", () => {
  test("routes OpenAI GPT models to codex + letta-codex", () => {
    const result = resolveModelAutoSwitchTargets("openai/gpt-5.2");
    expect(result).toEqual({
      toolset: "codex",
      systemPromptId: "letta-codex",
    });
  });

  test("routes chatgpt-plus-pro codex models to codex + letta-codex", () => {
    const result = resolveModelAutoSwitchTargets(
      "chatgpt-plus-pro/gpt-5.3-codex",
    );
    expect(result).toEqual({
      toolset: "codex",
      systemPromptId: "letta-codex",
    });
  });

  test("routes Gemini models to gemini + letta-gemini", () => {
    const result = resolveModelAutoSwitchTargets(
      "google_ai/gemini-3-pro-preview",
    );
    expect(result).toEqual({
      toolset: "gemini",
      systemPromptId: "letta-gemini",
    });
  });

  test("routes unknown non-gpt non-gemini models to default + letta-claude", () => {
    const result = resolveModelAutoSwitchTargets("anthropic/claude-sonnet-4-6");
    expect(result).toEqual({
      toolset: "default",
      systemPromptId: "letta-claude",
    });
  });
});
