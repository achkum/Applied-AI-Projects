// Content script: on ANY site, when the user focuses a substantial text field that has content,
// float an "Optimize" button next to it. Clicking previews a diff and applies the optimized text.

import { isOptimizableAttachment, normalizeAttachment } from "./attachments";
import { showOptimizationPanel } from "./panel";
import { compress } from "./ruleCompressor";
import {
  getEditableText,
  isOptimizable,
  modelForHost,
  setEditableText,
} from "./sites";
import { addSaved } from "./storage";
import { countTokens } from "./tokens";

const BUTTON_ID = "token-saver-button";
const MIN_CHARS = 40; // only offer once there's enough text to be worth optimizing

let button: HTMLButtonElement | null = null;
let target: HTMLElement | null = null;

function ensureButton(): HTMLButtonElement {
  if (button) return button;
  button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "⇣ Optimize";
  button.title = "Optimize this text with Token Saver (local)";
  Object.assign(button.style, {
    position: "fixed",
    zIndex: "2147483646",
    padding: "0.3rem 0.6rem",
    borderRadius: "9999px",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "#111",
    color: "#fff",
    font: "12px ui-sans-serif, system-ui, sans-serif",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    display: "none",
  });
  // Keep the field focused when pressing the button.
  button.addEventListener("mousedown", (e) => e.preventDefault());
  button.addEventListener("click", () => {
    if (target) runOptimize(target);
  });
  document.body.appendChild(button);
  return button;
}

function positionButton(el: HTMLElement): void {
  const b = ensureButton();
  const rect = el.getBoundingClientRect();
  const top = Math.max(8, rect.top + 6);
  const right = Math.max(8, window.innerWidth - rect.right + 6);
  b.style.top = `${top}px`;
  b.style.right = `${right}px`;
}

function showFor(el: HTMLElement): void {
  target = el;
  positionButton(el);
  ensureButton().style.display = "block";
}

function hide(): void {
  if (button) button.style.display = "none";
  target = null;
}

function evaluate(el: EventTarget | null): void {
  if (isOptimizable(el) && getEditableText(el).trim().length >= MIN_CHARS) {
    showFor(el);
  } else if (el === target) {
    hide();
  }
}

function runOptimize(el: HTMLElement): void {
  const before = getEditableText(el);
  if (!before.trim()) return;
  const { text: after } = compress(before);
  const model = modelForHost();
  const tokensBefore = countTokens(before, model).count;
  const tokensAfter = countTokens(after, model).count;
  showOptimizationPanel({
    before,
    after,
    tokensBefore,
    tokensAfter,
    onApply: (finalText) => {
      setEditableText(el, finalText);
      void addSaved(tokensBefore - tokensAfter);
    },
  });
}

document.addEventListener("focusin", (e) => evaluate(e.target));
document.addEventListener("input", (e) => evaluate(e.target));
document.addEventListener(
  "focusout",
  () => setTimeout(() => {
    if (document.activeElement !== button) hide();
  }, 150),
);
window.addEventListener("scroll", () => target && positionButton(target), true);
window.addEventListener("resize", () => target && positionButton(target));

// Right-click "Optimize selection" → optimize the focused field (best-effort).
chrome.runtime?.onMessage?.addListener((msg) => {
  if (msg?.type === "optimize-selection" && target) runOptimize(target);
});

// Attachment compression: when a file is selected via a standard file input on any site,
// losslessly optimize text formats (minify JSON, compact CSV, clean text) and swap in the
// optimized file before the page reads it. Best-effort — custom/drag-drop uploaders may not be
// supported; binary formats (PDF/Word) are left untouched (handled by the Python library/MCP).
async function onFileChange(e: Event): Promise<void> {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.files?.length) return;
  const marker = input as unknown as { __tsDone?: boolean };
  if (marker.__tsDone) {
    marker.__tsDone = false; // our own re-dispatched event — let it pass through
    return;
  }
  const files = Array.from(input.files);
  if (!files.some((f) => isOptimizableAttachment(f.name)) || typeof DataTransfer === "undefined") {
    return;
  }
  e.stopImmediatePropagation();
  e.preventDefault();

  const out: File[] = [];
  for (const f of files) {
    if (isOptimizableAttachment(f.name)) {
      const { text, changed } = normalizeAttachment(f.name, await f.text());
      out.push(changed ? new File([text], f.name, { type: f.type }) : f);
    } else {
      out.push(f);
    }
  }
  const dt = new DataTransfer();
  out.forEach((f) => dt.items.add(f));
  input.files = dt.files;
  marker.__tsDone = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

document.addEventListener("change", (e) => void onFileChange(e), true);
