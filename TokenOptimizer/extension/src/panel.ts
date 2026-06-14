// Shadow-DOM compression panel: word-level diff, token counts, Apply / Cancel. The shadow root
// isolates our styles from the host page (and vice versa), so inline styles here are intentional.

import { diffWords, type DiffOp } from "./diff";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderDiffHtml(ops: DiffOp[]): string {
  return ops
    .map((op) => {
      const safe = escapeHtml(op.text);
      if (op.type === "del") return `<del>${safe}</del>`;
      if (op.type === "ins") return `<ins>${safe}</ins>`;
      return `<span>${safe}</span>`;
    })
    .join("");
}

export type PanelOptions = {
  before: string;
  after: string;
  tokensBefore: number;
  tokensAfter: number;
  onApply: (text: string) => void;
};

const STYLE = `
  :host { all: initial; }
  .ts-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                font-family: ui-sans-serif, system-ui, sans-serif; }
  .ts-card { background: #fff; color: #111; max-width: 640px; width: 90%; max-height: 80vh;
             overflow: auto; border-radius: 12px; padding: 1.25rem; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
  .ts-diff { line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .ts-diff del { background: #fde2e2; color: #b00020; text-decoration: line-through; }
  .ts-diff ins { background: #e2f7e9; text-decoration: none; }
  .ts-meta { margin: 0.75rem 0; font-size: 0.9rem; opacity: 0.7; }
  .ts-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  button { font: inherit; padding: 0.4rem 0.9rem; border-radius: 8px; border: 1px solid #ccc; cursor: pointer; }
  .ts-apply { background: #111; color: #fff; border-color: #111; }
`;

export function showOptimizationPanel(opts: PanelOptions): HTMLElement {
  const host = document.createElement("div");
  host.dataset.tokenSaverPanel = "1";
  const root = host.attachShadow({ mode: "open" });

  const saved = opts.tokensBefore - opts.tokensAfter;
  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="ts-overlay">
      <div class="ts-card">
        <div class="ts-diff">${renderDiffHtml(diffWords(opts.before, opts.after))}</div>
        <p class="ts-meta">${opts.tokensBefore} → ${opts.tokensAfter} tokens (saved ${saved})</p>
        <div class="ts-actions">
          <button class="ts-cancel">Cancel</button>
          <button class="ts-apply">Apply</button>
        </div>
      </div>
    </div>`;

  const close = () => host.remove();
  root.querySelector(".ts-cancel")?.addEventListener("click", close);
  root.querySelector(".ts-apply")?.addEventListener("click", () => {
    opts.onApply(opts.after);
    close();
  });
  root.querySelector(".ts-overlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });

  document.body.appendChild(host);
  return host;
}
