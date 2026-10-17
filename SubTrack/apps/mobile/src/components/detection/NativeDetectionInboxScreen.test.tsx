import React from 'react';
import {AccessibilityInfo,Platform,Pressable,ScrollView,Text} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativeDetectionInboxScreen} from './NativeDetectionInboxScreen';
import {NativeSessionProvider,useNativeSession} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as api from '@/api/privateMobileDetection';
import * as sessionApi from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
const mockReplace=jest.fn(),mockFocus:{enabled:boolean;hold?:boolean;start?: (()=>void|(()=>void)) | undefined;cleanup?:void|(()=>void)}={enabled:true};
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace}),useFocusEffect:(callback:()=>void|(()=>void))=>{
 const React=jest.requireActual('react');React.useEffect(()=>{mockFocus.start=callback;if(mockFocus.enabled&&!mockFocus.hold)mockFocus.cleanup=callback();return()=>{if(!mockFocus.hold)mockFocus.cleanup?.();mockFocus.cleanup=undefined;};},[callback]);
}}));
jest.mock('@/api/privateMobileDetection',()=>({readNativeDetections:jest.fn(),readDetectionOwnerRows:jest.fn(),mutateNativeDetection:jest.fn(),detectionRequestKey:jest.fn()}));
jest.mock('@/api/privateMobileApi',()=>({verifiedNativeLogin:jest.fn(),completeNativeEnrollment:jest.fn(),rotateNativeSession:jest.fn(),revokeNativeSession:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const copy=catalogs.en.onboarding.nativeDetection,personal=catalogs.en.onboarding.nativePersonal;
const id='123e4567-e89b-42d3-a456-426614174000';
const key=['123e4567','e89b','42d3','a456','426614174001'].join('-');
const credentials={transport:'mobile' as const,sessionId:id,accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)};
beforeAll(()=>{const host=render(<ScrollView><Text>host</Text><Pressable><Text>button</Text></Pressable></ScrollView>);host.unmount();},60000);
beforeEach(()=>{
 jest.resetAllMocks();mockFocus.enabled=true;mockFocus.hold=false;mockFocus.start=undefined;mockFocus.cleanup=undefined;
 jest.mocked(sessionApi.verifiedNativeLogin).mockResolvedValue(credentials);jest.mocked(sessionApi.revokeNativeSession).mockResolvedValue(undefined);
 jest.mocked(api.detectionRequestKey).mockResolvedValue(key);jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[],nextCursor:null});
 jest.mocked(api.mutateNativeDetection).mockResolvedValue({scan:'complete'});jest.mocked(api.readDetectionOwnerRows).mockResolvedValue([]);
});
function RetireAuthority(){const session=useNativeSession();return <Pressable accessibilityRole="button" accessibilityLabel="Retire test authority" onPress={()=>{void session.logout().catch(()=>undefined);}}><Text>Retire test authority</Text></Pressable>;}
function MountedInbox(){const [visible,setVisible]=React.useState(true);return <>{visible?<NativeDetectionInboxScreen/>:null}<RetireAuthority/><Pressable accessibilityRole="button" accessibilityLabel="Leave test inbox" onPress={()=>setVisible(false)}><Text>Leave test inbox</Text></Pressable></>;}
function mount(overrides:Partial<NativeBundleStore>={}){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined),...overrides};return render(<NativeSessionProvider store={store}><MountedInbox/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:personal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:personal.verify}));}
async function press(label:string){fireEvent.press(await screen.findByRole('button',{name:label}));}

