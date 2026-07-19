import { describe, it, expect } from 'vitest';
import { buildMarkdownBlock } from './share-md';

describe('buildMarkdownBlock', () => {
  it('renders a fenced block with the tool name as the first line', () => {
    const block = buildMarkdownBlock('Cron Expression Tester', [
      { label: 'Expression', value: '0 0 * * *' },
      { label: 'Description', value: 'At midnight every day' },
    ]);
    expect(block).toBe(
      '```\nCron Expression Tester\nExpression: 0 0 * * *\nDescription: At midnight every day\n```',
    );
  });

  it('drops fields with an empty or whitespace-only value', () => {
    const block = buildMarkdownBlock('Timestamp Converter', [
      { label: 'Input', value: '1700000000' },
      { label: 'Note', value: '   ' },
      { label: 'ISO 8601', value: '' },
    ]);
    expect(block).toBe('```\nTimestamp Converter\nInput: 1700000000\n```');
  });

  it('produces just the fenced tool name when every field is empty', () => {
    expect(buildMarkdownBlock('MAC Address Formatter', [])).toBe('```\nMAC Address Formatter\n```');
  });

  it('preserves field order', () => {
    const block = buildMarkdownBlock('PromQL Explainer', [
      { label: 'Query', value: 'up{job="api"}' },
      { label: 'Explanation', value: 'Selects the up metric for job api.' },
    ]);
    expect(block.split('\n')).toEqual([
      '```',
      'PromQL Explainer',
      'Query: up{job="api"}',
      'Explanation: Selects the up metric for job api.',
      '```',
    ]);
  });
});
