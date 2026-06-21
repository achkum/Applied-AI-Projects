// Client for the shared compression service (the Cloud Run LLMLingua-2 endpoint) — the same service
// the library, extension, and MCP call. Prompt text is sent here; nothing else leaves the browser.

const BASE_URL =
  process.env.NEXT_PUBLIC_COMPRESS_URL ?? "https://token-optimizer-dolmuarprq-lz.a.run.app";

export type CompressResult = {
  text: string;
  tokens_before: number;
  tokens_after: number;
  mode: string;
};

export async function compressPrompt(
  text: string,
  rate = 0.8,
  model = "gpt-4o",
): Promise<CompressResult> {
  const res = await fetch(`${BASE_URL.replace(/\/+$/, "")}/v1/compress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, rate, model }),
  });
  if (!res.ok) throw new Error(`Compression service responded ${res.status}`);
  return res.json();
}
