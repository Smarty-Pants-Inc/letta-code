import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("footer reasoning regression", () => {
  test("right-side model/reasoning label is not blanked when footer is hidden", () => {
    const path = fileURLToPath(
      new URL("../../cli/components/InputRich.tsx", import.meta.url),
    );
    const source = readFileSync(path, "utf-8");

    // The InputFooter right-side column must NOT use hideFooterContent to
    // replace the label with spaces. The left side may still be hidden.
    const rightColumnStart = source.indexOf(
      "flexShrink={0}\n      >\n",
      source.indexOf("const InputFooter = memo("),
    );
    expect(rightColumnStart).toBeGreaterThanOrEqual(0);

    const rightColumnWindow = source.slice(
      rightColumnStart,
      rightColumnStart + 200,
    );
    expect(rightColumnWindow).not.toMatch(
      /hideFooterContent\s*\?\s*\(\s*<Text>\{" "\.repeat/,
    );

    const leftSideContent = source.slice(
      source.indexOf("<Box flexGrow={1} paddingRight={1}>"),
      source.indexOf(
        "</Box>",
        source.indexOf("<Box flexGrow={1} paddingRight={1}>"),
      ),
    );
    expect(leftSideContent).toContain("hideFooterContent");
  });

  test("deriveReasoningEffort handles chatgpt_oauth provider", () => {
    const path = fileURLToPath(new URL("../../cli/App.tsx", import.meta.url));
    const source = readFileSync(path, "utf-8");

    const fnStart = source.indexOf("function deriveReasoningEffort(");
    const fnEnd = source.indexOf("\n}\n", fnStart);
    expect(fnStart).toBeGreaterThanOrEqual(0);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fnBody = source.slice(fnStart, fnEnd);

    expect(fnBody).toContain('modelSettings.provider_type === "chatgpt_oauth"');
    expect(fnBody).toContain('modelSettings.provider_type === "openai"');
  });
});
