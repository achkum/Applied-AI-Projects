import { beforeEach, describe, expect, it } from "vitest";

import {
  getEditableText,
  isEditableElement,
  isOptimizable,
  modelForHost,
  setEditableText,
} from "../sites";

function rect(el: HTMLElement, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({ width, height, top: 100, left: 0, right: width, bottom: 100 + height, x: 0, y: 100, toJSON() {} }) as DOMRect;
}

describe("editable-field helpers (works on any site)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("recognizes editable elements", () => {
    document.body.innerHTML =
      '<textarea id="ta"></textarea>' +
      '<div contenteditable="true" id="ce"></div>' +
      '<input type="text" id="tx">' +
      '<input type="password" id="pw">' +
      '<div id="plain"></div>' +
      '<textarea id="ro" readonly></textarea>';
    const byId = (id: string) => document.getElementById(id)!;
    expect(isEditableElement(byId("ta"))).toBe(true);
    expect(isEditableElement(byId("ce"))).toBe(true);
    expect(isEditableElement(byId("tx"))).toBe(true);
    expect(isEditableElement(byId("pw"))).toBe(false);
    expect(isEditableElement(byId("plain"))).toBe(false);
    expect(isEditableElement(byId("ro"))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });

  it("only offers on substantial fields", () => {
    document.body.innerHTML = '<textarea id="big"></textarea><textarea id="tiny"></textarea>';
    const big = document.getElementById("big")!;
    const tiny = document.getElementById("tiny")!;
    rect(big, 400, 80);
    rect(tiny, 60, 18);
    expect(isOptimizable(big)).toBe(true);
    expect(isOptimizable(tiny)).toBe(false);
  });

  it("reads/writes text and fires input on write", () => {
    document.body.innerHTML = '<div contenteditable="true">old</div>';
    const el = document.querySelector<HTMLElement>('[contenteditable]')!;
    let fired = false;
    el.addEventListener("input", () => (fired = true));
    setEditableText(el, "new text");
    expect(getEditableText(el)).toBe("new text");
    expect(fired).toBe(true);
  });

  it("maps host to a token model with a sensible default", () => {
    expect(modelForHost("claude.ai")).toBe("claude-sonnet-4-5");
    expect(modelForHost("chatgpt.com")).toBe("gpt-4o");
    expect(modelForHost("example.com")).toBe("gpt-4o");
  });
});
