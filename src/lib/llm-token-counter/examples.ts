/** Example chips. examples[0] seeds the server-rendered result panel. */
export interface Example {
  label: string;
  input: string;
}

export const examples: Example[] = [
  {
    label: 'English prose',
    input:
      'Tokenizers split text into pieces the model has seen before. Common English words are usually a single token, while rare words, code and other languages break into several. That is why the same prompt can cost more in one language than another.',
  },
  {
    label: 'JSON config',
    input: '{\n  "model": "gpt-4o",\n  "temperature": 0.2,\n  "max_tokens": 512,\n  "messages": [\n    { "role": "system", "content": "You are a terse SRE assistant." },\n    { "role": "user", "content": "Why is pod web-7f9c in CrashLoopBackOff?" }\n  ]\n}',
  },
  {
    label: 'Emoji, CJK and a URL',
    input: 'Deploy done 🚀✅ — 日本語のテキスト、中文文本 and 한국어 cost more tokens. Docs: https://opscanopy.com/llm-token-counter/?ref=readme#t',
  },
];
