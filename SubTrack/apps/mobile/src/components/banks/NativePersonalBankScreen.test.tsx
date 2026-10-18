import React from 'react';
import {Pressable,RefreshControl,ScrollView,StyleSheet,Text} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativePersonalBankScreen} from './NativePersonalBankScreen';
import {NativeSessionProvider,useNativeSession} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as api from '@/api/privateMobileBank';
import * as sessionApi from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
const mockPush=jest.fn(),mockReplace=jest.fn(),mockFocus:{enabled:boolean;hold?:boolean;start?: (()=>void|(()=>void)) | undefined;cleanup?:void|(()=>void)}={enabled:true};
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace,push:mockPush}),useFocusEffect:(callback:()=>void|(()=>void))=>{
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
function ProfileExit(){const session=useNativeSession();return <Pressable accessibilityRole="button" accessibilityLabel="External Profile exit" onPress={()=>{void session.logout().catch(()=>undefined);}}><Text>External Profile exit</Text></Pressable>;}
function mount(){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};return render(<NativeSessionProvider store={store}><NativePersonalBankScreen/><ProfileExit/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:personal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:personal.verify}));}
async function press(label:string){if((label===copy.purge||label===copy.disconnect)&&!screen.queryByRole('button',{name:label}))fireEvent.press((await screen.findAllByRole('button',{name:copy.options}))[0]!);fireEvent.press(await screen.findByRole('button',{name:label}));}
async function pullRefresh(){await act(async()=>{screen.UNSAFE_getByType(RefreshControl).props.onRefresh();});}
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
 expect(screen.getByText(copy.revoked)).toBeTruthy();expect(screen.getAllByRole('button',{name:copy.options})).toHaveLength(2);expect(jest.mocked(api.mutateNativeBank).mock.calls[0]![0]).toEqual({operation:'disconnect',connectionId:id,purge:false});
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
 mount();await login();await waitFor(()=>expect(api.readNativeBank).toHaveBeenCalledTimes(1));act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(jest.mocked(api.readNativeBank).mock.calls[0]![1].aborted).toBe(true);act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>reject(new Error('obsolete')));await screen.findByText(copy.active);await pullRefresh();await screen.findByText(copy.revoked);expect(screen.queryByText(copy.unavailable)).toBeNull();
});
it('current read error retires Core, hiding bank state and offering fresh verification',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValueOnce({kind:'ready',connections:[active]}).mockRejectedValueOnce(new Error('read unavailable'));mount();await login();await screen.findByText(copy.active);await pullRefresh();await screen.findByText(copy.unavailable);expect(screen.queryByText('77')).toBeNull();expect(screen.getByRole('button',{name:personal.verify})).toBeTruthy();
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
it('external Profile logout clears retained data and old failures cannot repaint the bank screen',async()=>{
 let reject!:(error:Error)=>void;const waiting=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeBank).mockImplementationOnce(()=>waiting);mount();await login();await waitFor(()=>expect(api.readNativeBank).toHaveBeenCalledTimes(1));await press('External Profile exit');await act(async()=>reject(new Error('old result')));await screen.findByRole('button',{name:personal.verify});expect(screen.queryByRole('button',{name:personal.logout})).toBeNull();expect(screen.getByRole('button',{name:copy.manage})).toBeTruthy();expect(screen.queryByText(copy.demo)).toBeNull();expect(screen.queryByText(copy.unavailable)).toBeNull();expect(screen.queryByText('77')).toBeNull();
});
it('external retirement hides data and purge confirmation before focus cleanup',async()=>{
 let reject!:(error:Error)=>void;const waiting=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(sessionApi.rotateNativeSession).mockImplementation(()=>waiting);jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[retained]});
 function External(){const session=useNativeSession();return <Pressable accessibilityRole="button" accessibilityLabel="external retirement" onPress={()=>{void session.refresh().catch(()=>undefined);}}><Text>External</Text></Pressable>;}
 const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};render(<NativeSessionProvider store={store}><NativePersonalBankScreen/><External/></NativeSessionProvider>);await login();await press(copy.purge);await screen.findByText(copy.purgeWarning);mockFocus.hold=true;await act(async()=>{fireEvent.press(screen.getByRole('button',{name:'external retirement'}));});await waitFor(()=>expect(screen.queryByText(copy.purgeWarning)).toBeNull());expect(screen.queryByText('77')).toBeNull();await act(async()=>reject(new Error('retired')));expect(screen.queryByText('77')).toBeNull();
});

it('uses the injected sandbox authority/transport and exposes review after committed connection readback',async()=>{
 const session={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>work('sandbox-token',new AbortController().signal)};
 const read=jest.fn().mockResolvedValueOnce({kind:'ready',connections:[]}).mockResolvedValue({kind:'ready',connections:[active]});const mutate=jest.fn().mockResolvedValue({operation:'connect',connection:active});
 render(<NativePersonalBankScreen useSession={()=>session} api={{readNativeBank:read,mutateNativeBank:mutate,bankRequestKey:async()=>key}} sandbox/>);
 await press(copy.connect);await screen.findByText(copy.active);expect(mutate).toHaveBeenCalledWith({operation:'connect',institutionId:'synthetic-demo-v1'},key,'sandbox-token',expect.any(AbortSignal));expect(api.readNativeBank).not.toHaveBeenCalled();await press(catalogs.en.onboarding.nativeDetection.open);expect(mockPush).toHaveBeenCalledWith('/personal-detections');
});

