import { beforeEach, describe, expect, it } from "vitest";

import { compressDeep, resetPipelineForTests, type ScorePipeline } from "../classifier";
import { compress as ruleCompress } from "../ruleCompressor";

// Fake pipeline: deterministic scores by index (lower index = lower keep-probability).
function fakePipeline(scoreFn: (word: string, i: number) => number = (_, i) => i): ScorePipeline {
  return async (words) => words.map((w, i) => scoreFn(w, i));
}

describe("classifier (in-browser, fake pipeline)", () => {
  beforeEach(() => resetPipelineForTests());

  it("respects the keep ratio", async () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${String.fromCharCode(97 + i)}`);
    const { text } = await compressDeep(words.join(" "), 0.5, async () => fakePipeline());
    const ratio = text.split(/\s+/).filter(Boolean).length / words.length;
    expect(Math.abs(ratio - 0.5)).toBeLessThanOrEqual(0.05);
  });

  it("keeps code fences byte-identical", async () => {
    const fence = "```\nconst x = 1;\n```";
    const text = `remove many of these fairly unimportant filler words here now ${fence} more words`;
    const { text: out } = await compressDeep(text, 0.3, async () => fakePipeline());
    expect(out).toContain(fence);
  });

  it("always keeps numbers and acronyms", async () => {
    const text = "the value is 42 and the system uses HTTP and TCP for everything here always";
    const { text: out } = await compressDeep(text, 0.1, async () => fakePipeline(() => 0));
    expect(out).toContain("42");
    expect(out).toContain("HTTP");
    expect(out).toContain("TCP");
  });

  it("progressive flow: rule result first, classifier refines", async () => {
    const original = "I was wondering if you could basically remove some unimportant filler words here.";
    const ruled = ruleCompress(original).text;
    expect(ruled.length).toBeLessThan(original.length); // instant rule result
    const { text: deep } = await compressDeep(ruled, 0.5, async () => fakePipeline());
    expect(deep.length).toBeLessThanOrEqual(ruled.length); // classifier refines further
  });

  it("works offline with the default heuristic (no factory injected)", async () => {
    const { text, dropped } = await compressDeep(
      "the cat sat on the mat very quietly indeed today",
      0.5
    );
    expect(dropped).toBeGreaterThan(0);
    expect(text).toContain("cat"); // content word kept over function words
  });

  it("only builds the pipeline once", async () => {
    let built = 0;
    const factory = async () => {
      built++;
      return fakePipeline();
    };
    await compressDeep("alpha beta gamma delta", 0.5, factory);
    await compressDeep("epsilon zeta eta theta", 0.5, factory);
    expect(built).toBe(1);
  });
});
