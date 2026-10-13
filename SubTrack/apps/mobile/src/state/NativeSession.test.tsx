import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NativeSessionProvider, useNativeSession } from './NativeSession';
import { verifiedNativeLogin, revokeNativeSession } from '@/api/privateMobileApi';
import type { NativeBundleStore } from '@/utils/secureSessionBundle';
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
jest.mock('@/api/privateMobileApi', () => ({ verifiedNativeLogin: jest.fn(), revokeNativeSession: jest.fn(), rotateNativeSession: jest.fn(), completeNativeEnrollment: jest.fn() }));
const credentials = { transport: 'mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
function Controls() {
  const session = useNativeSession();
  return <><Text testID="native-phase">{session.phase}</Text><Pressable testID="native-login" onPress={() => void session.login().catch(() => undefined)} />
    <Pressable testID="native-logout" onPress={() => void session.logout().catch(() => undefined)} /></>;
}
afterEach(() => jest.resetAllMocks());
it('requires fresh verification on mount and immediately clears mounted authority on offline logout', async () => {
  const store: NativeBundleStore = { read: jest.fn().mockResolvedValue(credentials), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  jest.mocked(verifiedNativeLogin).mockResolvedValue(credentials); jest.mocked(revokeNativeSession).mockRejectedValue(new Error('offline'));
  render(<NativeSessionProvider store={store}><Controls /></NativeSessionProvider>);
  await waitFor(() => expect(screen.getByTestId('native-phase').props.children).toBe('verification-required'));
  expect(verifiedNativeLogin).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('native-login')); await waitFor(() => expect(screen.getByTestId('native-phase').props.children).toBe('active'));
  fireEvent.press(screen.getByTestId('native-logout')); expect(screen.getByTestId('native-phase').props.children).toBe('verification-required');
  await act(async () => undefined); expect(revokeNativeSession).toHaveBeenCalledTimes(1);
});
