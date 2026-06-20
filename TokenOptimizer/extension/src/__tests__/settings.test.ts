import { beforeEach, describe, expect, it } from "vitest";

import { getEndpoint, setEndpoint } from "../settings";

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

  it("defaults to an empty endpoint", async () => {
    expect(await getEndpoint()).toBe("");
  });

  it("persists the service endpoint", async () => {
    await setEndpoint("https://svc.run.app");
    expect(await getEndpoint()).toBe("https://svc.run.app");
  });
});
