import type { ConfigContext, ExpoConfig } from 'expo/config';

declare const process: { env: Readonly<Record<string, string | undefined>> };

const SANDBOX_ORIGIN = 'https://198.44.116.159';
const PRIVATE_PLUGIN = './plugins/private-runtime-ca.cjs';

// Keep this file self-contained: ExpoSDK54 config loading does not require a new TS loader.
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
  const activation = process.env.SUBTRACK_SANDBOX_RUNTIME_ENABLED;
  const version = process.env.SUBTRACK_SANDBOX_VERSION_CODE;
  if (version !== undefined && (variant !== 'sandbox' || !/^[1-9][0-9]*$/.test(version) || !Number.isSafeInteger(Number(version)) || Number(version) > 2147483647)) throw new Error('Sandbox version rejected');
  if (variant === 'sandbox' && activation === 'true' && version === undefined) throw new Error('Sandbox version required');
  if (activation !== undefined && variant !== 'sandbox') throw new Error('Sandbox activation rejected');
  if (activation !== undefined && activation !== 'true' && activation !== 'false') throw new Error('Sandbox activation rejected');
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
    // Expo maps ios.buildNumber to CFBundleVersion; keep the canonical counter as a string.
    // https://docs.expo.dev/versions/latest/config/app/#buildnumber
    ios: { ...config.ios, bundleIdentifier: 'se.subtrack.app.sandbox', ...(version === undefined ? {} : {buildNumber:version}) },
    android: { ...config.android, package: 'se.subtrack.app.sandbox', ...(version === undefined ? {} : {versionCode:Number(version)}) },
    plugins: (config.plugins ?? []).filter(plugin =>
      (typeof plugin === 'string' ? plugin : plugin[0]) !== PRIVATE_PLUGIN),
    extra: {
      ...config.extra,
      subtrackSandbox: {
        variant: 'sandbox',
        apiBaseUrl,
        runtimeEnabled: activation === 'true',
        publicationEnabled: false,
        privateDiagnosticsEnabled: false,
      },
    },
  };
}
