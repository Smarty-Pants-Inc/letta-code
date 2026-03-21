import { describe, expect, test } from "bun:test";
import { normalizeStreamingText } from "../../cli/helpers/normalizeStreamingText";

describe("normalizeStreamingText", () => {
  test("normalizes CRLF and CR to LF", () => {
    expect(normalizeStreamingText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  test("preserves leading and repeated blank lines", () => {
    expect(normalizeStreamingText("\n\n\nHeading\n\nBody")).toBe(
      "\n\n\nHeading\n\nBody",
    );
  });
});
