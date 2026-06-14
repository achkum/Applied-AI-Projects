// Running tokens-saved total in chrome.storage.local (a number, never prompt text).

const KEY = "tokensSavedTotal";

export async function getSavedTotal(): Promise<number> {
  const result = await chrome.storage.local.get(KEY);
  const value = result[KEY];
  return typeof value === "number" ? value : 0;
}

export async function addSaved(delta: number): Promise<number> {
  const current = await getSavedTotal();
  const next = current + Math.max(0, delta);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
