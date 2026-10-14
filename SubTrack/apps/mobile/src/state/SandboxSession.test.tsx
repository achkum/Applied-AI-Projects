import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SandboxSessionProvider, useSandboxSession, sandboxBuildSelected } from './SandboxSession';
import type { SandboxMobileApi } from '@/api/sandboxMobileApi';
import type { SandboxBundleStore } from '@/utils/secureSandboxBundle';
import RootLayout,{SandboxRouteBoundary} from '../../app/_layout';
import {NativeSessionProvider} from './NativeSession';
import {EnrollmentProvider} from './EnrollmentFlow';
const mockReplace=jest.fn();let mockPath='/';
jest.mock('expo-router',()=>({Stack:Object.assign(()=>null,{Screen:()=>null}),usePathname:()=>mockPath,useRouter:()=>({replace:mockReplace})}));
jest.mock('expo-font',()=>({useFonts:()=>[true,null]}));
jest.mock('@/providers/RootProvider',()=>({RootProvider:({children}:{children:React.ReactNode})=>children}));
jest.mock('@/state/NativeSession',()=>({NativeSessionProvider:jest.fn(({children}:{children:React.ReactNode})=>children)}));
jest.mock('@/state/EnrollmentFlow',()=>({EnrollmentProvider:jest.fn(({children}:{children:React.ReactNode})=>children)}));
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../components/signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../components/signature/testUtils/contextMocks').makeI18n('en')}));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
const session = { transport: 'sandbox-mobile', sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: `s250r.${'A'.repeat(43)}`, sessionExpiresAt: 10000 };
function Consumer() { const s = useSandboxSession(); return <><Text>{s.phase}</Text><Pressable accessibilityRole="button" accessibilityLabel="enter" onPress={() => { void s.bootstrap('en').catch(() => undefined); }}><Text>enter</Text></Pressable></>; }
it('disabled composition neither reads secure data nor requests a new workspace', async () => {
  const store = { read: jest.fn(), write: jest.fn(), clear: jest.fn() }, api = { bootstrap: jest.fn() };
  render(<SandboxSessionProvider store={store} api={api as unknown as SandboxMobileApi}><Consumer /></SandboxSessionProvider>); fireEvent.press(screen.getByRole('button', { name: 'enter' })); await waitFor(() => expect(screen.getByText('verification-required')).toBeTruthy()); expect(store.read).not.toHaveBeenCalled(); expect(api.bootstrap).not.toHaveBeenCalled();
});
it('injected qualified transport activates only after actual core persistence', async () => {
  const store: SandboxBundleStore = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  const api = { bootstrap: jest.fn().mockResolvedValue({ ...session, installationCapability: `s250c.${'A'.repeat(43)}` }), resume: jest.fn(), refresh: jest.fn(), logout: jest.fn() };
  render(<SandboxSessionProvider available store={store} api={api as unknown as SandboxMobileApi}><Consumer /></SandboxSessionProvider>); await screen.findByText('verification-required'); fireEvent.press(screen.getByRole('button', { name: 'enter' })); await screen.findByText('active'); expect(store.write).toHaveBeenCalledTimes(1);
});
it('unsupported initial and later deep links never mount a private subtree before repair',()=>{
 const mounted=jest.fn();function Child(){mounted();return<Text>Allowed subtree</Text>;}
 for(const path of ['/register','/register-otp','/register-bankid','/personal-bank','/personal-detections','/(tabs)']){
  mockPath=path;const view=render(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);expect(screen.queryByText('Allowed subtree')).toBeNull();expect(mockReplace).toHaveBeenCalledWith('/personal');view.unmount();
 }expect(mounted).not.toHaveBeenCalled();mockPath='/personal';const view=render(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);expect(screen.getByText('Allowed subtree')).toBeTruthy();const before=mounted.mock.calls.length;mockPath='/register';view.rerender(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);expect(screen.queryByText('Allowed subtree')).toBeNull();expect(mounted).toHaveBeenCalledTimes(before);
});
it('malformed sandbox marker remains isolated instead of falling back to private providers',()=>{
 for(const marker of [null,{variant:'unknown'},{variant:'sandbox',apiBaseUrl:'http://unapproved'}])expect(sandboxBuildSelected({extra:{subtrackSandbox:marker}})).toBe(true);
 expect(sandboxBuildSelected({extra:{}})).toBe(false);
});
it('root sandbox selection never mounts the private authority/enrollment providers',()=>{
 // Config is injected only into the pure selection port; actual root reads the same immutable marker.
 const constants=jest.requireActual('expo-constants').default as {expoConfig:{extra:Record<string,unknown>}|null};
 const config=constants.expoConfig;if(!config)throw Error('Expo test manifest unavailable');
 const before=config.extra;config.extra={...before,subtrackSandbox:{variant:'sandbox'}};mockPath='/personal';
 try{render(<RootLayout/>);expect(NativeSessionProvider).not.toHaveBeenCalled();expect(EnrollmentProvider).not.toHaveBeenCalled();}
 finally{config.extra=before;}
});
