import { FileCode2, Layers, Zap, Scissors } from "lucide-react";
import PromptOptimizer from "@/components/PromptOptimizer";

const CAPABILITIES = [
  {
    icon: FileCode2,
    title: "Attachment optimization",
    stat: "JSON 33% · code 24% · prose 22%",
    body: "Minify JSON/CSV, strip code comments (AST-safe for Python), and extract then compress text from PDF, Word, and more.",
  },
  {
    icon: Layers,
    title: "Repeated-context dedup & delta",
    stat: "up to ~99% on re-sends",
    body: "Re-sent context collapses to a reference across agent turns, and sections shared between documents are deduped.",
  },
  {
    icon: Zap,
    title: "Cache optimization",
    stat: "measured from real usage",
    body: "Reorders the payload for prefix stability and injects cache-control markers so provider prompt caches keep hitting.",
  },
  {
    icon: Scissors,
    title: "Response budgeting",
    stat: "caps the reply",
    body: "Injects a provider-correct max_tokens cap and an optional brevity directive so replies stay tight.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight">Cutok</h1>
          <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-fg-muted">
            demo · prompt compression
          </span>
        </div>
        <p className="text-fg-muted">
          Paste a verbose prompt and compress it before sending it to an LLM. This page demos one
          feature — the full engine does a lot more, shown below.
        </p>
      </header>

      <PromptOptimizer />

      <section className="mt-14">
        <h2 className="text-lg font-semibold">Save more with the library &amp; MCP</h2>
        <p className="mt-1.5 text-sm text-fg-muted">
          Prompt compression is one lever. Wrap your LLM calls with the Python library, or expose the
          engine to agents over MCP, to also get:
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, stat, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-surface p-4 transition hover:border-accent"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-dim text-accent">
                  <Icon size={18} />
                </span>
                <h3 className="font-semibold leading-tight">{title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
              <p className="mt-3 text-xs font-medium text-accent">{stat}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-elevated p-5">
        <h2 className="text-sm font-semibold">Get the full engine</h2>
        <div className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="mb-1.5 text-xs text-fg-faint">Python library</div>
            <code className="block rounded-md bg-base px-2.5 py-1.5 font-mono text-xs">pip install cutok</code>
          </div>
          <div>
            <div className="mb-1.5 text-xs text-fg-faint">MCP server</div>
            <code className="block rounded-md bg-base px-2.5 py-1.5 font-mono text-xs">uv run cutok mcp</code>
          </div>
          <div>
            <div className="mb-1.5 text-xs text-fg-faint">Browser extension</div>
            <span className="block rounded-md bg-base px-2.5 py-1.5 text-xs text-fg-muted">in-page Optimize button</span>
          </div>
        </div>
      </section>

      <footer className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-fg-faint">
        Prompt compression runs on a hosted LLMLingua-2 model — extractive and lossy but controlled;
        code blocks and quoted text are never touched.
      </footer>
    </main>
  );
}
