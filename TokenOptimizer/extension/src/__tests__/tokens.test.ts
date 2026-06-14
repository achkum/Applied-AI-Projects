import { describe, expect, it } from "vitest";

import vectorsData from "../../../shared/token_test_vectors.json";
import { anthropicHeuristic, countTokens, providerFor } from "../tokens";

const vectors = (vectorsData as { vectors: { text: string; anthropic: number }[] }).vectors;

describe("tokens", () => {
  it("maps models to providers", () => {
    expect(providerFor("gpt-4o")).toBe("openai");
    expect(providerFor("o3-mini")).toBe("openai");
    expect(providerFor("claude-sonnet-4-5")).toBe("anthropic");
    expect(providerFor("mystery")).toBe("anthropic");
  });

  it("matches the Python Anthropic heuristic within ±1", () => {
    for (const v of vectors) {
      expect(Math.abs(anthropicHeuristic(v.text) - v.anthropic)).toBeLessThanOrEqual(1);
    }
  });

  it("counts OpenAI exactly and Anthropic inexactly", () => {
    expect(countTokens("hello world", "gpt-4o").exact).toBe(true);
    expect(countTokens("hello world", "claude-sonnet-4-5").exact).toBe(false);
    expect(countTokens("", "gpt-4o").count).toBe(0);
  });
});