const candidate={id,revision:'1',displayName:'Netflix',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,expectedAmountMinor:'9007199254740993',currency:'SEK',confidence:0.9,reasons:['CADENCE_MATCHED'],status:'DETECTED' as const};
const reviewed={candidateId:id,status:'ACTIVE' as const,revision:'2',receiptId:key,undoUntil:'2000-01-01T00:00:00.000Z'};
const owner={id,revision:'2',source:'DETECTED' as const,visibility:'owner' as const,customName:'Netflix',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:candidate.expectedAmountMinor,currency:'SEK',nextChargeDate:null,alwaysPrivate:true};
it('scans explicitly and renders actual current inbox readback with translated reasons',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null});mount();await login();await press(copy.scan);await screen.findByText('Netflix');expect(api.mutateNativeDetection).toHaveBeenCalledWith({operation:'scan'},key,credentials.accessToken,expect.any(AbortSignal));expect(api.readDetectionOwnerRows).toHaveBeenCalledTimes(1);expect(screen.queryByText(copy.reasons.CADENCE_MATCHED)).toBeNull();await press(copy.why);expect(screen.getByRole('button',{name:copy.why}).props.accessibilityState.expanded).toBe(true);expect(screen.getByText(copy.reasons.CADENCE_MATCHED)).toBeTruthy();await press(copy.why);expect(screen.queryByText(copy.reasons.CADENCE_MATCHED)).toBeNull();expect(screen.getByRole('button',{name:copy.why}).props.accessibilityState.expanded).toBe(false);
});
it('confirms from server revision, verifies owner readback and asks server for Undo even after local deadline',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[{...candidate,revision:'3'}],nextCursor:null});jest.mocked(api.readDetectionOwnerRows).mockResolvedValueOnce([owner]).mockResolvedValueOnce([{...owner,status:'DETECTED',revision:'3'}]);jest.mocked(api.mutateNativeDetection).mockResolvedValueOnce(reviewed).mockResolvedValueOnce({...reviewed,status:'DETECTED',revision:'3',undoUntil:null});mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.reviewed);await press(copy.undo);await screen.findByText(copy.undone);expect(screen.getByText('Netflix')).toBeTruthy();expect(jest.mocked(api.mutateNativeDetection).mock.calls[1]![0]).toEqual({operation:'undo',receiptId:key,candidateId:id});
});
it('rejects with actual readback and renders server expiry without automatic retries',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.readDetectionOwnerRows).mockResolvedValue([{...owner,status:'REJECTED'}]);jest.mocked(api.mutateNativeDetection).mockResolvedValueOnce({...reviewed,status:'REJECTED'}).mockResolvedValueOnce({conflict:'UNDO_EXPIRED'});mount();await login();await press(copy.reject.replace('%{name}','Netflix'));await screen.findByText(copy.reviewed);await press(copy.undo);await screen.findByText(copy.expired);expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();expect(api.mutateNativeDetection).toHaveBeenCalledTimes(2);expect(api.readDetectionOwnerRows).toHaveBeenCalledTimes(2);
});
it('does not advertise receipt-only success when owner state disagrees',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.readback);expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();
});
it('known conflict refreshes both projections without retiring Core',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockResolvedValue({conflict:'DETECTION_STATE_CONFLICT'});mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.conflict);expect(screen.queryByRole('button',{name:personal.verify})).toBeNull();expect(api.readDetectionOwnerRows).toHaveBeenCalledTimes(1);
});
it('ignored abort successful mutation after blur retires Core before any readback and never retries',async()=>{
 let resolve!:(value:typeof reviewed)=>void;const wait=new Promise<typeof reviewed>(done=>{resolve=done;});jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockImplementationOnce(()=>wait);mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await waitFor(()=>expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1));act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>resolve(reviewed));await screen.findByRole('button',{name:personal.verify});expect(api.readDetectionOwnerRows).not.toHaveBeenCalled();expect(screen.queryByText('Netflix')).toBeNull();expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1);
});
it('uncertain mutation clears private state and verification reads durable state without retry',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockRejectedValue(new Error('private failure'));mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.uncertain);expect(screen.queryByText('Netflix')).toBeNull();await login();await screen.findByText('Netflix');expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1);
});
it('remount requires verification and does not restore transient Undo or private candidates',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});const first=mount();await login();await screen.findByText('Netflix');first.unmount();mount();expect(screen.queryByText('Netflix')).toBeNull();await login();await screen.findByText('Netflix');expect(api.mutateNativeDetection).not.toHaveBeenCalled();
});
it('logout immediately hides candidates and requires fresh verification',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});mount();await login();await screen.findByText('Netflix');await press(personal.logout);await screen.findByText(personal.logoutConfirmed);expect(screen.queryByRole('button',{name:personal.logout})).toBeNull();expect(screen.queryByText(copy.demo)).toBeNull();expect(screen.queryByText('Netflix')).toBeNull();expect(screen.getByRole('button',{name:personal.verify})).toBeTruthy();
});
it('fences ignored-abort owner readback after a sent mutation and retires authority',async()=>{
 let resolve!:(value:typeof owner[])=>void;const pending=new Promise<typeof owner[]>(done=>{resolve=done;});jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);jest.mocked(api.readDetectionOwnerRows).mockReturnValueOnce(pending);mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await waitFor(()=>expect(api.readDetectionOwnerRows).toHaveBeenCalledTimes(1));act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>resolve([owner]));await screen.findByRole('button',{name:personal.verify});expect(screen.queryByText(copy.reviewed)).toBeNull();expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1);
});
it('external Core retirement hides all private content before a stale read can resolve',async()=>{
 let resolve!:(value:{kind:'ready';items:typeof candidate[];nextCursor:null})=>void;const pending=new Promise<{kind:'ready';items:typeof candidate[];nextCursor:null}>(done=>{resolve=done;});jest.mocked(api.readNativeDetections).mockReturnValueOnce(pending);mount();await login();await waitFor(()=>expect(api.readNativeDetections).toHaveBeenCalledTimes(1));await press('Retire test authority');await screen.findByRole('button',{name:personal.verify});await act(async()=>resolve({kind:'ready',items:[candidate],nextCursor:null}));expect(screen.queryByText('Netflix')).toBeNull();expect(screen.queryByRole('button',{name:copy.scan})).toBeNull();
});
it.each(['duplicate','cycle'] as const)('rejects %s inbox pagination without displaying mixed pages',async defect=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:'cursorA'}).mockResolvedValueOnce({kind:'ready',items:defect==='duplicate'?[candidate]:[],nextCursor:defect==='cycle'?'cursorA':null});mount();await login();await screen.findByText('Netflix');await press(copy.more);await screen.findByRole('button',{name:personal.verify});expect(screen.queryByText('Netflix')).toBeNull();expect(api.mutateNativeDetection).not.toHaveBeenCalled();
});
it('loads complete current inbox pages without mutating private server state',async()=>{
 const second={...candidate,id:key,displayName:'Spotify'};jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:'cursorA'}).mockResolvedValueOnce({kind:'ready',items:[second],nextCursor:null});mount();await login();await screen.findByText('Netflix');await press(copy.more);await screen.findByText('Spotify');expect(screen.getByText('Netflix')).toBeTruthy();expect(screen.queryByRole('button',{name:copy.more})).toBeNull();expect(api.mutateNativeDetection).not.toHaveBeenCalled();
});
it('does not extend the original server deadline on a replayed review receipt',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);jest.mocked(api.readDetectionOwnerRows).mockResolvedValue([owner]);mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.deadline.replace('%{date}',reviewed.undoUntil));expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1);expect(screen.queryByText(/2026-10-14/)).toBeNull();
});
it('requires both inbox removal and detected owner source before advertising confirmation',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);jest.mocked(api.readDetectionOwnerRows).mockResolvedValue([{...owner,source:'MANUAL'}]);mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.readback);expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();
});
it('stale read after blur is inert and does not retire otherwise current authority',async()=>{
 let resolve!:(value:{kind:'ready';items:typeof candidate[];nextCursor:null})=>void;const pending=new Promise<{kind:'ready';items:typeof candidate[];nextCursor:null}>(done=>{resolve=done;});jest.mocked(api.readNativeDetections).mockReturnValueOnce(pending).mockResolvedValue({kind:'ready',items:[candidate],nextCursor:null});mount();await login();await waitFor(()=>expect(api.readNativeDetections).toHaveBeenCalledTimes(1));act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});await act(async()=>resolve({kind:'ready',items:[candidate],nextCursor:null}));expect(screen.queryByText('Netflix')).toBeNull();act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await screen.findByText('Netflix');expect(screen.queryByRole('button',{name:personal.verify})).toBeNull();
});
it('shows setup requirement without scan, private rows or receipts',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'setup-required'});mount();await login();await screen.findByText(copy.setup);expect(screen.queryByRole('button',{name:copy.scan})).toBeNull();expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();
});
it('known mode conflict reads the new setup gate without requesting inaccessible owner rows',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValueOnce({kind:'setup-required'});jest.mocked(api.mutateNativeDetection).mockResolvedValue({conflict:'MODE_CONFLICT'});mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.setup);expect(api.readDetectionOwnerRows).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:personal.verify})).toBeNull();expect(screen.queryByText('Netflix')).toBeNull();
});
it('rejects a cursor cycle across separately loaded pages',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:'cursorA'}).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:'cursorB'}).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:'cursorA'});mount();await login();await screen.findByText('Netflix');await press(copy.more);await waitFor(()=>expect(api.readNativeDetections).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.getByRole('button',{name:copy.more}).props.accessibilityState.disabled).toBe(false));await press(copy.more);await screen.findByRole('button',{name:personal.verify});expect(screen.queryByText('Netflix')).toBeNull();
});
it('withholds Undo success when current inbox revision disagrees',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null});jest.mocked(api.readDetectionOwnerRows).mockResolvedValueOnce([owner]).mockResolvedValueOnce([]);jest.mocked(api.mutateNativeDetection).mockResolvedValueOnce(reviewed).mockResolvedValueOnce({...reviewed,status:'DETECTED',revision:'3',undoUntil:null});mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.reviewed);await press(copy.undo);await screen.findByText(copy.readback);expect(screen.queryByText(copy.undone)).toBeNull();
});
it('suppresses a second mutation callback racing with React busy rendering',async()=>{
 let resolve!:(value:{scan:'complete'})=>void;const pending=new Promise<{scan:'complete'}>(done=>{resolve=done;});jest.mocked(api.mutateNativeDetection).mockReturnValueOnce(pending);mount();await login();await screen.findByRole('button',{name:copy.scan});const scan=screen.getByRole('button',{name:copy.scan});let target:typeof scan|null=scan;while(target&&(target.props.accessibilityLabel!==copy.scan||typeof target.props.onPress!=='function'))target=target.parent;const onPress=target?.props.onPress;expect(typeof onPress).toBe('function');act(()=>{onPress();onPress();});await waitFor(()=>expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1));await act(async()=>resolve({scan:'complete'}));await screen.findByText(copy.scanned);expect(api.mutateNativeDetection).toHaveBeenCalledTimes(1);
});
it('shows bilingual catalogue fallback for an unknown canonical category',async()=>{
 jest.mocked(api.readNativeDetections).mockResolvedValue({kind:'ready',items:[{...candidate,categoryCode:'OTHER_CANONICAL_CATEGORY'}],nextCursor:null});mount();await login();await screen.findByText(/Subscription ·/);expect(catalogs.sv.onboarding.nativeDetection.title).toBeTruthy();
});
it('failed verification is shown without retaining a private candidate',async()=>{
 jest.mocked(sessionApi.verifiedNativeLogin).mockRejectedValue(new Error('simulator unavailable'));mount();await login();await screen.findByText(copy.unavailable);expect(screen.queryByText('Netflix')).toBeNull();
});
it('logout with failed revoke acknowledges only local disposal',async()=>{
 jest.mocked(sessionApi.revokeNativeSession).mockRejectedValue(new Error('revoke unavailable'));mount();await login();await screen.findByRole('button',{name:copy.scan});await press(personal.logout);await screen.findByText(personal.logoutLocal);expect(screen.queryByRole('button',{name:copy.scan})).toBeNull();
});
it('private storage failure after logout is explicit and keeps private content hidden',async()=>{
 const clear=jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage unavailable'));mount({clear});await login();await screen.findByRole('button',{name:copy.scan});await press(personal.logout);await screen.findByText(personal.storageError);expect(screen.queryByRole('button',{name:copy.scan})).toBeNull();expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();
});
it('obsolete logout acknowledgement cannot repaint an unmounted inbox',async()=>{
 let resolve!:()=>void;const pending=new Promise<undefined>(done=>{resolve=()=>done(undefined);});jest.mocked(sessionApi.revokeNativeSession).mockReturnValueOnce(pending);const view=mount();await login();await screen.findByRole('button',{name:copy.scan});await press(personal.logout);await waitFor(()=>expect(sessionApi.revokeNativeSession).toHaveBeenCalledTimes(1));view.unmount();await act(async()=>resolve());
});
it('obsolete failed verification and storage disposal callbacks are ignored after unmount',async()=>{
 let reject!:(error:Error)=>void;const pending=new Promise<typeof credentials>((_done,fail)=>{reject=fail;});jest.mocked(sessionApi.verifiedNativeLogin).mockReturnValueOnce(pending);const view=mount();await login();await waitFor(()=>expect(sessionApi.verifiedNativeLogin).toHaveBeenCalledTimes(1));view.unmount();await act(async()=>reject(new Error('obsolete verification')));
});
it('uses existing personal and Billing Month navigation destinations',async()=>{
 mount();await login();await screen.findByRole('button',{name:copy.scan});await press(copy.manage);await press(catalogs.en.onboarding.billingMonth.open);expect(mockReplace.mock.calls).toEqual([['/personal'],['/personal-billing-month']]);
});
it('ignores failed verification feedback after leaving the screen while Core remains mounted',async()=>{
 let reject!:(error:Error)=>void;const pending=new Promise<typeof credentials>((_done,fail)=>{reject=fail;});jest.mocked(sessionApi.verifiedNativeLogin).mockReturnValueOnce(pending);mount();await login();await waitFor(()=>expect(sessionApi.verifiedNativeLogin).toHaveBeenCalledTimes(1));await press('Leave test inbox');await act(async()=>reject(new Error('late failed verification')));expect(screen.queryByText(copy.unavailable)).toBeNull();
});
it('ignores failed storage feedback after leaving the inbox with disposal still pending',async()=>{
 let reject!:(error:Error)=>void;const pending=new Promise<void>((_done,fail)=>{reject=fail;});const clear=jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockReturnValueOnce(pending);mount({clear});await login();await screen.findByRole('button',{name:copy.scan});await press(personal.logout);await waitFor(()=>expect(clear).toHaveBeenCalledTimes(3));await press('Leave test inbox');await act(async()=>reject(new Error('late failed disposal')));expect(screen.queryByText(personal.storageError)).toBeNull();
});


