import { beforeEach, describe, expect, it } from "vitest";

import { getEditableText, setEditableText } from "../sites";
import { addSaved, getSavedTotal } from "../storage";

describe("apply + storage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const store = new Map<string, unknown>();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store.get(key) }),
          set: async (obj: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(obj)) store.set(k, v);
          },
        },
      },
    };
  });

  it("applies optimized text to the field and fires input", () => {
    document.body.innerHTML = '<div contenteditable="true">verbose original text</div>';
    const el = document.querySelector<HTMLElement>('[contenteditable]')!;
    let fired = false;
    el.addEventListener("input", () => (fired = true));
    setEditableText(el, "short text");
    expect(getEditableText(el)).toBe("short text");
    expect(fired).toBe(true);
  });

  it("accumulates the tokens-saved total in storage", async () => {
    expect(await getSavedTotal()).toBe(0);
    await addSaved(10);
    await addSaved(5);
    expect(await getSavedTotal()).toBe(15);
    await addSaved(-3); // negative deltas are clamped
    expect(await getSavedTotal()).toBe(15);
  });
});
