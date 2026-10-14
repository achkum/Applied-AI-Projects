import * as SecureStore from 'expo-secure-store';
import { parsePrivateMobileSessionResponse } from '@subtrack/contracts/private-mobile';
import type { MobileSessionResponse } from '../../../../packages/contracts/generated/types.gen';

export type NativeCredentials = Readonly<MobileSessionResponse>;
export interface NativeBundleStore {
  read(): Promise<NativeCredentials | null>;
  write(credentials: NativeCredentials): Promise<void>;
  clear(): Promise<void>;
}
export class NativeStorageError extends Error {
  constructor() { super('Secure session storage unavailable'); this.name = 'NativeStorageError'; }
}
const key = 'subtrack.private-mobile.session.v1';
const options = { keychainService: 'subtrack.private-mobile', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
    keys.every(name => Object.prototype.hasOwnProperty.call(value, name));
}
export function validateNativeCredentials(value: unknown): NativeCredentials {
  try { return Object.freeze(parsePrivateMobileSessionResponse(value)); }
  catch { throw new NativeStorageError(); }
}
export function decodeSessionBundle(raw: string): NativeCredentials {
  try {
    if (typeof raw !== 'string' || raw.length > 10000) throw new NativeStorageError();
    const value: unknown = JSON.parse(raw);
    if (!exact(value, ['version', 'session']) || value.version !== 1) throw new NativeStorageError();
    return validateNativeCredentials(value.session);
  } catch { throw new NativeStorageError(); }
}
/** One OS-secure item avoids a torn access/refresh pair. Native errors never escape. */
export const secureSessionBundle: NativeBundleStore = {
  async read() {
    try { const raw = await SecureStore.getItemAsync(key, options); return raw === null ? null : decodeSessionBundle(raw); }
    catch { throw new NativeStorageError(); }
  },
  async write(credentials) {
    try { await SecureStore.setItemAsync(key, JSON.stringify({ version: 1, session: validateNativeCredentials(credentials) }), options); }
    catch { throw new NativeStorageError(); }
  },
  async clear() {
    try { await SecureStore.deleteItemAsync(key, options); }
    catch { throw new NativeStorageError(); }
  },
};
