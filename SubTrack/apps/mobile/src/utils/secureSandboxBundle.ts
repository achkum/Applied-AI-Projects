import * as SecureStore from 'expo-secure-store';
import { parseSandboxCredentials, parseSandboxSecret, sandboxObject, type SandboxCredentials } from '@subtrack/contracts/sandbox-mobile';

export type SandboxBundle = Readonly<{ version: 1; installationCapability: string; session: SandboxCredentials | null }>;
export interface SandboxBundleStore { read(): Promise<SandboxBundle | null>; write(value: SandboxBundle): Promise<void>; clear(): Promise<void> }
export class SandboxStorageError extends Error { constructor() { super('Sandbox secure storage unavailable'); this.name = 'SandboxStorageError'; } }
export function validateSandboxBundle(value: unknown): SandboxBundle {
  try { const v = sandboxObject(value, ['version', 'installationCapability', 'session']);
    if (v.version !== 1) throw new SandboxStorageError();
    return Object.freeze({ version: 1, installationCapability: parseSandboxSecret(v.installationCapability, 'capability'),
      session: v.session === null ? null : parseSandboxCredentials(v.session, false) });
  } catch { throw new SandboxStorageError(); }
}
export function decodeSandboxBundle(raw: string): SandboxBundle {
  try { if (typeof raw !== 'string' || raw.length > 10000) throw new SandboxStorageError(); return validateSandboxBundle(JSON.parse(raw) as unknown); }
  catch { throw new SandboxStorageError(); }
}
const key = 'subtrack.sandbox-mobile.session.v1';
const options = { keychainService: 'subtrack.sandbox-mobile', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const secureSandboxBundle: SandboxBundleStore = {
  async read() { try { const raw = await SecureStore.getItemAsync(key, options); return raw === null ? null : decodeSandboxBundle(raw); } catch { throw new SandboxStorageError(); } },
  async write(value) { try { await SecureStore.setItemAsync(key, JSON.stringify(validateSandboxBundle(value)), options); } catch { throw new SandboxStorageError(); } },
  async clear() { try { await SecureStore.deleteItemAsync(key, options); } catch { throw new SandboxStorageError(); } },
};
