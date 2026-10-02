/**
 * wireCodeCopy — binds the Copy button that rehype-code-header server-renders
 * in every Markdown code block's figure cap (`figure.code-fig [data-code-copy]`).
 * One copy of the behaviour for BlogPost, GuidePost and MissionDay, which each
 * used to create and position their own button inside the <pre>.
 *
 * Fallback kept: a <pre> that reached the page without its .code-fig (raw
 * HTML in a Markdown file, or a build without the plugin) still gets the old
 * injected button, top-right (global.css `.rich-text pre > .rich-code-copy`).
 *
 * Idempotent (`data-copy-bound` / `data-copy-ready`), so the templates can call
 * it on every `astro:page-load`. Copies the <code>'s text, which is exactly the
 * fence body; the cap's label and button text are outside it.
 */
import { copyTextToClipboard } from './clipboard';

export interface CodeCopyLabels {
  /** Button text at rest ("Copy"). */
  copy: string;
  /** Button text for 2s after a successful copy ("Copied"). */
  copied: string;
  /** Accessible name of an injected fallback button. */
  aria: string;
}

function bindCopy(btn: HTMLButtonElement, pre: HTMLElement, labels: CodeCopyLabels): void {
  let resetTimer: number | undefined;
  btn.addEventListener('click', async () => {
    const text = (pre.querySelector('code') ?? pre).textContent ?? '';
    if (await copyTextToClipboard(text)) {
      btn.textContent = labels.copied;
      btn.dataset.copied = 'true';
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        btn.textContent = labels.copy;
        delete btn.dataset.copied;
      }, 2000);
    }
  });
}

export function wireCodeCopy(root: ParentNode, labels: CodeCopyLabels): void {
  root.querySelectorAll<HTMLButtonElement>('[data-code-copy]').forEach((btn) => {
    if (btn.dataset.copyBound) return;
    const pre = btn.closest('.code-fig')?.querySelector<HTMLElement>('pre');
    if (!pre) return;
    btn.dataset.copyBound = 'true';
    bindCopy(btn, pre, labels);
  });

  root.querySelectorAll<HTMLPreElement>('pre').forEach((pre) => {
    if (pre.closest('.code-fig') || pre.dataset.copyReady) return;
    pre.dataset.copyReady = 'true';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rich-code-copy';
    btn.textContent = labels.copy;
    btn.setAttribute('aria-label', labels.aria);
    pre.appendChild(btn);
    bindCopy(btn, pre, labels);
  });
}
