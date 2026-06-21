// Client-side token counting for the file optimizer (the prompt optimizer gets exact counts back
// from the service). Uses the OpenAI o200k tokenizer as a representative estimate.
import { encode } from "gpt-tokenizer";

export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}
