import { Platform } from 'react-native';
import { getPrivateRuntime, resolvePrivateRuntime } from './privateRuntime';

declare const process: { env: {
  EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED?: string | undefined;
  EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL?: string | undefined;
} };

const valid = { development: true, platform: 'android', enabled: 'true', apiBaseUrl: 'https://localhost:3443' };
describe('explicit private native runtime', () => {
  test.each(['android','ios'])('canonical trusted HTTPS origin on %s', platform => {
    const runtime = resolvePrivateRuntime({ ...valid, platform, apiBaseUrl: 'https://LOCALHOST:3443/' });
    expect(runtime).toEqual({ apiBaseUrl: 'https://localhost:3443' });
    expect(Object.isFrozen(runtime)).toBe(true);
  });
  test.each([
    { development: false }, { platform: 'web' }, { platform: 'windows' },
    { enabled: undefined }, { enabled: 'false' }, { enabled: 'TRUE' },
    { apiBaseUrl: undefined }, { apiBaseUrl: '' }, { apiBaseUrl: 'not a URL' },
    { apiBaseUrl: 'http://localhost:3443' }, { apiBaseUrl: 'file:///private' },
    { apiBaseUrl: 'https://localhost:3443/v2' }, { apiBaseUrl: 'https://localhost:3443/?secret=value' },
    { apiBaseUrl: 'https://localhost:3443/#fragment' }, { apiBaseUrl: 'https://user@localhost:3443' },
    { apiBaseUrl: 'https://user:password@localhost:3443' }, { apiBaseUrl: ' https://localhost:3443' },
    { apiBaseUrl: 'https://local\nhost:3443' }, { apiBaseUrl: 'https://localhost:3443\u007f' },
    { apiBaseUrl: `https://${'a'.repeat(513)}` },
  ])('fails closed for invalid or disabled runtime %#', override => {
    expect(resolvePrivateRuntime({ ...valid, ...override })).toBeNull();
  });
  test('fails closed when the platform URL parser is unavailable', () => {
    const parser = jest.spyOn(globalThis, 'URL').mockImplementation(() => {
      throw new Error('private parser failure');
    });
    try { expect(resolvePrivateRuntime(valid)).toBeNull(); }
    finally { parser.mockRestore(); }
  });
  test('reads the same explicit public build variables as the OTP adapter', () => {
    const priorOs = Platform.OS;
    const priorDev = (globalThis as typeof globalThis & { __DEV__?: boolean | undefined }).__DEV__;
    try {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
      (globalThis as typeof globalThis & { __DEV__?: boolean | undefined }).__DEV__ = true;
      // Expo inlines these at transform time; changing process.env afterward
      // cannot configure a native bundle. Run this fixture with the explicit
      // public build variables to exercise the enabled getter.
      const configured = process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED === 'true' &&
        process.env.EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL === valid.apiBaseUrl;
      expect(getPrivateRuntime()).toEqual(configured ? { apiBaseUrl: valid.apiBaseUrl } : null);
      (globalThis as typeof globalThis & { __DEV__?: boolean | undefined }).__DEV__ = undefined;
      expect(getPrivateRuntime()).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: priorOs, configurable: true });
      (globalThis as typeof globalThis & { __DEV__?: boolean | undefined }).__DEV__ = priorDev;
    }
  });
});
