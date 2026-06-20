// Client for the shared compression service (the Cloud Run LLMLingua-2 endpoint) — the same
// service the Python library and MCP call, so the browser uses the identical model.
// The actual fetch runs in the background service worker (not the content script) to avoid page CSP.

export type CompressResult = {
  text: string;
  tokens_before: number;
  tokens_after: number;
  mode: string;
};

export async function compressViaService(
  endpoint: string,
  text: string,
  rate = 0.6,
  model = "gpt-4o",
): Promise<CompressResult> {
  const res = await fetch(endpoint.replace(/\/+$/, "") + "/v1/compress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, rate, model }),
  });
  if (!res.ok) throw new Error(`compression service responded ${res.status}`);
  return (await res.json()) as CompressResult;
}
