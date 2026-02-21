import { describe, expect, test } from "bun:test";
import { formatStreamingHeaders } from "../../cli/helpers/streamingHeaderFormat";

describe("formatStreamingHeaders", () => {
  test("strips leading **Header** and marks bold", () => {
    const res = formatStreamingHeaders("**Hello**\nworld");
    expect(res.text).toBe("Hello\nworld");
    expect(res.boldSpans).toEqual([{ start: 0, end: 5 }]);
  });

  test("handles unclosed header without showing opening **", () => {
    const res = formatStreamingHeaders("**Hello\nworld");
    expect(res.text).toBe("Hello\nworld");
    expect(res.boldSpans).toEqual([{ start: 0, end: 5 }]);
  });

  test("handles embedded header after newline", () => {
    const res = formatStreamingHeaders("a\n**B**\nc");
    expect(res.text).toBe("a\nB\nc");
    // bold span starts after "a\n" (2 chars)
    expect(res.boldSpans).toEqual([{ start: 2, end: 3 }]);
  });

  test("ignores inline **bold**", () => {
    const res = formatStreamingHeaders("a **b** c");
    expect(res.text).toBe("a **b** c");
    expect(res.boldSpans).toEqual([]);
  });

  test("hides single trailing * during close arrival", () => {
    const res = formatStreamingHeaders("**Hello*\nnext");
    expect(res.text).toBe("Hello\nnext");
    expect(res.boldSpans).toEqual([{ start: 0, end: 5 }]);
  });

  test("splits glued section heading onto its own line", () => {
    const input =
      "Intro.**Updating code with upstream changes**\n\nNext paragraph";
    const res = formatStreamingHeaders(input);
    expect(res.text).toBe(
      "Intro.\n\nUpdating code with upstream changes\n\nNext paragraph",
    );
    const start = res.text.indexOf("Updating code with upstream changes");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(res.boldSpans).toEqual([
      { start, end: start + "Updating code with upstream changes".length },
    ]);
  });
});
