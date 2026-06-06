"use client";

import { SendHorizontal, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { streamChat } from "@/lib/api";
import type { ChatTurn } from "@/lib/types";

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function ChatPanel({ imageBase64 }: { imageBase64: string | null }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string>(newSessionId());

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || streaming) return;

    setError(null);
    const history = messages;
    setMessages([...history, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      let assistant = "";
      for await (const event of streamChat(message, history, imageBase64, sessionId.current)) {
        if (event.type === "tool") {
          setStatus(`Consulting ${event.name}`);
        } else if (event.type === "token") {
          setStatus(null);
          assistant += event.text;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: assistant };
            return next;
          });
        } else if (event.type === "error") {
          setError(event.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant request failed.");
    } finally {
      setStatus(null);
      setStreaming(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} strokeWidth={1.75} className="text-accent" />
          <span className="label-mono">Assistant</span>
        </div>
        <span className="label-mono text-accent/70">MCP tools</span>
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-[0.86rem] text-fg-faint">
            Ask a follow-up about this slide, for example: why did the model predict this, or which
            regions look suspicious.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg rounded-br-sm border border-accent/25 bg-accent/[0.08] px-3.5 py-2 text-sm text-fg"
                : "mr-auto max-w-[85%] rounded-lg rounded-bl-sm border border-white/[0.07] bg-elevated/70 px-3.5 py-2 text-sm leading-relaxed text-fg-muted"
            }
          >
            {m.content || (m.role === "assistant" && streaming ? <Cursor /> : "")}
          </div>
        ))}
        {status && (
          <p className="font-mono text-[0.72rem] italic text-accent/80">{status}</p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-malignant/25 bg-malignant/[0.08] px-3 py-2 text-sm text-malignant">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Ask the assistant a question
        </label>
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question"
          disabled={streaming}
          className="flex-1 rounded-md border border-white/[0.1] bg-base/60 px-3.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || input.trim() === ""}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
          <SendHorizontal size={15} strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}

function Cursor() {
  return <span className="inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-accent/70 align-middle" />;
}
