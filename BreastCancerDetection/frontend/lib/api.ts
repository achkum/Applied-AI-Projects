import type { ChatTurn, ClassificationResult, HeatmapResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function detailOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function classifySlide(file: File): Promise<ClassificationResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/predict`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await detailOf(res));
  return res.json();
}

export async function generateHeatmap(
  imageBase64: string,
  overlayOpacity = 0.5,
): Promise<HeatmapResult> {
  const res = await fetch(`${BASE_URL}/gradcam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64, overlay_opacity: overlayOpacity }),
  });
  if (!res.ok) throw new Error(await detailOf(res));
  return res.json();
}

/** Strip the `data:*;base64,` prefix from a FileReader data URL. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Stream the agent's SSE response from POST /chat as parsed events. */
export async function* streamChat(
  message: string,
  history: ChatTurn[],
  imageBase64: string | null,
  sessionId: string,
): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      history,
      image_base64: imageBase64,
    }),
  });
  if (!res.ok || !res.body) throw new Error(await detailOf(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice("data: ".length)) as ChatEvent;
    }
  }
}
