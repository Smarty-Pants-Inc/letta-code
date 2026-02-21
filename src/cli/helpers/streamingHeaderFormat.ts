export type BoldSpan = { start: number; end: number };

function looksLikeSectionHeading(text: string): boolean {
  const t = text.trim();
  if (t.length < 6 || t.length > 80) return false;
  // Heuristic: reasoning headings are usually Title Case-ish multi-word phrases.
  if (!/[A-Z]/.test(t[0] ?? "")) return false;
  if (!t.includes(" ")) return false;
  return true;
}

/**
 * Some models emit a "heading" marker glued to the previous sentence:
 *
 *   ...clarity.**Updating code with upstream changes**\n\nNext paragraph
 *
 * During streaming, this can look like a standalone heading due to terminal
 * wrapping; later, when markdown is fully parsed, the asterisks disappear but
 * the heading stays glued. We normalize this to a standalone heading line.
 */
export function normalizeHeadingBoundaries(input: string): string {
  if (!input) return input;

  const lines = input.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    // Preserve indentation if present.
    const m = line.match(/^[\t ]*/);
    const leading = m?.[0] ?? "";
    const rest = line.slice(leading.length);

    // If a **Heading** appears at end-of-line but is not at line-start, treat it
    // as a standalone section heading.
    const inline = rest.match(/^(.*?)(\*\*([^*\n]{3,200})\*\*)[\t ]*$/);
    if (inline) {
      const prefix = inline[1] ?? "";
      const rawHeading = inline[2] ?? "";
      const headingText = inline[3] ?? "";

      if (prefix.trim().length > 0 && looksLikeSectionHeading(headingText)) {
        out.push(leading + prefix.trimEnd());
        out.push("");
        out.push(leading + rawHeading);
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

function mergeSpans(spans: BoldSpan[]): BoldSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans]
    .filter(
      (s) =>
        Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
    )
    .sort((a, b) => a.start - b.start);
  const out: BoldSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (!last || s.start > last.end) {
      out.push({ start: s.start, end: s.end });
    } else {
      last.end = Math.max(last.end, s.end);
    }
  }
  return out;
}

/**
 * Minimal streaming-time formatting.
 *
 * We avoid full markdown parsing while streaming, but we *do* special-case the
 * common reasoning pattern where a section heading is emitted as:
 *
 *   **Heading Title**
 *
 * This function:
 * - removes the `**` markers for any line that starts with optional whitespace
 *   then `**`.
 * - marks the heading text (until the closing `**` if present, else until EOL)
 *   as bold.
 *
 * Notes:
 * - Only triggers at line start (or after a newline). Inline `**bold**` is not
 *   handled.
 * - If only one trailing `*` has arrived (half of the closing `**`), we hide it
 *   to avoid flicker.
 */
export function formatStreamingHeaders(input: string): {
  text: string;
  boldSpans: BoldSpan[];
} {
  if (!input) return { text: "", boldSpans: [] };

  const normalized = normalizeHeadingBoundaries(input);
  const lines = normalized.split("\n");
  let out = "";
  const spans: BoldSpan[] = [];

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li] ?? "";
    const base = out.length;

    // Allow indentation; headings produced by models sometimes include it.
    const m = line.match(/^[\t ]*/);
    const leading = m?.[0] ?? "";
    const rest = line.slice(leading.length);

    if (rest.startsWith("**")) {
      const afterOpen = rest.slice(2);
      const closeIdx = afterOpen.indexOf("**");

      if (closeIdx === -1) {
        // No closing yet; hide a single trailing `*` to avoid half-close flicker.
        let headerText = afterOpen;
        if (headerText.endsWith("*") && !headerText.endsWith("**")) {
          headerText = headerText.slice(0, -1);
        }
        out += leading + headerText;
        spans.push({
          start: base + leading.length,
          end: base + leading.length + headerText.length,
        });
      } else {
        const headerText = afterOpen.slice(0, closeIdx);
        const afterClose = afterOpen.slice(closeIdx + 2);
        out += leading + headerText + afterClose;
        spans.push({
          start: base + leading.length,
          end: base + leading.length + headerText.length,
        });
      }
    } else {
      out += line;
    }

    if (li < lines.length - 1) out += "\n";
  }

  return { text: out, boldSpans: mergeSpans(spans) };
}
