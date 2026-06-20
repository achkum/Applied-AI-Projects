// Content script: on ANY site, when the user focuses a substantial text field that has content,
// float an "Optimize" button next to it. Clicking compresses the text with the shared model
// service (its URL is set in the extension options) and previews a diff before applying.
// Attachment compression (lossless, local) runs automatically on file inputs.

import { isOptimizableAttachment, normalizeAttachment } from "./attachments";
import { showOptimizationPanel } from "./panel";
import {
  editableRoot,
  getEditableText,
  isEditableElement,
  isOptimizable,
  modelForHost,
  setEditableText,
} from "./sites";
import { addSaved } from "./storage";
import { countTokens } from "./tokens";

const BUTTON_ID = "token-optimizer-button";
const MIN_CHARS = 40;
const KEEP_RATE = 0.6;

let button: HTMLButtonElement | null = null;
let target: HTMLElement | null = null;

const PILL = {
  position: "fixed",
  zIndex: "2147483646",
  borderRadius: "9999px",
  border: "1px solid rgba(0,0,0,0.15)",
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  font: "12px ui-sans-serif, system-ui, sans-serif",
  display: "none",
} as const;

function ensureButton(): HTMLButtonElement {
  if (button) return button;
  button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "⇣ Optimize";
  button.title = "Compress this text with Token Optimizer";
  Object.assign(button.style, PILL, { padding: "0.3rem 0.6rem", background: "#111", color: "#fff" });
  button.addEventListener("mousedown", (e) => e.preventDefault());
  button.addEventListener("click", () => {
    if (target) void runOptimize(target);
  });
  document.body.appendChild(button);
  return button;
}

function position(el: HTMLElement): void {
  const b = ensureButton();
  const rect = el.getBoundingClientRect();
  b.style.top = `${Math.max(8, rect.top + 6)}px`;
  b.style.right = `${Math.max(8, window.innerWidth - rect.right + 6)}px`;
}

function showFor(el: HTMLElement): void {
  target = el;
  position(el);
  ensureButton().style.display = "block";
}

function hide(): void {
  if (button) button.style.display = "none";
  target = null;
}

function evaluate(raw: EventTarget | null): void {
  if (isEditableElement(raw)) {
    const el = editableRoot(raw);
    if (isOptimizable(el) && getEditableText(el).trim().length >= MIN_CHARS) {
      showFor(el);
      return;
    }
    if (el === target) hide();
  }
}

// Ask the background worker to compress via the shared model service. Returns null on any failure
// (no endpoint configured in options, or the service is unreachable).
function serviceCompress(text: string, model: string): Promise<{ text: string } | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "ts-compress", text, rate: KEEP_RATE, model },
        (resp) => resolve(chrome.runtime.lastError || !resp?.ok ? null : resp.result),
      );
    } catch {
      resolve(null);
    }
  });
}

function flashButton(message: string): void {
  const b = ensureButton();
  const original = b.textContent;
  b.textContent = message;
  setTimeout(() => {
    b.textContent = original;
  }, 2500);
}

async function runOptimize(el: HTMLElement): Promise<void> {
  const before = getEditableText(el);
  if (!before.trim()) return;
  const model = modelForHost();
  const result = await serviceCompress(before, model);
  if (!result) {
    flashButton("⚠ Set the service URL in options");
    return;
  }
  const after = result.text;
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
window.addEventListener("scroll", () => target && position(target), true);
window.addEventListener("resize", () => target && position(target));

chrome.runtime?.onMessage?.addListener((msg) => {
  if (msg?.type === "optimize-selection" && target) void runOptimize(target);
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
    marker.__tsDone = false;
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
