import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("system prompt preset restore", () => {
  test("resume UI prefers stored preset recipe over content-only matching", () => {
    const path = fileURLToPath(new URL("../../cli/App.tsx", import.meta.url));
    const source = readFileSync(path, "utf-8");

    expect(source).toContain(
      "const storedPreset = settingsManager.getSystemPromptPreset(agentId);",
    );
    expect(source).toContain('if (storedPreset === "custom") {');
    expect(source).toContain("isKnownPreset(storedPreset)");
    expect(source).toContain("setCurrentSystemPromptId(storedPreset);");
  });
});
