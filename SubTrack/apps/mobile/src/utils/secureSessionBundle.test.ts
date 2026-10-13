import * as SecureStore from 'expo-secure-store';
import { decodeSessionBundle, NativeStorageError, secureSessionBundle, validateNativeCredentials } from './secureSessionBundle';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
const session = { transport: 'mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
afterEach(() => jest.resetAllMocks());
it('stores and reads one closed versioned item with the same device-only service', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify({ version: 1, session })).mockResolvedValueOnce(null);
  await secureSessionBundle.write(session);
  const [key, raw, options] = jest.mocked(SecureStore.setItemAsync).mock.calls[0]!;
  expect(JSON.parse(raw)).toEqual({ version: 1, session });
  expect(await secureSessionBundle.read()).toEqual(session); expect(await secureSessionBundle.read()).toBeNull();
  await secureSessionBundle.clear();
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith(key, options);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(key, options);
  expect(options).toMatchObject({ keychainAccessible: 6 });
});
it('rejects malformed versions, mixed credentials and header injection without echoing input', () => {
  for (const value of [null, [], {}, { ...session, transport: 'web' }, { ...session, extra: 'private' },
    { ...session, sessionId: 'foreign' }, { ...session, accessToken: 'not-jwt' }, { ...session, accessToken: 'a'.repeat(4097) },
    { ...session, refreshToken: '' }, { ...session, refreshToken: 'private\r\nAuthorization' }]) {
    expect(() => validateNativeCredentials(value)).toThrow(new NativeStorageError());
  }
  for (const raw of ['private-not-json', 'x'.repeat(10001), JSON.stringify({ version: 2, session }), JSON.stringify({ version: 1, session, extra: true })])
    expect(() => decodeSessionBundle(raw)).toThrow(new NativeStorageError());
});
it.each(['getItemAsync', 'setItemAsync', 'deleteItemAsync'] as const)('masks %s native failures', async method => {
  jest.mocked(SecureStore[method]).mockRejectedValueOnce(new Error('private native details'));
  const operation = method === 'getItemAsync' ? secureSessionBundle.read() : method === 'setItemAsync' ? secureSessionBundle.write(session) : secureSessionBundle.clear();
  await expect(operation).rejects.toEqual(new NativeStorageError());
});
