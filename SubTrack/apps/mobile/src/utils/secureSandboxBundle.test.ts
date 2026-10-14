import * as SecureStore from 'expo-secure-store';
import { secureSandboxBundle, decodeSandboxBundle, validateSandboxBundle } from './secureSandboxBundle';
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6, getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const credentials = { transport: 'sandbox-mobile', sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: `s250r.${'A'.repeat(43)}`, sessionExpiresAt: 10000 };
const bundle = { version: 1, installationCapability: `s250c.${'A'.repeat(43)}`, session: credentials };
beforeEach(() => jest.resetAllMocks());
it('stores capability and session atomically in a separate device-only item and reads/clears it', async () => {
  await secureSandboxBundle.write(bundle as never); const [key, raw, options] = jest.mocked(SecureStore.setItemAsync).mock.calls[0]!;
  expect(key).toBe('subtrack.sandbox-mobile.session.v1'); expect(options).toEqual({ keychainService: 'subtrack.sandbox-mobile', keychainAccessible: 6 });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(raw); expect(await secureSandboxBundle.read()).toEqual(bundle);
  await secureSandboxBundle.clear(); expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(key, options);
});
it('supports explicit retired-session capability and missing item without authenticating', async () => {
  expect(validateSandboxBundle({ ...bundle, session: null }).session).toBeNull(); jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null); expect(await secureSandboxBundle.read()).toBeNull();
});
it.each([null, {}, { ...bundle, version: 2 }, { ...bundle, owner: 'caller' }, { ...bundle, installationCapability: 'v2.private' }, { ...bundle, session: { ...credentials, transport: 'mobile' } }, Object.create(bundle)])('rejects corrupt/mixed bundle', value => { expect(() => validateSandboxBundle(value)).toThrow(); });
it('does not invoke getters or accept oversized/malformed JSON', () => {
  const getter = jest.fn(), value = { ...bundle }; Object.defineProperty(value, 'session', { enumerable: true, get: getter });
  expect(() => validateSandboxBundle(value)).toThrow(); expect(getter).not.toHaveBeenCalled();
  expect(() => decodeSandboxBundle('x'.repeat(10001))).toThrow(); expect(() => decodeSandboxBundle('{')).toThrow();
  expect(() => decodeSandboxBundle(7 as never)).toThrow();
});
it('wraps every OS storage failure without leaking its message', async () => {
  for (const method of ['getItemAsync', 'setItemAsync', 'deleteItemAsync'] as const) jest.mocked(SecureStore[method]).mockRejectedValue(new Error('private OS detail'));
  await expect(secureSandboxBundle.read()).rejects.toThrow('Sandbox secure storage unavailable'); await expect(secureSandboxBundle.write(bundle as never)).rejects.toThrow('Sandbox secure storage unavailable'); await expect(secureSandboxBundle.clear()).rejects.toThrow('Sandbox secure storage unavailable');
});
