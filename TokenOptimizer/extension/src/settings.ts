// Extension settings in chrome.storage.local: the compression service URL (the shared Cloud Run
// model that the Optimize button calls). Ships with a default so it works out of the box; the
// options page is an optional override (save an empty value to disable compression).

const ENDPOINT_KEY = "serviceEndpoint";

// The hosted service the extension talks to by default. Override per-install via the options page.
export const DEFAULT_ENDPOINT = "https://token-optimizer-dolmuarprq-lz.a.run.app";

export async function getEndpoint(): Promise<string> {
  const r = await chrome.storage.local.get(ENDPOINT_KEY);
  // Unset → use the bundled default. A stored value (including "") is an explicit user override.
  return typeof r[ENDPOINT_KEY] === "string" ? r[ENDPOINT_KEY] : DEFAULT_ENDPOINT;
}

export async function setEndpoint(url: string): Promise<void> {
  await chrome.storage.local.set({ [ENDPOINT_KEY]: url });
}
