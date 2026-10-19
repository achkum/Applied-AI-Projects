import React from 'react';
import {Pressable,RefreshControl,ScrollView,Text} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativePersonalRenewalsScreen} from './NativePersonalRenewalsScreen';
import {NativeSessionProvider} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as api from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
import {formatMinorUnits} from '@/api/privateMobileMoney';
const mockReplace=jest.fn();const mockFocus:{enabled:boolean;start?: (()=>void|(()=>void)) | undefined;cleanup?:void|(()=>void)}={enabled:true};
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace}),useFocusEffect:(callback:()=>void|(()=>void))=>{
 const React=jest.requireActual('react');React.useEffect(()=>{mockFocus.start=callback;if(mockFocus.enabled)mockFocus.cleanup=callback();return ()=>{mockFocus.cleanup?.();mockFocus.cleanup=undefined;};},[callback]);
}}));
jest.mock('@/api/privateMobileApi',()=>({verifiedNativeLogin:jest.fn(),completeNativeEnrollment:jest.fn(),rotateNativeSession:jest.fn(),revokeNativeSession:jest.fn(),readNativeProfile:jest.fn(),readNativeMode:jest.fn(),readNativeSubscriptions:jest.fn()}));
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const credentials={transport:'mobile' as const,sessionId:'123e4567-e89b-42d3-a456-426614174000',accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)};
const row={id:credentials.sessionId,revision:'1',source:'MANUAL' as const,visibility:'owner' as const,customName:'Expected saved renewal',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:'9007199254740993',currency:'SEK',nextChargeDate:'2026-03-28',alwaysPrivate:true};
const copy=catalogs.en.onboarding;const now=()=>new Date(2026,2,28,12);
it('sandbox renewals show canonical saved rows and use entry instead of private verification',async()=>{
 const facade={phase:'verification-required' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:jest.fn()};
 const view=render(<NativePersonalRenewalsScreen now={now} sandbox useSession={()=>facade} inactiveContent={<Text>Sandbox entry control</Text>}/>);expect(screen.queryByText(copy.sandbox.noticeShort)).toBeNull();expect(screen.getByText('Sandbox entry control')).toBeTruthy();expect(screen.queryByRole('button',{name:copy.nativePersonal.verify})).toBeNull();view.unmount();
 const {selectNativeRenewals}=jest.requireActual('@/api/privateMobileRenewals');const readProjection=jest.fn().mockResolvedValue({kind:'ready',groups:selectNativeRenewals([row],now())});const active={...facade,phase:'active' as const,run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>work('sandbox-only',new AbortController().signal)};
 render(<NativePersonalRenewalsScreen now={now} sandbox useSession={()=>active} readProjection={readProjection}/>);await screen.findByText(row.customName);expect(api.readNativeSubscriptions).not.toHaveBeenCalled();expect(readProjection).toHaveBeenCalledWith('sandbox-only',expect.anything(),expect.any(Date));
});
beforeAll(()=>{const f=render(<ScrollView><Text>host</Text><Pressable><Text>button</Text></Pressable></ScrollView>);f.unmount();},60000);
beforeEach(()=>{jest.resetAllMocks();mockFocus.enabled=true;mockFocus.start=undefined;mockFocus.cleanup=undefined;
 jest.mocked(api.verifiedNativeLogin).mockResolvedValue(credentials);jest.mocked(api.revokeNativeSession).mockResolvedValue(undefined);
 jest.mocked(api.readNativeProfile).mockResolvedValue({displayName:'Synthetic',avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:true});jest.mocked(api.readNativeMode).mockResolvedValue({mode:'just-me'});
});
function mount(){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};return render(<NativeSessionProvider store={store}><NativePersonalRenewalsScreen now={now}/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));}
it('requires fresh verification, then shows only expected saved dates with exact Money and return-to-list',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});mount();expect(screen.queryByText(row.customName)).toBeNull();expect(api.readNativeSubscriptions).not.toHaveBeenCalled();await login();
 await screen.findByText(row.customName);expect(screen.getByText('2026-03-28')).toBeTruthy();expect(screen.getByText(`${formatMinorUnits(BigInt(row.expectedAmountMinor),'SEK',{locale:'en',display:'code'})}`)).toBeTruthy();
 expect(screen.queryByRole('button',{name:copy.nativePersonal.logout})).toBeNull();
 fireEvent.press(screen.getByRole('tab',{name:copy.productNav.manage}));expect(mockReplace).toHaveBeenCalledWith('/personal');
});
it('keeps partial first-page private rows hidden until terminal cursor has been read',async()=>{
 let finish!:(value:{items:typeof row[];nextCursor:null})=>void;const pending=new Promise<{items:typeof row[];nextCursor:null}>(ok=>{finish=ok;});
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:'cursorA'}).mockImplementationOnce(()=>pending);mount();await login();await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(2));
 expect(screen.queryByText(row.customName)).toBeNull();expect(screen.getByText(copy.nativePersonal.loading)).toBeTruthy();await act(async()=>{finish({items:[],nextCursor:null});});await screen.findByText(row.customName);
});
it('shows empty and setup-required distinctly, without using missing dates or incomplete authority',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,nextChargeDate:null}],nextCursor:null});const f=mount();await login();await screen.findByText(copy.nativeRenewals.empty);f.unmount();
 jest.mocked(api.readNativeMode).mockResolvedValue({mode:null});mount();await login();await screen.findByText(copy.nativeRenewals.setup);expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});
