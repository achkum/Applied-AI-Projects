jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{extra:{}}}}));
import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SandboxSessionProvider, useSandboxSession, sandboxBuildSelected } from './SandboxSession';
import type { SandboxMobileApi } from '@/api/sandboxMobileApi';
import { secureSandboxBundle } from '@/utils/secureSandboxBundle';
import { Platform } from 'react-native';
import type { SandboxBundleStore } from '@/utils/secureSandboxBundle';
import RootLayout,{SandboxRouteBoundary} from '../../app/_layout';
import {NativeSessionProvider} from './NativeSession';
import {EnrollmentProvider} from './EnrollmentFlow';
const mockReplace=jest.fn();let mockPath='/';let mockShowMockConsumer=false;
jest.mock('expo-router',()=>({Stack:Object.assign(()=>mockShowMockConsumer?<MockConsumer/>:null,{Screen:()=>null}),usePathname:()=>mockPath,useRouter:()=>({replace:mockReplace})}));
jest.mock('expo-font',()=>({useFonts:()=>[true,null]}));
jest.mock('@/providers/RootProvider',()=>({RootProvider:({children}:{children:React.ReactNode})=>children}));
jest.mock('@/state/NativeSession',()=>({NativeSessionProvider:jest.fn(({children}:{children:React.ReactNode})=>children),useNativeSession:()=>({phase:'verification-required'})}));
jest.mock('@/state/EnrollmentFlow',()=>({EnrollmentProvider:jest.fn(({children}:{children:React.ReactNode})=>children),useEnrollment:()=>({flow:{phase:'identifier'}})}));
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../components/signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../components/signature/testUtils/contextMocks').makeI18n('en')}));
jest.mock('@/utils/secureSandboxBundle',()=>({...jest.requireActual('@/utils/secureSandboxBundle'),secureSandboxBundle:{read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)}}));
jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn(async()=>new Uint8Array(16).fill(7))}));
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
const session = { transport: 'sandbox-mobile', sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: `s250r.${'A'.repeat(43)}`, sessionExpiresAt: 10000 };
function MockConsumer() { const s = useSandboxSession(); return <><Text>{s.phase}</Text><Pressable accessibilityRole="button" accessibilityLabel="enter" onPress={() => { void s.bootstrap('en').catch(() => undefined); }}><Text>enter</Text></Pressable></>; }
it('disabled composition neither reads secure data nor requests a new workspace', async () => {
  const store = { read: jest.fn(), write: jest.fn(), clear: jest.fn() }, api = { bootstrap: jest.fn() };
  render(<SandboxSessionProvider store={store} api={api as unknown as SandboxMobileApi}><MockConsumer /></SandboxSessionProvider>); fireEvent.press(screen.getByRole('button', { name: 'enter' })); await waitFor(() => expect(screen.getByText('verification-required')).toBeTruthy()); expect(store.read).not.toHaveBeenCalled(); expect(api.bootstrap).not.toHaveBeenCalled();
});
it('injected qualified transport activates only after actual core persistence', async () => {
  const store: SandboxBundleStore = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  const api = { bootstrap: jest.fn().mockResolvedValue({ ...session, installationCapability: `s250c.${'A'.repeat(43)}` }), resume: jest.fn(), refresh: jest.fn(), logout: jest.fn() };
  render(<SandboxSessionProvider available store={store} api={api as unknown as SandboxMobileApi}><MockConsumer /></SandboxSessionProvider>); await screen.findByText('verification-required'); fireEvent.press(screen.getByRole('button', { name: 'enter' })); await screen.findByText('active'); expect(store.write).toHaveBeenCalledTimes(1);
});
it('unsupported initial and later deep links never mount a private subtree before repair',()=>{
 const mounted=jest.fn(),unmounted=jest.fn();function Child(){mounted();React.useEffect(()=>()=>unmounted(),[]);return<Text>Allowed subtree</Text>;}
 for(const path of ['/(tabs)','/en/demo']){
  mockPath=path;const view=render(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);expect(screen.queryByText('Allowed subtree')).toBeNull();expect(mockReplace).toHaveBeenCalledWith('/welcome');view.unmount();
 }expect(mounted).not.toHaveBeenCalled();expect(unmounted).not.toHaveBeenCalled();mockPath='/personal';const view=render(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);expect(screen.getByText('Allowed subtree')).toBeTruthy();const before=mounted.mock.calls.length;mockPath='/(tabs)';view.rerender(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);expect(screen.queryByText('Allowed subtree')).toBeNull();expect(mounted).toHaveBeenCalledTimes(before);expect(unmounted).toHaveBeenCalledTimes(1);expect(mockReplace).toHaveBeenLastCalledWith('/welcome');view.unmount();
});
it('allows the shared sandbox product routes without falling back to private authority providers',()=>{
 function Child(){return<Text>Shared sandbox feature</Text>;}
 const native=jest.mocked(NativeSessionProvider),enrollment=jest.mocked(EnrollmentProvider);native.mockClear();enrollment.mockClear();
 for(const path of ['/personal','/personal-billing-month','/personal-home','/personal-profile','/personal-bank','/personal-detections','/personal-household','/personal-insights','/personal-comparisons']){
  mockReplace.mockClear();mockPath=path;const view=render(<SandboxSessionProvider><SandboxRouteBoundary><Child/></SandboxRouteBoundary></SandboxSessionProvider>);
  expect(screen.getByText('Shared sandbox feature')).toBeTruthy();expect(mockReplace).not.toHaveBeenCalled();expect(native).not.toHaveBeenCalled();expect(enrollment).not.toHaveBeenCalled();view.unmount();
 }mockPath='/personal';
});
it('malformed sandbox marker remains isolated instead of falling back to private providers',()=>{
 for(const marker of [null,{variant:'unknown'},{variant:'sandbox',apiBaseUrl:'http://unapproved'}])expect(sandboxBuildSelected({extra:{subtrackSandbox:marker}})).toBe(true);
 expect(sandboxBuildSelected({extra:{}})).toBe(false);
});
it('root sandbox selection never mounts the private authority/enrollment providers',()=>{
 // Config is injected only into the pure selection port; actual root reads the same immutable marker.
 const constants=jest.requireMock('expo-constants').default as {expoConfig:{extra:Record<string,unknown>}|null};
 const config=constants.expoConfig;if(!config)throw Error('Expo test manifest unavailable');
 const before=config.extra;config.extra={...before,subtrackSandbox:{variant:'sandbox'}};mockPath='/personal';
 try{render(<RootLayout/>);expect(NativeSessionProvider).not.toHaveBeenCalled();expect(EnrollmentProvider).not.toHaveBeenCalled();}
 finally{config.extra=before;}
});