it.each(['reject','undo'] as const)('withholds %s acknowledgement for missing, foreign-source, stale or different-status owner rows',async operation=>{
 for(const defect of ['missing','source','revision','status'] as const){
  const targetStatus=operation==='reject'?'REJECTED':'DETECTED',targetRevision=operation==='reject'?'2':'3';
  const expected={...owner,status:targetStatus,revision:targetRevision} as Awaited<ReturnType<typeof api.readDetectionOwnerRows>>[number];
  const incorrect=defect==='missing'?[]:[{...expected,...(defect==='source'?{source:'MANUAL' as const}:defect==='revision'?{revision:'99'}:{status:'CANCELLED' as const})}];
  jest.mocked(api.readNativeDetections).mockReset();jest.mocked(api.mutateNativeDetection).mockReset();jest.mocked(api.readDetectionOwnerRows).mockReset();
  jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:null});
  if(operation==='undo'){
   jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[{...candidate,revision:'3'}],nextCursor:null});
   jest.mocked(api.mutateNativeDetection).mockResolvedValueOnce(reviewed).mockResolvedValueOnce({...reviewed,status:'DETECTED',revision:'3',undoUntil:null});
   jest.mocked(api.readDetectionOwnerRows).mockResolvedValueOnce([owner]).mockResolvedValueOnce(incorrect);
  }else{
   jest.mocked(api.mutateNativeDetection).mockResolvedValueOnce({...reviewed,status:'REJECTED'});
   jest.mocked(api.readDetectionOwnerRows).mockResolvedValueOnce(incorrect);
  }
  const view=mount();await login();await press(operation==='undo'?copy.confirm.replace('%{name}','Netflix'):copy.reject.replace('%{name}','Netflix'));
  if(operation==='undo'){await screen.findByText(copy.reviewed);await press(copy.undo);}
  await screen.findByText(copy.readback);expect(screen.queryByRole('button',{name:copy.undo})).toBeNull();expect(screen.queryByText(copy.undone)).toBeNull();
  expect(api.mutateNativeDetection).toHaveBeenCalledTimes(operation==='undo'?2:1);view.unmount();
 }
});


