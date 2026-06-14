// Rule-based prompt compression, semantics identical to the Python engine (T19). Driven by the
// SAME shared/compression_rules.json. Prose rules never touch fenced code blocks or inline
// backtick spans; rules apply in file order.

import rulesData from "../../shared/compression_rules.json";

type Rule = {
  id: string;
  type: "delete" | "replace" | "dedup_sentences" | "squeeze_ws";
  tier?: "safe" | "lossy";
  pattern?: string;
  replacement?: string;
  flags?: string;
  scope?: string;
};

const RULES = (rulesData as { rules: Rule[] }).rules;

// Protect code fences, inline backticks, and double-/smart-quoted spans (matches the Python engine).
const SPLIT_RE = /(```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|“[^”\n]*”)/g;
const SENTENCE_RE = /[^.!?]*[.!?]+|\S+$/g;

export type RuleChange = { id: string; count: number };

export function splitProtected(text: string): { code: boolean; seg: string }[] {
  const parts: { code: boolean; seg: string }[] = [];
  let idx = 0;
  for (const m of text.matchAll(SPLIT_RE)) {
    const start = m.index ?? 0;
    if (start > idx) parts.push({ code: false, seg: text.slice(idx, start) });
    parts.push({ code: true, seg: m[0] });
    idx = start + m[0].length;
  }
  if (idx < text.length) parts.push({ code: false, seg: text.slice(idx) });
  if (parts.length === 0) parts.push({ code: false, seg: text });
  return parts;
}

function ensureGlobal(flags: string | undefined): string {
  let f = flags ?? "";
  if (!f.includes("g")) f += "g";
  return f;
}

function dedupSentences(seg: string): { seg: string; count: number } {
  const sentences = seg.match(SENTENCE_RE) ?? [];
  const out: string[] = [];
  let removed = 0;
  let prev: string | null = null;
  for (const s of sentences) {
    const norm = s.trim().toLowerCase();
    if (norm && norm === prev) {
      removed++;
      continue;
    }
    out.push(s);
    prev = norm;
  }
  return removed ? { seg: out.join(""), count: removed } : { seg, count: 0 };
}

function applyRule(rule: Rule, seg: string): { seg: string; count: number } {
  if (rule.type === "squeeze_ws") {
    let count = 0;
    const out = seg.replace(/[ \t]{2,}/g, () => {
      count++;
      return " ";
    });
    return { seg: out, count };
  }
  if (rule.type === "dedup_sentences") return dedupSentences(seg);

  const re = new RegExp(rule.pattern as string, ensureGlobal(rule.flags));
  let count = 0;
  const out = seg.replace(re, () => {
    count++;
    return rule.type === "replace" ? (rule.replacement as string) : "";
  });
  return { seg: out, count };
}

export function compress(
  text: string,
  { includeLossy = false }: { includeLossy?: boolean } = {}
): { text: string; changes: RuleChange[] } {
  let parts = splitProtected(text);
  const changes: RuleChange[] = [];
  const rules = includeLossy ? RULES : RULES.filter((r) => (r.tier ?? "safe") === "safe");

  for (const rule of rules) {
    let count = 0;
    parts = parts.map((part) => {
      if (part.code || (rule.scope === "prose" && part.seg.trim() === "")) return part;
      const { seg, count: fired } = applyRule(rule, part.seg);
      count += fired;
      return { code: false, seg };
    });
    if (count > 0) changes.push({ id: rule.id, count });
  }

  return { text: parts.map((p) => p.seg).join(""), changes };
}
