// Web worker: run "Deep compress" off the content-script thread so the UI never blocks.
//
// It uses the deterministic local importance scorer (the default in classifier.ts) — real,
// offline, no model download. A learned model (transformers.js LLMLingua-2) can later be plugged
// in by passing a different PipelineFactory; we deliberately do NOT ship an unverified model
// integration here.

import { compressDeep } from "./classifier";

type DeepRequest = { id: number; text: string; keepRatio: number };

self.onmessage = async (event: MessageEvent<DeepRequest>) => {
  const { id, text, keepRatio } = event.data;
  try {
    const result = await compressDeep(text, keepRatio);
    (self as unknown as Worker).postMessage({ id, ok: true, ...result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
