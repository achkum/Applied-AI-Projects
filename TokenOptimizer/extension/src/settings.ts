// Extension settings in chrome.storage.local: the compression service URL (the shared Cloud Run
// model that the Optimize button calls). Set it in the extension options.

const ENDPOINT_KEY = "serviceEndpoint";

export async function getEndpoint(): Promise<string> {
  const r = await chrome.storage.local.get(ENDPOINT_KEY);
  return typeof r[ENDPOINT_KEY] === "string" ? r[ENDPOINT_KEY] : "";
}

export async function setEndpoint(url: string): Promise<void> {
  await chrome.storage.local.set({ [ENDPOINT_KEY]: url });
}
