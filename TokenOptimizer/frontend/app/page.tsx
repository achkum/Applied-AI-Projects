import PromptOptimizer from "@/components/PromptOptimizer";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Cutok</h1>
        <p className="mt-1 text-fg-muted">
          Compress a verbose prompt before you send it to an LLM — paste it, see what gets trimmed,
          and copy the shorter version.
        </p>
      </header>

      <PromptOptimizer />

      <footer className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-fg-faint">
        <p>
          Compression runs on a hosted LLMLingua-2 model (extractive, lossy but controlled); code
          blocks and quoted text are never touched.
        </p>
        <p className="mt-1">
          Also available as a Python library, an MCP server, and a browser extension. File
          optimization (JSON, CSV, code, PDF/Word) lives in the library/MCP.
        </p>
      </footer>
    </main>
  );
}
