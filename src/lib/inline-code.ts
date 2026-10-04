/**
 * `backticks` -> <code>. The copy is authored in this repo and contains no user
 * input, but escape anyway so a future edit cannot turn a stray angle bracket in
 * a config example into markup.
 */
export const inlineCode = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
