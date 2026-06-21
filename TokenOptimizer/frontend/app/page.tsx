"use client";

import { useState } from "react";
import { FileText, MessageSquareText } from "lucide-react";
import PromptOptimizer from "@/components/PromptOptimizer";
import FileOptimizer from "@/components/FileOptimizer";

type Tab = "prompt" | "file";

export default function Home() {
  const [tab, setTab] = useState<Tab>("prompt");

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Cutok</h1>
        <p className="mt-1 text-fg-muted">
          Cut the token cost of LLM requests. Compress a prompt with the hosted model, or compact a
          file locally before you attach it.
        </p>
      </header>

      <div className="mb-5 inline-flex rounded-lg border border-border bg-surface p-1">
        <TabButton active={tab === "prompt"} onClick={() => setTab("prompt")} icon={<MessageSquareText size={15} />}>
          Prompt
        </TabButton>
        <TabButton active={tab === "file"} onClick={() => setTab("file")} icon={<FileText size={15} />}>
          File
        </TabButton>
      </div>

      {tab === "prompt" ? <PromptOptimizer /> : <FileOptimizer />}

      <footer className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-fg-faint">
        <p>
          <span className="text-fg-muted">Prompts</span> are sent to a hosted LLMLingua-2 model for
          extractive compression (lossy, controlled).{" "}
          <span className="text-fg-muted">Files</span> are optimized entirely in your browser —
          nothing is uploaded.
        </p>
        <p className="mt-1">
          Also available as a Python library, an MCP server, and a browser extension. PDF/Word/code
          attachments are handled by the library/MCP.
        </p>
      </footer>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
