import { Platform } from 'react-native';

declare const process: { env: {
  EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED?: string | undefined;
  EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL?: string | undefined;
} };

export type PrivateRuntime = Readonly<{ apiBaseUrl: string }>;

/** Explicit native development configuration; no endpoint or production fallback. */
export function resolvePrivateRuntime(input: Readonly<{
  development: boolean;
  platform: string;
  enabled?: string | undefined;
  apiBaseUrl?: string | undefined;
}>): PrivateRuntime | null {
  if (!input.development || (input.platform !== 'android' && input.platform !== 'ios') ||
      input.enabled !== 'true' || !input.apiBaseUrl || input.apiBaseUrl.length > 512 ||
      input.apiBaseUrl.trim() !== input.apiBaseUrl ||
      Array.from(input.apiBaseUrl).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(input.apiBaseUrl);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/') return null;
    return Object.freeze({ apiBaseUrl: url.origin.toLowerCase() });
  } catch { return null; }
}

export function getPrivateRuntime(): PrivateRuntime | null {
  return resolvePrivateRuntime({
    development: (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ === true,
    platform: Platform.OS,
    // Expo only inlines static process.env.EXPO_PUBLIC_* property references.
    enabled: process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED,
    apiBaseUrl: process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL,
  });
}
