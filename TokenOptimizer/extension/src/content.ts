// Content script: on ANY site, when the user focuses a substantial text field that has content,
// float an "Optimize" button next to it. Clicking compresses the text with the shared model
// service (its URL is set in the extension options) and previews a diff before applying.
// (File optimization lives in the web app, not the extension.)

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
const KEEP_RATE = 0.8; // keep 80% — gentle; drops clear filler without gutting short prompts
// Extractive compression only helps when there's redundancy to remove. Below this it just damages
// the prompt for little gain, so we skip it. Tune to taste.
const MIN_COMPRESS_TOKENS = 50;
const LABEL = "⇣ Optimize";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]; // braille spinner frames

let button: HTMLButtonElement | null = null;
let target: HTMLElement | null = null;
let spinTimer: number | null = null;

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
  button.textContent = LABEL;
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
type CompressOutcome = { ok: true; text: string } | { ok: false; reason: string };

function serviceCompress(text: string, model: string): Promise<CompressOutcome> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "ts-compress", text, rate: KEEP_RATE, model },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, reason: chrome.runtime.lastError.message ?? "messaging error" });
          } else if (!resp?.ok) {
            resolve({ ok: false, reason: resp?.reason ?? "unknown" });
          } else {
            resolve({ ok: true, text: resp.result.text });
          }
        },
      );
    } catch (e) {
      resolve({ ok: false, reason: String(e) });
    }
  });
}

function flashButton(message: string): void {
  const b = ensureButton();
  b.textContent = message;
  setTimeout(() => {
    if (spinTimer === null) b.textContent = LABEL;
  }, 2500);
}

function startSpinner(b: HTMLButtonElement): void {
  let i = 0;
  b.disabled = true;
  b.style.cursor = "default";
  b.textContent = `${SPINNER[0]} Optimizing…`;
  spinTimer = window.setInterval(() => {
    i = (i + 1) % SPINNER.length;
    b.textContent = `${SPINNER[i]} Optimizing…`;
  }, 80);
}

function stopSpinner(b: HTMLButtonElement): void {
  if (spinTimer !== null) {
    clearInterval(spinTimer);
    spinTimer = null;
  }
  b.disabled = false;
  b.style.cursor = "pointer";
  b.textContent = LABEL;
}

async function runOptimize(el: HTMLElement): Promise<void> {
  if (spinTimer !== null) return; // already processing
  const before = getEditableText(el);
  if (!before.trim()) return;
  const model = modelForHost();
  const tokensBefore = countTokens(before, model).count;
  if (tokensBefore < MIN_COMPRESS_TOKENS) {
    flashButton("Already concise — nothing to compress");
    return;
  }
  const b = ensureButton();
  startSpinner(b);
  const outcome = await serviceCompress(before, model);
  stopSpinner(b);
  if (!outcome.ok) {
    if (outcome.reason === "no-endpoint") {
      flashButton("⚠ Set the service URL in options");
    } else {
      console.warn("[Token Optimizer] compression request failed:", outcome.reason);
      flashButton("⚠ Service error — see console");
    }
    return;
  }
  const after = outcome.text;
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
