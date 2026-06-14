import { describe, expect, it } from "vitest";

import { diffWords, type DiffOp } from "../diff";

function reconstructBefore(ops: DiffOp[]): string {
  return ops.filter((o) => o.type !== "ins").map((o) => o.text).join("");
}
function reconstructAfter(ops: DiffOp[]): string {
  return ops.filter((o) => o.type !== "del").map((o) => o.text).join("");
}

describe("diffWords", () => {
  it("detects a deletion", () => {
    const ops = diffWords("keep this word here", "keep word here");
    expect(ops.some((o) => o.type === "del" && o.text.trim() === "this")).toBe(true);
  });

  it("detects an insertion", () => {
    const ops = diffWords("keep here", "keep this here");
    expect(ops.some((o) => o.type === "ins" && o.text.trim() === "this")).toBe(true);
  });

  it("detects a replacement (del + ins)", () => {
    const ops = diffWords("the cat sat", "the dog sat");
    expect(ops.some((o) => o.type === "del" && o.text.trim() === "cat")).toBe(true);
    expect(ops.some((o) => o.type === "ins" && o.text.trim() === "dog")).toBe(true);
  });

  it("round-trips both sides exactly", () => {
    const before = "the quick brown fox jumps";
    const after = "the brown fox leaps high";
    const ops = diffWords(before, after);
    expect(reconstructBefore(ops)).toBe(before);
    expect(reconstructAfter(ops)).toBe(after);
  });
});
