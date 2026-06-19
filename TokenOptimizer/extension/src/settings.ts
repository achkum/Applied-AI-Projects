// Extension settings in chrome.storage.local: the Low/High compression mode and the service URL.
//   Low  = local rule compressor (instant, offline, lossless scaffolding removal)
//   High = the shared Cloud Run model (real compression; needs the endpoint configured)

export type Mode = "low" | "high";

const MODE_KEY = "compressionMode";
const ENDPOINT_KEY = "serviceEndpoint";

export async function getMode(): Promise<Mode> {
  const r = await chrome.storage.local.get(MODE_KEY);
  return r[MODE_KEY] === "high" ? "high" : "low";
}

export async function setMode(mode: Mode): Promise<void> {
  await chrome.storage.local.set({ [MODE_KEY]: mode });
}

export async function getEndpoint(): Promise<string> {
  const r = await chrome.storage.local.get(ENDPOINT_KEY);
  return typeof r[ENDPOINT_KEY] === "string" ? r[ENDPOINT_KEY] : "";
}

export async function setEndpoint(url: string): Promise<void> {
  await chrome.storage.local.set({ [ENDPOINT_KEY]: url });
}
