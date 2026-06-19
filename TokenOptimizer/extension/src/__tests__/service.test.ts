import { afterEach, describe, expect, it, vi } from "vitest";

import { compressViaService } from "../service";

describe("compressViaService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs to /v1/compress and returns the result", async () => {
    const fetchMock = vi.fn(async (_url: string, _opts?: RequestInit) => ({
      ok: true,
      json: async () => ({ text: "short", tokens_before: 10, tokens_after: 4, mode: "model" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await compressViaService("https://svc.run.app/", "long text here", 0.5, "gpt-4o");
    expect(result.text).toBe("short");
    expect(result.mode).toBe("model");
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://svc.run.app/v1/compress"); // trailing slash trimmed
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      text: "long text here",
      rate: 0.5,
      model: "gpt-4o",
    });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(compressViaService("https://svc.run.app", "x")).rejects.toThrow("503");
  });
});
