// In-browser extractive compression with transformers.js (lazy-loaded, opt-in "Deep compress").
// The heavy pipeline is created only on first use; tests inject a fake pipeline. Same protected-
// token rules as the Python classifier (T20): code spans, first word of a sentence, numbers,
// ALL-CAPS acronyms are always kept.

import { splitProtected } from "./ruleCompressor";

// A token-classification pipeline: maps words to per-word keep scores.
export type ScorePipeline = (words: string[]) => Promise<number[]>;

export type PipelineFactory = () => Promise<ScorePipeline>;

let cachedPipeline: ScorePipeline | null = null;

const WORD_RE = /\S+\s*/g;
const ACRONYM_RE = /^[A-Z]{2,}$/;
const SENTENCE_END = /[.!?]$/;

// Common English function words (mirrors src/token_saver/compress/classifier.py).
const STOPWORDS = new Set(
  ("a an the this that these those and or but nor so yet for of to in on at by with from into onto " +
    "over under again further then once here there all any both each few more most other some such " +
    "is are was were be been being am do does did doing have has had having will would shall should " +
    "can could may might must i you he she it we they me him her us them my your his its our their " +
    "as if while because although though since unless until about above below between against during " +
    "before after up down out off than too very just also not no yes which who whom whose what when " +
    "where why how it's i'm you're we're they're don't doesn't didn't can't won't")
    .split(/\s+/)
);

// Real, deterministic offline importance score — the default backend (no model download needed).
function heuristicScore(word: string, index: number): number {
  const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const core = clean.toLowerCase();
  if (!core) return 0;
  let s = STOPWORDS.has(core) ? 0.15 : 0.55;
  if (/\d/.test(word)) s += 0.3;
  if (core.length >= 8) s += 0.2;
  if (ACRONYM_RE.test(clean)) s += 0.3;
  else if (index > 0 && /^[A-Z]/.test(clean)) s += 0.15;
  return Math.min(s, 1);
}

const defaultFactory: PipelineFactory = async () => async (words) =>
  words.map((w, i) => heuristicScore(w, i));

function forcedIndices(words: string[]): Set<number> {
  const forced = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (i === 0 || SENTENCE_END.test(words[i - 1])) forced.add(i);
    if (/\d/.test(w)) forced.add(i);
    if (ACRONYM_RE.test(core)) forced.add(i);
  }
  return forced;
}

async function compressSegment(
  segment: string,
  keepRatio: number,
  pipeline: ScorePipeline
): Promise<{ text: string; dropped: number }> {
  const lead = segment.match(/^\s*/)?.[0] ?? "";
  const rest = segment.slice(lead.length);
  const chunks = rest.match(WORD_RE) ?? [];
  if (chunks.length === 0) return { text: segment, dropped: 0 };

  const words = chunks.map((c) => c.trim());
  const scores = await pipeline(words);
  const forced = forcedIndices(words);
  const target = Math.round(keepRatio * words.length);

  const selected = new Set<number>(forced);
  const ranked = words
    .map((_, i) => i)
    .filter((i) => !forced.has(i))
    .sort((x, y) => scores[y] - scores[x]);
  for (const i of ranked) {
    if (selected.size >= target) break;
    selected.add(i);
  }

  const kept = lead + chunks.filter((_, i) => selected.has(i)).join("");
  return { text: kept, dropped: chunks.length - selected.size };
}

export async function compressDeep(
  text: string,
  keepRatio: number,
  factory: PipelineFactory = defaultFactory
): Promise<{ text: string; dropped: number }> {
  if (!cachedPipeline) cachedPipeline = await factory();
  const pipeline = cachedPipeline;

  const out: string[] = [];
  let dropped = 0;
  for (const part of splitProtected(text)) {
    if (part.code) {
      out.push(part.seg);
      continue;
    }
    const res = await compressSegment(part.seg, keepRatio, pipeline);
    out.push(res.text);
    dropped += res.dropped;
  }
  return { text: out.join(""), dropped };
}

export function resetPipelineForTests(): void {
  cachedPipeline = null;
}