it('current API failure retires authority and shows unavailable without private row content',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockRejectedValue(new Error('private storage value'));mount();await login();await screen.findByText(copy.nativePersonal.unavailable);expect(screen.queryByText(row.customName)).toBeNull();expect(screen.getByRole('button',{name:copy.nativePersonal.verify})).toBeTruthy();
});
it('focus return and native pull-to-refresh read changed saved status rather than retaining a paused renewal',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,status:'PAUSED'}],nextCursor:null}).mockResolvedValueOnce({items:[{...row,customName:'Fresh edited renewal'}],nextCursor:null});mount();await login();await screen.findByText(row.customName);
 act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(screen.queryByText(row.customName)).toBeNull();act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await screen.findByText(copy.nativeRenewals.empty);
 expect(screen.queryByRole('button',{name:copy.nativeRenewals.refresh})).toBeNull();fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');await screen.findByText('Fresh edited renewal');expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(3);
});
it('uses one contextual Home action and enables pull-to-refresh only for current authority',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});mount();expect(screen.getByTestId('native-renewals-scroll')).toBeTruthy();expect(screen.UNSAFE_getByType(RefreshControl).props.enabled).toBe(false);await login();await screen.findByText(row.customName);
 expect(screen.UNSAFE_getByType(RefreshControl).props.enabled).toBe(true);expect(screen.queryByRole('button',{name:copy.nativeRenewals.refresh})).toBeNull();fireEvent.press(screen.getByRole('button',{name:copy.productNav.home}));expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');
});
it('shows a compact retry only after a current read failure, preserving exact readback on recovery',async()=>{
 const session={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>work('active-owner',new AbortController().signal)};
 const reader=jest.fn().mockRejectedValueOnce(new Error('Read unavailable')).mockResolvedValueOnce({kind:'ready',groups:[{date:row.nextChargeDate,items:[row]}]});render(<NativePersonalRenewalsScreen useSession={()=>session} readProjection={reader} now={now}/>);
 await screen.findByText(copy.nativePersonal.unavailable);fireEvent.press(screen.getByRole('button',{name:catalogs.en.actions.retry}));await screen.findByText(row.customName);expect(screen.getByText(formatMinorUnits(BigInt(row.expectedAmountMinor),'SEK',{locale:'en',display:'code'}))).toBeTruthy();expect(screen.queryByRole('button',{name:catalogs.en.actions.retry})).toBeNull();expect(reader).toHaveBeenCalledTimes(2);
});
it('blur aborts an obsolete read without logout, and a late result cannot replace a fresh focused agenda',async()=>{
 let finish!:(value:{items:typeof row[];nextCursor:null})=>void;const pending=new Promise<{items:typeof row[];nextCursor:null}>(ok=>{finish=ok;});
 jest.mocked(api.readNativeSubscriptions).mockImplementationOnce(()=>pending).mockResolvedValueOnce({items:[{...row,customName:'Fresh focused renewal'}],nextCursor:null});mount();await login();await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1));const signal=jest.mocked(api.readNativeSubscriptions).mock.calls[0]![1];
 act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(signal.aborted).toBe(true);act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>{finish({items:[row],nextCursor:null});});await screen.findByText('Fresh focused renewal');expect(screen.queryByText(row.customName)).toBeNull();expect(api.revokeNativeSession).not.toHaveBeenCalled();
});
it.each(['duplicate','cursor'])('bad multi-page %s data never displays a successful agenda',async defect=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:'cursorA'}).mockResolvedValueOnce({items:defect==='duplicate'?[row]:[],nextCursor:defect==='cursor'?'cursorA':null});mount();await login();await screen.findByText(copy.nativePersonal.unavailable);expect(screen.queryByText(row.customName)).toBeNull();
});
