import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("subagent max_steps error propagation", () => {
  test("non-zero exit path prefers parsed finalError over generic exit code", () => {
    const managerPath = fileURLToPath(
      new URL("../../agent/subagents/manager.ts", import.meta.url),
    );
    const source = readFileSync(managerPath, "utf-8");

    expect(source).toContain(
      'const spawnErrorMessage = spawnError ? getErrorMessage(spawnError) : "";',
    );
    // Avoid `${...}` linting in a single string literal.
    expect(source).toContain(
      "stderr || spawnErrorMessage || `Subagent exited with code " +
        "${" +
        "exitCode" +
        "}" +
        "`",
    );
    expect(source).toContain(
      "error: state.finalError?.trim() || fallbackError",
    );
  });
});