it('uses compact contextual actions, read-only pull refresh and hides removal until Options is opened',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[active]});mount();await login();await screen.findByText(copy.active);
 expect(screen.queryByRole('button',{name:copy.refresh})).toBeNull();expect(screen.queryByRole('button',{name:personal.logout})).toBeNull();expect(screen.queryByRole('button',{name:copy.purge})).toBeNull();expect(screen.queryByRole('button',{name:copy.disconnect})).toBeNull();
 await pullRefresh();expect(api.readNativeBank).toHaveBeenCalledTimes(2);expect(api.mutateNativeBank).not.toHaveBeenCalled();
 await press(copy.options);expect(screen.getByRole('button',{name:copy.options}).props.accessibilityState.expanded).toBe(true);expect(screen.getByRole('button',{name:copy.purge})).toBeTruthy();expect(api.mutateNativeBank).not.toHaveBeenCalled();
 await press(copy.purge);await press(copy.cancelPurge);expect(api.mutateNativeBank).not.toHaveBeenCalled();await press(copy.options);expect(screen.queryByRole('button',{name:copy.purge})).toBeNull();
 await press(copy.manage);expect(mockReplace).toHaveBeenCalledWith('/personal');
});
it('offers a retry only for an active read failure, without issuing another bank mutation',async()=>{
 const session={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>work('sandbox-token',new AbortController().signal)};
 const read=jest.fn().mockRejectedValueOnce(Error('read unavailable')).mockResolvedValue({kind:'ready',connections:[active]}),mutate=jest.fn();
 render(<NativePersonalBankScreen useSession={()=>session} api={{readNativeBank:read,mutateNativeBank:mutate,bankRequestKey:async()=>key}} sandbox/>);
 await screen.findByText(copy.unavailable);await press(copy.refresh);await screen.findByText(copy.active);expect(read).toHaveBeenCalledTimes(2);expect(mutate).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:copy.refresh})).toBeNull();
});

it('shows the current failed verification after session phase changes without retaining bank state',async()=>{jest.mocked(sessionApi.verifiedNativeLogin).mockRejectedValue(Error('verification unavailable'));mount();await login();await screen.findByText(copy.unavailable);expect(screen.queryByText('77')).toBeNull();expect(api.readNativeBank).not.toHaveBeenCalled();});

it('shows loading only while the actual owned read is pending and reports a failure without a success claim',async()=>{
 let finish!:(value:Awaited<ReturnType<typeof api.readNativeBank>>)=>void;
 jest.mocked(api.readNativeBank).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockRejectedValueOnce(new Error('unavailable'));
 mount();expect(screen.queryByText(copy.loading)).toBeNull();await login();await screen.findByText(copy.loading);
 expect(screen.queryByText(copy.empty)).toBeNull();
 await act(async()=>finish({kind:'ready',connections:[]}));await screen.findByText(copy.empty);expect(screen.queryByText(copy.loading)).toBeNull();
 await pullRefresh();await screen.findByText(copy.unavailable);expect(screen.queryByText(copy.loading)).toBeNull();expect(api.mutateNativeBank).not.toHaveBeenCalled();
});

it('keeps bank facts and compact actions within narrow large-text bounds and handles the iOS escape as Back without a mutation',async()=>{
 jest.mocked(api.readNativeBank).mockResolvedValue({kind:'ready',connections:[active]});mount();await login();await screen.findByText(copy.active);
 expect(StyleSheet.flatten(screen.getByTestId('native-bank-facts-0').props.style)).toMatchObject({flexDirection:'row',flexWrap:'wrap'});
 for(const id of ['native-bank-accounts-0','native-bank-transactions-0'])expect(StyleSheet.flatten(screen.getByTestId(id).props.style)).toMatchObject({maxWidth:'100%',flexWrap:'wrap'});
 for(const label of [copy.sync,copy.options])expect(StyleSheet.flatten(screen.getByRole('button',{name:label}).props.style)).toMatchObject({minHeight:44,minWidth:44,maxWidth:'100%'});
 expect(StyleSheet.flatten(screen.getByText(copy.demo).props.style)).toMatchObject({flexShrink:1,textAlign:'right'});
 await press(copy.purge);await screen.findByText(copy.purgeWarning);
 fireEvent(screen.getByTestId('native-bank-screen'),'accessibilityEscape');
 expect(mockReplace.mock.calls).toEqual([['/personal']]);expect(api.mutateNativeBank).not.toHaveBeenCalled();expect(screen.getByText('77')).toBeTruthy();
});