it('mounted undefined/accessor/inherited/hostile marker stays unavailable without private providers or initialization',()=>{
 const constants=jest.requireMock('expo-constants').default as {expoConfig:unknown},before=constants.expoConfig,fetchBefore=globalThis.fetch,network=jest.fn(),store=jest.mocked(secureSandboxBundle),native=jest.mocked(NativeSessionProvider),enrollment=jest.mocked(EnrollmentProvider);let reads=0;
 const configurations=[{extra:{subtrackSandbox:undefined}},{extra:Object.defineProperty({},'subtrackSandbox',{get(){reads++;throw Error('private');}})},{extra:Object.create({subtrackSandbox:undefined})},Object.defineProperty({},'extra',{get(){reads++;throw Error('private');}}),new Proxy({},{getOwnPropertyDescriptor(){throw Error('private');}})];
 try{globalThis.fetch=network;for(const config of configurations){constants.expoConfig=config;store.read.mockClear();native.mockClear();enrollment.mockClear();const view=render(<RootLayout/>);expect(native).not.toHaveBeenCalled();expect(enrollment).not.toHaveBeenCalled();expect(store.read).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();view.unmount();}expect(reads).toBe(0);constants.expoConfig={extra:{}};const view=render(<RootLayout/>);expect(native).toHaveBeenCalled();expect(enrollment).toHaveBeenCalled();view.unmount();}finally{constants.expoConfig=before;globalThis.fetch=fetchBefore;}
});
it.each(['ios','android'] as const)('real root active %s composition uses guest bootstrap and persistence without private providers',async platform=>{
 const constants=jest.requireMock('expo-constants').default as {expoConfig:unknown},before=constants.expoConfig,descriptor=Object.getOwnPropertyDescriptor(Platform,'OS'),fetchBefore=globalThis.fetch,store=jest.mocked(secureSandboxBundle);const encode=(v:object)=>btoa(JSON.stringify(v)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 const access=encode({alg:'EdDSA',typ:'subtrack-sandbox-access+jwt',kid:'st250-sandbox-v1'})+'.'+encode({iss:'urn:subtrack:auth:v2:sandbox',aud:'urn:subtrack:api:v2:sandbox',sub:session.sessionId,sid:session.sessionId,iat:100,exp:1000,ver:2})+'.signature';
 const fetch=jest.fn().mockResolvedValue({status:201,headers:{get:(name:string)=>name==='cache-control'?'no-store':'application/json'},text:async()=>JSON.stringify({...session,accessToken:access,installationCapability:'s250c.'+'A'.repeat(43)})});
 try{Object.defineProperty(Platform,'OS',{configurable:true,value:platform});constants.expoConfig={extra:{subtrackSandbox:{variant:'sandbox',apiBaseUrl:'https://198.44.116.159',runtimeEnabled:true,publicationEnabled:false,privateDiagnosticsEnabled:false}}};globalThis.fetch=fetch;store.read.mockClear();store.write.mockClear();jest.mocked(NativeSessionProvider).mockClear();jest.mocked(EnrollmentProvider).mockClear();mockShowMockConsumer=true;const view=render(<RootLayout/>);await screen.findByText('verification-required');expect(store.read).toHaveBeenCalledTimes(1);fireEvent.press(screen.getByRole('button',{name:'enter'}));await screen.findByText('active');expect(store.write).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0]![0]).toBe('https://198.44.116.159/v2/sandbox/mobile/bootstrap');expect(NativeSessionProvider).not.toHaveBeenCalled();expect(EnrollmentProvider).not.toHaveBeenCalled();view.unmount();}finally{constants.expoConfig=before;globalThis.fetch=fetchBefore;mockShowMockConsumer=false;if(descriptor)Object.defineProperty(Platform,'OS',descriptor);}
});
