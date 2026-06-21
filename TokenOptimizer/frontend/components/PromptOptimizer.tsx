"use client";

import { useState } from "react";
import { Copy, Check, Wand2 } from "lucide-react";
import { compressPrompt, type CompressResult } from "@/lib/api";
import { wordDiff } from "@/lib/diff";

const SAMPLE =
  "Hi there! I was just wondering if you could possibly help me out with something. In order to " +
  "improve performance, due to the fact that the current code re-reads the config file on every " +
  "single request, I think we should probably go ahead and add some caching. Thanks so much!";

export default function PromptOptimizer() {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await compressPrompt(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const saved = result ? result.tokens_before - result.tokens_after : 0;
  const pct = result && result.tokens_before ? Math.round((saved / result.tokens_before) * 100) : 0;

  return (
    <div className="animate-fade-up">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a verbose prompt…"
        className="h-44 w-full resize-y rounded-xl border border-border bg-elevated p-4 font-mono text-sm text-fg outline-none focus:border-accent"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={run}
          disabled={loading || !text.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Wand2 size={16} />
          {loading ? "Optimizing…" : "Optimize"}
        </button>
        {loading && (
          <span className="text-xs text-fg-faint">first run may take ~30s (model cold start)</span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold">
              {saved} <span className="text-sm font-normal text-fg-muted">tokens saved</span>
            </div>
            <div className="text-sm text-fg-muted">
              {result.tokens_before} → {result.tokens_after} ({pct}%)
            </div>
          </div>

          <p className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
            {wordDiff(text, result.text).map((p, i) => (
              <span
                key={i}
                className={p.removed ? "text-fg-faint line-through opacity-60" : ""}
              >
                {p.text}{" "}
              </span>
            ))}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={copy}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy optimized"}
            </button>
            {result.mode !== "model" && (
              <span className="text-xs text-warn">
                model not loaded — returned unchanged ({result.mode})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
