export function normalizeStreamingText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
