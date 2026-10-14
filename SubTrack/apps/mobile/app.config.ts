import type { ConfigContext, ExpoConfig } from 'expo/config';

declare const process: { env: Readonly<Record<string, string | undefined>> };

const SANDBOX_ORIGIN = 'https://198.44.116.159';
const PRIVATE_PLUGIN = './plugins/private-runtime-ca.cjs';

// Keep this file self-contained: Expo51 config loading does not require a new TS loader.
function sandboxOrigin(value: string | undefined): string {
  if (value !== SANDBOX_ORIGIN) throw new Error('Sandbox origin rejected');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.pathname !== '/' ||
      url.search || url.hash || url.username || url.password) throw new Error('Sandbox origin rejected');
  return value;
}

/** Build preparation only. Local identifiers do not claim Apple/Play registration. */
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const variant = process.env.SUBTRACK_APP_VARIANT;
  if (variant === undefined) return config as ExpoConfig;
  if (variant !== 'sandbox') throw new Error('App variant rejected');
  for (const name of ['SUBTRACK_PRIVATE_DEVICE_PROOF', 'SUBTRACK_PRIVATE_CA_CERT',
    'SUBTRACK_PRIVATE_FIXTURE_CONFIG', 'EXPO_PUBLIC_PRIVATE_ENROLLMENT_DIAGNOSTIC',
    'EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED', 'EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL']) {
    if (process.env[name] !== undefined) throw new Error('Sandbox private configuration rejected');
  }
  const apiBaseUrl = sandboxOrigin(process.env.SUBTRACK_SANDBOX_HTTPS_ORIGIN);
  return {
    ...config,
    name: 'SubTrack Sandbox',
    slug: 'subtrack-sandbox',
    scheme: 'subtrack-sandbox',
    ios: { ...config.ios, bundleIdentifier: 'se.subtrack.app.sandbox' },
    android: { ...config.android, package: 'se.subtrack.app.sandbox' },
    plugins: (config.plugins ?? []).filter(plugin =>
      (typeof plugin === 'string' ? plugin : plugin[0]) !== PRIVATE_PLUGIN),
    extra: {
      ...config.extra,
      subtrackSandbox: {
        variant: 'sandbox',
        apiBaseUrl,
        runtimeEnabled: false,
        publicationEnabled: false,
        privateDiagnosticsEnabled: false,
      },
    },
  };
}
