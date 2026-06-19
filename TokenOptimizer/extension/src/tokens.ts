// Token counting in the browser. Exact for OpenAI via gpt-tokenizer (o200k_base); the Anthropic
// heuristic is ported EXACTLY from the Python engine (src/token_optimizer/tokens.py, T03).

import { encode } from "gpt-tokenizer/encoding/o200k_base";

export type Provider = "anthropic" | "openai";

export function providerFor(model: string): Provider {
  const m = model.toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || /^o\d/.test(m)) return "openai";
  return "anthropic";
}

// Claude publishes no local tokenizer; estimate with the real o200k_base BPE scaled by an
// empirical correction (matches src/token_optimizer/providers/tokenizers.py exactly).
const CLAUDE_FACTOR = 1.15;

export function anthropicHeuristic(text: string): number {
  if (!text) return 0;
  return Math.round(encode(text).length * CLAUDE_FACTOR);
}

export function countTokens(
  text: string,
  model: string
): { count: number; exact: boolean } {
  if (!text) return { count: 0, exact: providerFor(model) === "openai" };
  if (providerFor(model) === "openai") {
    return { count: encode(text).length, exact: true };
  }
  return { count: anthropicHeuristic(text), exact: false };
}
