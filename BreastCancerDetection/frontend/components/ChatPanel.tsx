"use client";

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
    setMessages([
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setStreaming(true);

    try {
      let assistant = "";
      for await (const event of streamChat(message, history, imageBase64, sessionId.current)) {
        if (event.type === "tool") {
          setStatus(`Consulting ${event.name}…`);
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
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Ask the assistant</h2>

      <div className="mt-3 space-y-3" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">
            Ask a follow-up about this slide — e.g. “Why did the model predict this?”
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-blue-900 px-3 py-2 text-sm text-white"
                : "mr-auto max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800"
            }
          >
            {m.content || (m.role === "assistant" && streaming ? "…" : "")}
          </div>
        ))}
        {status && <p className="text-xs italic text-slate-500">{status}</p>}
        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
          placeholder="Ask a question…"
          disabled={streaming}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || input.trim() === ""}
          className="rounded-md bg-blue-900 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
