import React from 'react';
import {Pressable,ScrollView,Text} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {SandboxSessionProvider,useSandboxSession} from '@/state/SandboxSession';
import type {SandboxMobileApi} from '@/api/sandboxMobileApi';
import {NativePersonalBankScreen} from './NativePersonalBankScreen';
import {NativeSessionProvider,useNativeSession} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as api from '@/api/privateMobileBank';
import * as sessionApi from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
const mockReplace=jest.fn(),mockFocus:{enabled:boolean;hold?:boolean;start?: (()=>void|(()=>void)) | undefined;cleanup?:void|(()=>void)}={enabled:true};
jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn(async()=>new Uint8Array(16).fill(7))}));
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{extra:{}}}}));
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace}),useFocusEffect:(callback:()=>void|(()=>void))=>{
 const React=jest.requireActual('react');React.useEffect(()=>{mockFocus.start=callback;if(mockFocus.enabled&&!mockFocus.hold)mockFocus.cleanup=callback();return()=>{if(!mockFocus.hold)mockFocus.cleanup?.();mockFocus.cleanup=undefined;};},[callback]);
}}));
jest.mock('@/api/privateMobileBank',()=>({readNativeBank:jest.fn(),mutateNativeBank:jest.fn(),bankRequestKey:jest.fn()}));
jest.mock('@/api/privateMobileApi',()=>({verifiedNativeLogin:jest.fn(),completeNativeEnrollment:jest.fn(),rotateNativeSession:jest.fn(),revokeNativeSession:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const copy=catalogs.en.onboarding.nativeBank,personal=catalogs.en.onboarding.nativePersonal;
const id='123e4567-e89b-42d3-a456-426614174000';
const key=['123e4567','e89b','42d3','a456','426614174001'].join('-');
const credentials={transport:'mobile' as const,sessionId:id,accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)};
const active={connectionId:id,provider:'SYNTHETIC' as const,institutionId:'synthetic-demo-v1' as const,status:'ACTIVE' as const,disposition:'retained' as const,accountCount:2,transactionCount:77,lastSyncAt:null};
const retained={...active,status:'REVOKED' as const};
beforeAll(()=>{const host=render(<ScrollView><Text>host</Text><Pressable><Text>button</Text></Pressable></ScrollView>);host.unmount();},60000);
beforeEach(()=>{
 jest.resetAllMocks();mockFocus.enabled=true;mockFocus.hold=false;mockFocus.start=undefined;mockFocus.cleanup=undefined;
 jest.mocked(sessionApi.verifiedNativeLogin).mockResolvedValue(credentials);jest.mocked(sessionApi.revokeNativeSession).mockResolvedValue(undefined);
 jest.mocked(api.bankRequestKey).mockResolvedValue(key);jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[]});
 jest.mocked(api.mutateNativeBank).mockResolvedValue({operation:'connect',connection:active});
});
function mount(){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};return render(<NativeSessionProvider store={store}><NativePersonalBankScreen/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:personal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:personal.verify}));}
async function press(label:string){fireEvent.press(await screen.findByRole('button',{name:label}));}
it('connects only the explicit Synthetic bank and presents actual post-mutation readback',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[]}).mockResolvedValueOnce({kind:'ready',connections:[active]});mount();expect(api.readNativeBank).not.toHaveBeenCalled();await login();await press(copy.connect);await screen.findByText(copy.active);
 expect(api.mutateNativeBank).toHaveBeenCalledWith({operation:'connect',institutionId:'synthetic-demo-v1'},key,credentials.accessToken,expect.any(AbortSignal));expect(api.readNativeBank).toHaveBeenCalledTimes(2);expect(screen.getByText('77')).toBeTruthy();expect(screen.queryByRole('button',{name:copy.connect})).toBeNull();
});
it('repeats sync explicitly without inventing count growth and ignores stale replay snapshot',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockResolvedValueOnce({kind:'ready',connections:[retained]});
 jest.mocked(api.mutateNativeBank).mockResolvedValue({operation:'sync',connection:active});mount();await login();await press(copy.sync);await screen.findByText(copy.updated);expect(screen.getByText('77')).toBeTruthy();await press(copy.sync);await screen.findByText(copy.revoked);
 expect(api.mutateNativeBank).toHaveBeenCalledTimes(2);expect(screen.queryByText(copy.active)).toBeNull();expect(screen.getByRole('button',{name:copy.connect})).toBeTruthy();expect(api.readNativeBank).toHaveBeenCalledTimes(3);
});
it('disconnects retaining counts, reconnects a fresh generation and keeps prior data reachable',async()=>{
 const next={...active,connectionId:'223e4567-e89b-42d3-a456-426614174000',accountCount:0,transactionCount:0};
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockResolvedValueOnce({kind:'ready',connections:[retained]}).mockResolvedValueOnce({kind:'ready',connections:[retained,next]});
 jest.mocked(api.mutateNativeBank).mockResolvedValueOnce({operation:'disconnect',connection:retained}).mockResolvedValueOnce({operation:'connect',connection:next});mount();await login();await press(copy.disconnect);await screen.findByText(copy.revoked);expect(screen.getByText('77')).toBeTruthy();await press(copy.connect);await screen.findByText(copy.active);
 expect(screen.getByText(copy.revoked)).toBeTruthy();expect(screen.getAllByRole('button',{name:copy.purge})).toHaveLength(2);expect(jest.mocked(api.mutateNativeBank).mock.calls[0]![0]).toEqual({operation:'disconnect',connectionId:id,purge:false});
});
it('requires explicit purge confirmation and supports cancellation without a mutation',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[retained]}).mockResolvedValueOnce({kind:'ready',connections:[]});jest.mocked(api.mutateNativeBank).mockResolvedValue({operation:'disconnect',connection:{...retained,disposition:'purged',accountCount:0,transactionCount:0}});
 mount();await login();await press(copy.purge);await screen.findByText(copy.purgeWarning);expect(api.mutateNativeBank).not.toHaveBeenCalled();await press(copy.cancelPurge);expect(screen.queryByText(copy.purgeWarning)).toBeNull();await press(copy.purge);await press(copy.confirmPurge);await screen.findByText(copy.purged);expect(screen.getByText(copy.empty)).toBeTruthy();expect(screen.queryByText('77')).toBeNull();expect(jest.mocked(api.mutateNativeBank).mock.calls[0]![0]).toEqual({operation:'disconnect',connectionId:id,purge:true});
});
it('reads durable state after remount and fresh verification',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[retained]});const first=mount();await login();await screen.findByText(copy.revoked);first.unmount();mount();expect(screen.queryByText(copy.revoked)).toBeNull();await login();await screen.findByText(copy.revoked);expect(screen.getByText('77')).toBeTruthy();expect(api.mutateNativeBank).not.toHaveBeenCalled();
});
it('refresh and focus restore reload current state and obsolete rejection cannot retire current authority',async()=>{
 let reject!:(error:Error)=>void;const waiting=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeBank).mockImplementationOnce(()=>waiting).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockResolvedValueOnce({kind:'ready',connections:[retained]});
 mount();await login();await waitFor(()=>expect(api.readNativeBank).toHaveBeenCalledTimes(1));act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(jest.mocked(api.readNativeBank).mock.calls[0]![1].aborted).toBe(true);act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>reject(new Error('obsolete')));await screen.findByText(copy.active);await press(copy.refresh);await screen.findByText(copy.revoked);expect(screen.queryByText(copy.unavailable)).toBeNull();
});
it('current read error retires Core, hiding bank state and offering fresh verification',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockRejectedValueOnce(new Error('read unavailable'));mount();await login();await screen.findByText(copy.active);await press(copy.refresh);await screen.findByText(copy.unavailable);expect(screen.queryByText('77')).toBeNull();expect(screen.getByRole('button',{name:personal.verify})).toBeTruthy();
});
it('uncertain sent mutation after blur retires authority and fresh verification reads durable state without retry',async()=>{
 let reject!:(error:Error)=>void;const waiting=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[]}).mockResolvedValueOnce({kind:'ready',connections:[retained]});jest.mocked(api.mutateNativeBank).mockImplementationOnce(()=>waiting);
 mount();await login();await press(copy.connect);await waitFor(()=>expect(api.mutateNativeBank).toHaveBeenCalledTimes(1));act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(jest.mocked(api.mutateNativeBank).mock.calls[0]![3].aborted).toBe(true);act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>reject(new Error('old uncertain response')));await screen.findByRole('button',{name:personal.verify});expect(screen.queryByText(copy.revoked)).toBeNull();expect(screen.queryByText(copy.uncertain)).toBeNull();expect(api.mutateNativeBank).toHaveBeenCalledTimes(1);await login();await screen.findByText(copy.revoked);expect(api.mutateNativeBank).toHaveBeenCalledTimes(1);
});
it('linked-data conflict or uncertain mutation does not retry and fresh verification reads retained state',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[retained]});jest.mocked(api.mutateNativeBank).mockRejectedValue(new Error('linked dependency rollback'));mount();await login();await press(copy.purge);await press(copy.confirmPurge);await screen.findByText(copy.uncertain);expect(screen.queryByText('77')).toBeNull();expect(api.mutateNativeBank).toHaveBeenCalledTimes(1);await login();await screen.findByText(copy.revoked);expect(api.mutateNativeBank).toHaveBeenCalledTimes(1);expect(screen.getByText('77')).toBeTruthy();
});
it('known business conflict renders current read instead of a receipt',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockResolvedValueOnce({kind:'ready',connections:[retained]});jest.mocked(api.mutateNativeBank).mockResolvedValue({conflict:'BANK_STATE_CONFLICT'});mount();await login();await press(copy.sync);await screen.findByText(copy.conflict);expect(screen.getByText(copy.revoked)).toBeTruthy();expect(screen.queryByRole('button',{name:personal.verify})).toBeNull();
});
it('setup gate prevents bank actions and preserves management navigation',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValue({kind:'setup-required'});mount();await login();await screen.findByText(copy.setup);expect(screen.queryByRole('button',{name:copy.connect})).toBeNull();await press(copy.manage);expect(mockReplace).toHaveBeenCalledWith('/personal');expect(api.mutateNativeBank).not.toHaveBeenCalled();
});
it('logout clears retained data and preserves acknowledgement against old failures',async()=>{
 let reject!:(error:Error)=>void;const waiting=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeBank).mockImplementationOnce(()=>waiting);mount();await login();await waitFor(()=>expect(api.readNativeBank).toHaveBeenCalledTimes(1));await press(personal.logout);await act(async()=>reject(new Error('old result')));await screen.findByText(personal.logoutConfirmed);expect(screen.queryByText(copy.unavailable)).toBeNull();expect(screen.queryByText('77')).toBeNull();
});
it('external retirement hides data and purge confirmation before focus cleanup',async()=>{
 let reject!:(error:Error)=>void;const waiting=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(sessionApi.rotateNativeSession).mockImplementation(()=>waiting);jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[retained]});
 function External(){const session=useNativeSession();return <Pressable accessibilityRole="button" accessibilityLabel="external retirement" onPress={()=>{void session.refresh().catch(()=>undefined);}}><Text>External</Text></Pressable>;}
 const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};render(<NativeSessionProvider store={store}><NativePersonalBankScreen/><External/></NativeSessionProvider>);await login();await press(copy.purge);await screen.findByText(copy.purgeWarning);mockFocus.hold=true;await act(async()=>{fireEvent.press(screen.getByRole('button',{name:'external retirement'}));});await waitFor(()=>expect(screen.queryByText(copy.purgeWarning)).toBeNull());expect(screen.queryByText('77')).toBeNull();await act(async()=>reject(new Error('retired')));expect(screen.queryByText('77')).toBeNull();
});