function announcementPorts(platform:'ios'|'android'){
 const descriptor=Object.getOwnPropertyDescriptor(Platform,'OS');Object.defineProperty(Platform,'OS',{configurable:true,value:platform});
 const frames:{id:number;callback:Parameters<typeof requestAnimationFrame>[0]}[]=[];
 const raf=jest.spyOn(globalThis,'requestAnimationFrame').mockImplementation(callback=>{const id=frames.length+1;frames.push({id,callback});return id;});
 const cancel=jest.spyOn(globalThis,'cancelAnimationFrame').mockImplementation(()=>undefined);
 const announce=jest.spyOn(AccessibilityInfo,'announceForAccessibility').mockImplementation(()=>undefined);
 return {frames,cancel,announce,restore:()=>{raf.mockRestore();cancel.mockRestore();announce.mockRestore();if(descriptor)Object.defineProperty(Platform,'OS',descriptor);}};
}
it('announces acknowledged iOS review and available Undo once after layout, then announces acknowledged Undo without changing its deadline',async()=>{
 const ports=announcementPorts('ios');let view:ReturnType<typeof mount>|undefined;
 try{
  jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[],nextCursor:null}).mockResolvedValueOnce({kind:'ready',items:[{...candidate,revision:'3'}],nextCursor:null});
  jest.mocked(api.readDetectionOwnerRows).mockResolvedValueOnce([owner]).mockResolvedValueOnce([{...owner,status:'DETECTED',revision:'3'}]);
  jest.mocked(api.mutateNativeDetection).mockResolvedValueOnce(reviewed).mockResolvedValueOnce({...reviewed,status:'DETECTED',revision:'3',undoUntil:null});
  view=mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.reviewed);
  expect(ports.announce).not.toHaveBeenCalled();expect(ports.frames).toHaveLength(1);
  expect(screen.getByText(copy.deadline.replace('%{date}',reviewed.undoUntil))).toBeTruthy();
  act(()=>ports.frames[0]!.callback(0));expect(ports.announce).toHaveBeenCalledTimes(1);expect(ports.announce).toHaveBeenCalledWith(`${copy.reviewed} ${copy.undo}`);act(()=>ports.frames[0]!.callback(0));expect(ports.announce).toHaveBeenCalledTimes(1);
  await press(copy.undo);await screen.findByText(copy.undone);expect(ports.frames).toHaveLength(2);act(()=>ports.frames[1]!.callback(0));
  expect(ports.announce.mock.calls).toEqual([[`${copy.reviewed} ${copy.undo}`],[copy.undone]]);
  expect(jest.mocked(api.mutateNativeDetection).mock.calls[1]![0]).toEqual({operation:'undo',receiptId:key,candidateId:id});
 }finally{view?.unmount();ports.restore();}
});
it.each(['blur','unmount','new-read'] as const)('cancels pending iOS acknowledgement speech after %s and fences even an already queued callback',async transition=>{
 const ports=announcementPorts('ios');let view:ReturnType<typeof mount>|undefined;
 try{
  jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.readDetectionOwnerRows).mockResolvedValue([owner]);jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);
  view=mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.reviewed);const frame=ports.frames[0]!;expect(frame).toBeDefined();
  if(transition==='blur')act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});else if(transition==='unmount'){view.unmount();view=undefined;}else await press(copy.refresh);
  expect(ports.cancel).toHaveBeenCalledWith(frame.id);act(()=>frame.callback(0));expect(ports.announce).not.toHaveBeenCalled();
 }finally{view?.unmount();ports.restore();}
});
it('never announces speculative iOS review success when durable owner readback disagrees',async()=>{
 const ports=announcementPorts('ios');let view:ReturnType<typeof mount>|undefined;
 try{jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);view=mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.readback);expect(ports.frames).toHaveLength(0);expect(ports.announce).not.toHaveBeenCalled();}
 finally{view?.unmount();ports.restore();}
});
it('keeps Android review accessibility behavior unchanged',async()=>{
 const ports=announcementPorts('android');let view:ReturnType<typeof mount>|undefined;
 try{jest.mocked(api.readNativeDetections).mockResolvedValueOnce({kind:'ready',items:[candidate],nextCursor:null}).mockResolvedValue({kind:'ready',items:[],nextCursor:null});jest.mocked(api.readDetectionOwnerRows).mockResolvedValue([owner]);jest.mocked(api.mutateNativeDetection).mockResolvedValue(reviewed);view=mount();await login();await press(copy.confirm.replace('%{name}','Netflix'));await screen.findByText(copy.reviewed);expect(ports.frames).toHaveLength(0);expect(ports.announce).not.toHaveBeenCalled();}
 finally{view?.unmount();ports.restore();}
});
