import { beforeEach, describe, expect, it } from "vitest";

import { getEndpoint, getMode, setEndpoint, setMode } from "../settings";

describe("settings", () => {
  beforeEach(() => {
    const store = new Map<string, unknown>();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store.get(key) }),
          set: async (obj: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(obj)) store.set(k, v);
          },
        },
      },
    };
  });

  it("defaults to low mode and empty endpoint", async () => {
    expect(await getMode()).toBe("low");
    expect(await getEndpoint()).toBe("");
  });

  it("persists mode and endpoint", async () => {
    await setMode("high");
    await setEndpoint("https://svc.run.app");
    expect(await getMode()).toBe("high");
    expect(await getEndpoint()).toBe("https://svc.run.app");
  });
});
