import React from 'react';
import {Pressable,RefreshControl,ScrollView,Text} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativePrivacyScreen,NativeHelpScreen} from './NativeProfileTools';
import {NativeSessionProvider,useNativeSession} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as bank from '@/api/privateMobileBank';
import * as auth from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
const mockPush=jest.fn(),mockReplace=jest.fn(),mockLocale:{value:'en'|'sv'}={value:'en'},mockFocus:{start?:(()=>void|(()=>void))|undefined;cleanup?:void|(()=>void)}={};
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,replace:mockReplace}),useFocusEffect:(callback:()=>void|(()=>void))=>{const React=jest.requireActual('react');React.useEffect(()=>{mockFocus.start=callback;mockFocus.cleanup=callback();return()=>{mockFocus.cleanup?.();mockFocus.cleanup=undefined;};},[callback]);}}));
jest.mock('@/api/privateMobileBank',()=>({readNativeBank:jest.fn(),mutateNativeBank:jest.fn(),bankRequestKey:jest.fn()}));
jest.mock('@/api/privateMobileApi',()=>({verifiedNativeLogin:jest.fn(),revokeNativeSession:jest.fn(),rotateNativeSession:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n(mockLocale.value)}));
const credentials={transport:'mobile' as const,sessionId:'123e4567-e89b-42d3-a456-426614174000',accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)};
const connection={connectionId:credentials.sessionId,provider:'SYNTHETIC' as const,institutionId:'synthetic-demo-v1' as const,status:'REVOKED' as const,disposition:'retained' as const,accountCount:2,transactionCount:77,lastSyncAt:null};
beforeAll(()=>{const host=render(<ScrollView><Text>host</Text><Pressable><Text>button</Text></Pressable></ScrollView>);host.unmount();},60000);
beforeEach(()=>{jest.resetAllMocks();mockLocale.value='en';mockFocus.start=undefined;mockFocus.cleanup=undefined;jest.mocked(auth.verifiedNativeLogin).mockResolvedValue(credentials);jest.mocked(auth.revokeNativeSession).mockResolvedValue(undefined);jest.mocked(bank.readNativeBank).mockResolvedValue({kind:'ready',connections:[connection]});});
function AuthorityControls(){const session=useNativeSession();return <><Pressable accessibilityRole="button" accessibilityLabel="Verify fixture" accessibilityState={{disabled:session.phase!=='verification-required'}} disabled={session.phase!=='verification-required'} onPress={()=>{void session.login();}}><Text>Verify fixture</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Retire fixture" onPress={()=>{void session.logout();}}><Text>Retire fixture</Text></Pressable></>;}
function mount(help=false){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};return render(<NativeSessionProvider store={store}>{help?<NativeHelpScreen/>:<NativePrivacyScreen/>}<AuthorityControls/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:'Verify fixture'}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:'Verify fixture'}));}
it('reads only current authenticated bank data and navigates to the existing purge confirmation flow without a second mutation implementation',async()=>{
 mount();expect(bank.readNativeBank).not.toHaveBeenCalled();expect(screen.queryByText('77')).toBeNull();await login();await screen.findByText('77');expect(screen.getByText('2')).toBeTruthy();expect(screen.getByText(catalogs.en.onboarding.nativeBank.revoked)).toBeTruthy();expect(bank.readNativeBank).toHaveBeenCalledWith(credentials.accessToken,expect.any(AbortSignal));fireEvent.press(screen.getByTestId('native-privacy-bank-data'));expect(mockPush).toHaveBeenCalledWith('/personal-bank');expect(bank.mutateNativeBank).not.toHaveBeenCalled();expect(bank.bankRequestKey).not.toHaveBeenCalled();
});
it('uses fresh readback after returning from bank controls and removes retained data once purged',async()=>{
 jest.mocked(bank.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[connection]}).mockResolvedValueOnce({kind:'ready',connections:[]});mount();await login();await screen.findByText('77');act(()=>{mockFocus.cleanup?.();});expect(screen.queryByText('77')).toBeNull();act(()=>{mockFocus.cleanup=mockFocus.start?.();});await screen.findByText(catalogs.en.nativeProfileTools.noBankData);expect(screen.queryByText('77')).toBeNull();expect(bank.readNativeBank).toHaveBeenCalledTimes(2);
});
it('late owner data after logout cannot repaint the summary',async()=>{
 let resolve!:(value:Awaited<ReturnType<typeof bank.readNativeBank>>)=>void;jest.mocked(bank.readNativeBank).mockImplementationOnce(()=>new Promise(accept=>{resolve=accept;}));mount();await login();await waitFor(()=>expect(bank.readNativeBank).toHaveBeenCalledTimes(1));fireEvent.press(screen.getByRole('button',{name:'Retire fixture'}));await screen.findByText(catalogs.en.nativeProfileTools.signIn);expect(jest.mocked(bank.readNativeBank).mock.calls[0]![1].aborted).toBe(true);await act(async()=>resolve({kind:'ready',connections:[connection]}));expect(screen.queryByText('77')).toBeNull();expect(screen.queryByTestId('native-privacy-bank-data')).toBeNull();
});
it('intentional blur cancellation stays inside the read coordinator and preserves the active session',async()=>{
 let reject!:(error:Error)=>void;jest.mocked(bank.readNativeBank).mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;})).mockResolvedValueOnce({kind:'ready',connections:[connection]});mount();await login();await waitFor(()=>expect(bank.readNativeBank).toHaveBeenCalledTimes(1));act(()=>{mockFocus.cleanup?.();});act(()=>{mockFocus.cleanup=mockFocus.start?.();});await act(async()=>reject(new Error('obsolete read')));await screen.findByText('77');expect(auth.verifiedNativeLogin).toHaveBeenCalledTimes(1);expect(screen.queryByText(catalogs.en.nativeProfileTools.signIn)).toBeNull();
});
it('a current read failure retires the real session and withholds bank data until fresh verification',async()=>{
 jest.mocked(bank.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[connection]}).mockRejectedValueOnce(new Error('current read failed'));mount();await login();await screen.findByText('77');await act(async()=>{screen.UNSAFE_getByType(RefreshControl).props.onRefresh();});await screen.findByText(catalogs.en.nativeProfileTools.signIn);expect(screen.queryByText('77')).toBeNull();expect(screen.queryByTestId('native-privacy-bank-data')).toBeNull();
});
it.each(['en','sv'] as const)('Help in %s opens concise answers and existing destinations without requesting bank data',async locale=>{
 mockLocale.value=locale;const copy=catalogs[locale].nativeProfileTools;mount(true);expect(screen.queryByText(copy.detectionAnswer)).toBeNull();fireEvent.press(screen.getByTestId('native-help-detection'));expect(screen.getByText(copy.detectionAnswer)).toBeTruthy();expect(screen.getByTestId('native-help-detection').props.accessibilityState.expanded).toBe(true);fireEvent.press(screen.getByTestId('native-help-tracking'));expect(screen.queryByText(copy.detectionAnswer)).toBeNull();expect(screen.getByText(copy.trackingAnswer)).toBeTruthy();expect(screen.queryByTestId('native-help-open-banks')).toBeNull();await login();await screen.findByTestId('native-help-open-banks');for(const [key,path]of [['banks','/personal-bank'],['review','/personal-detections'],['family','/personal-household'],['upcoming','/personal-home']]){fireEvent.press(screen.getByTestId(`native-help-open-${key}`));expect(mockPush).toHaveBeenLastCalledWith(path);}expect(bank.readNativeBank).not.toHaveBeenCalled();
});
