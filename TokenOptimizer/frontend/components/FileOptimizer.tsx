"use client";

import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { isOptimizableAttachment, normalizeAttachment } from "@/lib/attachments";
import { countTokens } from "@/lib/tokens";

const KIND_LABEL: Record<string, string> = {
  minify_json: "Minified JSON",
  csv_to_tsv: "Converted CSV → TSV",
  clean_text: "Cleaned text",
  none: "Already optimal — no change",
};

type Outcome =
  | { ok: true; name: string; type: string; text: string; before: number; after: number; kind: string; changed: boolean }
  | { ok: false; message: string };

export default function FileOptimizer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);

  async function handle(file: File) {
    if (!isOptimizableAttachment(file.name)) {
      setOut({
        ok: false,
        message:
          "In-browser support is JSON, CSV, TXT, and Markdown. Use the Python library/MCP for PDF, Word, or code.",
      });
      return;
    }
    const original = await file.text();
    const { text, changed, kind } = normalizeAttachment(file.name, original);
    setOut({
      ok: true,
      name: file.name,
      type: file.type || "text/plain",
      text,
      before: countTokens(original),
      after: countTokens(text),
      kind,
      changed,
    });
  }

  function download() {
    if (!out?.ok) return;
    const blob = new Blob([out.text], { type: out.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = out.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const saved = out?.ok ? out.before - out.after : 0;
  const pct = out?.ok && out.before ? Math.round((saved / out.before) * 100) : 0;

  return (
    <div className="animate-fade-up">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handle(f);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
          over ? "border-accent bg-accent-dim" : "border-border bg-elevated"
        }`}
      >
        <FileUp size={22} className="text-fg-faint" />
        <div className="text-sm">Drop a file here, or click to choose</div>
        <div className="text-xs text-fg-faint">JSON · CSV · TXT · Markdown — processed locally, never uploaded</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,.txt,.md,.markdown"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />

      {out && !out.ok && (
        <p className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          {out.message}
        </p>
      )}

      {out?.ok && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold">
              {saved} <span className="text-sm font-normal text-fg-muted">tokens saved</span>
            </div>
            <div className="text-sm text-fg-muted">
              {out.before} → {out.after} ({pct}%)
            </div>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {out.name} — {KIND_LABEL[out.kind] ?? out.kind}
          </p>
          <button
            onClick={download}
            disabled={!out.changed}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Download size={16} />
            Download optimized file
          </button>
        </div>
      )}
    </div>
  );
}
