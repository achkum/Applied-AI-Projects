// Content script: on ANY site, when the user focuses a substantial text field that has content,
// float an "Optimize" button next to it. Clicking previews a diff and applies the optimized text.

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
