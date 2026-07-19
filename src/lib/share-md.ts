/**
 * Build a fenced Markdown block from a tool name + ordered label/value pairs
 * — pasteable into a runbook, PR description, incident ticket, or Slack
 * thread. Fields with an empty/whitespace-only value are dropped so a
 * partial result never pastes empty "Label: " lines.
 */
export function buildMarkdownBlock(
  toolName: string,
  fields: Array<{ label: string; value: string }>,
): string {
  const lines = fields
    .filter((f) => typeof f.value === 'string' && f.value.trim().length > 0)
    .map((f) => `${f.label}: ${f.value}`);
  return ['```', toolName, ...lines, '```'].join('\n');
}
