import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ENDPOINT, getEndpoint, setEndpoint } from "../settings";

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

  it("defaults to the bundled service endpoint", async () => {
    expect(await getEndpoint()).toBe(DEFAULT_ENDPOINT);
  });

  it("persists a service endpoint override", async () => {
    await setEndpoint("https://svc.run.app");
    expect(await getEndpoint()).toBe("https://svc.run.app");
  });

  it("treats an explicitly empty override as disabled", async () => {
    await setEndpoint("");
    expect(await getEndpoint()).toBe("");
  });
});
