// Generic editable-field helpers. The extension works on ANY site — it offers to optimize whatever
// substantial text field the user is editing, not just chat apps. Per-host token models are used
// only to size the savings estimate.

const MODEL_BY_HOST: Record<string, string> = {
  "claude.ai": "claude-sonnet-4-5",
  "chatgpt.com": "gpt-4o",
  "gemini.google.com": "gemini-1.5-pro",
  "chat.mistral.ai": "mistral-large-latest",
};

export function modelForHost(host: string = location.hostname): string {
  return MODEL_BY_HOST[host] ?? "gpt-4o";
}

export function isEditableElement(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return el.type === "text" && !el.disabled && !el.readOnly;
  }
  const ce = el.getAttribute("contenteditable");
  return ce === "" || ce === "true";
}

// Only offer on fields big enough to hold a real prompt — skip search boxes / one-line inputs.
export function isOptimizable(el: EventTarget | null): el is HTMLElement {
  if (!isEditableElement(el)) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width >= 120 && rect.height >= 28;
}

export function getEditableText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  return el.innerText ?? el.textContent ?? "";
}

export function setEditableText(el: HTMLElement, text: string): void {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.value = text;
  } else {
    el.textContent = text;
  }
  // Dispatch input so the host app's framework (React, etc.) picks up the change.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