it('shared sandbox Bank uses protected installation session ports and inactive handoff without private login/bootstrap',async()=>{
 const sandboxCredentials={...credentials,transport:'sandbox-mobile',refreshToken:'s250r.'+'A'.repeat(43),sessionExpiresAt:10000};
 const bank={readNativeBank:jest.fn().mockResolvedValue({kind:'ready',connections:[active]}),mutateNativeBank:jest.fn().mockResolvedValue({operation:'sync',connection:active})},requestKey=jest.fn().mockResolvedValue(key);
 const transport={bootstrap:jest.fn().mockResolvedValue({...sandboxCredentials,installationCapability:'s250c.'+'A'.repeat(43)}),resume:jest.fn(),refresh:jest.fn(),logout:jest.fn().mockResolvedValue(undefined)};
 const store={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};
 function Entry(){const session=useSandboxSession();return <Pressable accessibilityRole="button" accessibilityLabel="installation entry" onPress={()=>{void session.bootstrap('en');}}><Text>Shared welcome handoff</Text></Pressable>;}
 const view=render(<SandboxSessionProvider available store={store} api={transport as unknown as SandboxMobileApi}><NativePersonalBankScreen useSession={useSandboxSession} api={bank} requestKey={requestKey} sandbox inactiveContent={<Entry/>}/></SandboxSessionProvider>);
 await screen.findByText('Shared welcome handoff');expect(bank.readNativeBank).not.toHaveBeenCalled();expect(transport.bootstrap).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:personal.verify})).toBeNull();
 await press('installation entry');await screen.findByText(copy.active);expect(store.write).toHaveBeenCalledTimes(1);await press(copy.sync);await screen.findByText(copy.updated);expect(bank.mutateNativeBank).toHaveBeenCalledWith({operation:'sync',connectionId:id},key,sandboxCredentials.accessToken,expect.any(AbortSignal));expect(requestKey).toHaveBeenCalledTimes(1);
 await press(personal.logout);await screen.findByText(personal.logoutConfirmed);expect(screen.queryByText('77')).toBeNull();expect(api.readNativeBank).not.toHaveBeenCalled();expect(api.mutateNativeBank).not.toHaveBeenCalled();expect(sessionApi.verifiedNativeLogin).not.toHaveBeenCalled();view.unmount();
});
it('one caller intent UUID survives a replayed session callback and busy controls prevent duplicate intent',async()=>{
 const bank={readNativeBank:jest.fn().mockResolvedValue({kind:'ready',connections:[active]}),mutateNativeBank:jest.fn().mockResolvedValue({operation:'sync',connection:active})},requestKey=jest.fn().mockResolvedValue(key);
 const session={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>{await work(credentials.accessToken,new AbortController().signal);return work(credentials.accessToken,new AbortController().signal);}};
 render(<NativePersonalBankScreen useSession={()=>session} api={bank} requestKey={requestKey}/>);await screen.findByText(copy.active);await press(copy.sync);await screen.findByText(copy.updated);expect(requestKey).toHaveBeenCalledTimes(1);expect(bank.mutateNativeBank).toHaveBeenCalledTimes(2);expect(bank.mutateNativeBank.mock.calls.every(call=>call[1]===key)).toBe(true);
});
it('busy injected Bank blocks duplicate sync and aborts late sandbox state after logout',async()=>{
 let complete!:(value:{operation:'sync';connection:typeof active})=>void;const waiting=new Promise<{operation:'sync';connection:typeof active}>(resolve=>{complete=resolve;});
 const bank={readNativeBank:jest.fn().mockResolvedValue({kind:'ready',connections:[active]}),mutateNativeBank:jest.fn().mockImplementation(()=>waiting)},requestKey=jest.fn().mockResolvedValue(key);
 let live=true;const session={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(async()=>{live=false;return true;}),run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>{if(!live)throw Error('retired');return work(credentials.accessToken,new AbortController().signal);}};
 render(<NativePersonalBankScreen useSession={()=>session} api={bank} requestKey={requestKey}/>);await screen.findByText(copy.active);await press(copy.sync);await waitFor(()=>expect(bank.mutateNativeBank).toHaveBeenCalledTimes(1));expect(screen.getByRole('button',{name:copy.refresh}).props.accessibilityState.disabled).toBe(true);await press(copy.refresh);expect(bank.mutateNativeBank).toHaveBeenCalledTimes(1);await press(personal.logout);await screen.findByText(personal.logoutConfirmed);await act(async()=>complete({operation:'sync',connection:active}));expect(screen.queryByText('77')).toBeNull();expect(screen.queryByText(copy.updated)).toBeNull();expect(bank.mutateNativeBank.mock.calls[0]![3].aborted).toBe(true);
});
