import React from 'react';
import {Modal,Pressable,ScrollView,Text} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativeBillingMonthScreen} from './NativeBillingMonthScreen';
import {NativeSessionProvider,useNativeSession} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as api from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
import {formatMinorUnits} from '@/api/privateMobileMoney';
const mockReplace=jest.fn();const mockFocus:{enabled:boolean;hold?:boolean;start?: (()=>void|(()=>void)) | undefined;cleanup?:void|(()=>void)}={enabled:true};
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace}),useFocusEffect:(callback:()=>void|(()=>void))=>{
 const React=jest.requireActual('react');React.useEffect(()=>{mockFocus.start=callback;if(mockFocus.enabled&&!mockFocus.hold)mockFocus.cleanup=callback();return ()=>{if(!mockFocus.hold)mockFocus.cleanup?.();mockFocus.cleanup=undefined;};},[callback]);
}}));
jest.mock('@/api/privateMobileApi',()=>({verifiedNativeLogin:jest.fn(),completeNativeEnrollment:jest.fn(),rotateNativeSession:jest.fn(),revokeNativeSession:jest.fn(),readNativeProfile:jest.fn(),readNativeMode:jest.fn(),readNativeSubscriptions:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const credentials={transport:'mobile' as const,sessionId:'123e4567-e89b-42d3-a456-426614174000',accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)};
const row={id:credentials.sessionId,revision:'1',source:'MANUAL' as const,visibility:'owner' as const,customName:'Expected saved renewal',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:'9007199254740993',currency:'SEK',nextChargeDate:'2026-03-28',alwaysPrivate:true};
const copy=catalogs.en.onboarding;const now=()=>new Date(2026,2,28,12);
beforeAll(()=>{const f=render(<ScrollView><Text>host</Text><Pressable><Text>button</Text></Pressable></ScrollView>);f.unmount();},60000);
beforeEach(()=>{jest.resetAllMocks();mockFocus.enabled=true;mockFocus.hold=false;mockFocus.start=undefined;mockFocus.cleanup=undefined;
 jest.mocked(api.verifiedNativeLogin).mockResolvedValue(credentials);jest.mocked(api.revokeNativeSession).mockResolvedValue(undefined);
 jest.mocked(api.readNativeProfile).mockResolvedValue({displayName:'Synthetic',avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:true});jest.mocked(api.readNativeMode).mockResolvedValue({mode:'just-me'});
});
function mount(clock=now){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};return render(<NativeSessionProvider store={store}><NativeBillingMonthScreen now={clock}/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));}
it('shows both same-day entries, exact saved totals, detail isolation and management navigation',async()=>{
 const second={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'Second saved service',expectedAmountMinor:'7'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row,second],nextCursor:null});mount();expect(api.readNativeSubscriptions).not.toHaveBeenCalled();await login();await screen.findByText(row.customName);
 expect(screen.getByText(second.customName)).toBeTruthy();expect(screen.getByText(formatMinorUnits(BigInt(row.expectedAmountMinor)+7n,'SEK',{locale:'en',display:'code'}).replace(/[\u00a0\u202f]/g,' '))).toBeTruthy();
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.details.replace('%{name}',row.customName)}));expect(screen.getByText(copy.billingMonth.manual)).toBeTruthy();expect(screen.getByText(copy.billingMonth.private)).toBeTruthy();expect(screen.queryByRole('button',{name:copy.billingMonth.next})).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.manage}));expect(mockReplace).toHaveBeenCalledWith('/personal');
});
it('reads new calendar month and date selection without expanding the original saved dates',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row,{...row,id:'223e4567-e89b-42d3-a456-426614174000',nextChargeDate:'2026-03-30',customName:'Later day'}],nextCursor:null});mount();await login();await screen.findByText(row.customName);
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-03-30')}));await screen.findByText('Later day');expect(screen.queryByText(row.customName)).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.next}));await screen.findByText(copy.billingMonth.empty);expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(2);
});
it('refresh and return from focus reread owner state; current errors retire authority',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,status:'PAUSED'}],nextCursor:null}).mockRejectedValueOnce(new Error('private failure'));mount();await login();await screen.findByText(row.customName);
 act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(screen.queryByText(row.customName)).toBeNull();act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await screen.findByText(copy.billingMonth.empty);
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.refresh}));await screen.findByText(copy.nativePersonal.unavailable);expect(screen.getByRole('button',{name:copy.nativePersonal.verify})).toBeTruthy();
});
it('late rejected reads after blur cannot replace a fresh month or retire its session',async()=>{
 let reject!:(e:Error)=>void;const pending=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeSubscriptions).mockImplementationOnce(()=>pending).mockResolvedValueOnce({items:[row],nextCursor:null});mount();await login();await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1));
 act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(jest.mocked(api.readNativeSubscriptions).mock.calls[0]![1].aborted).toBe(true);act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>{reject(new Error('obsolete private failure'));});await screen.findByText(row.customName);expect(screen.queryByText(copy.nativePersonal.unavailable)).toBeNull();expect(api.revokeNativeSession).not.toHaveBeenCalled();
});
it('logout hides detail and owner projection, retaining acknowledgement against late rejection',async()=>{
 let reject!:(e:Error)=>void;const pending=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeSubscriptions).mockImplementationOnce(()=>pending);mount();await login();await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.logout}));await act(async()=>{reject(new Error('old-owner error'));});await screen.findByText(copy.nativePersonal.logoutConfirmed);expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText(copy.nativePersonal.unavailable)).toBeNull();expect(screen.getByText(copy.nativePersonal.logoutConfirmed)).toBeTruthy();
});
it('incomplete authority shows setup before requesting subscriptions',async()=>{
 jest.mocked(api.readNativeMode).mockResolvedValue({mode:null});mount();await login();await screen.findByText(copy.nativeRenewals.setup);expect(api.readNativeSubscriptions).not.toHaveBeenCalled();
});

it.each([[1,0,'previous'],[9999,11,'next']] as const)('disables impossible month navigation at year %s',async(year,month,direction)=>{
 const date=new Date(0);date.setFullYear(year,month,1);mount(()=>date);await waitFor(()=>expect(screen.getByRole('button',{name:copy.billingMonth[direction]}).props.accessibilityState.disabled).toBe(true));fireEvent.press(screen.getByRole('button',{name:copy.billingMonth[direction]}));expect(api.readNativeSubscriptions).not.toHaveBeenCalled();
});

it('synchronously hides an open private detail when external session authority retires before focus cleanup',async()=>{
 let reject!:(e:Error)=>void;const rotation=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.rotateNativeSession).mockImplementation(()=>rotation);jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});
 function ExternalAuthority(){const session=useNativeSession();return <Pressable accessibilityRole="button" accessibilityLabel="external rotation" onPress={()=>{void session.refresh().catch(()=>undefined);}}><Text>External</Text></Pressable>;}
 const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};
 render(<NativeSessionProvider store={store}><NativeBillingMonthScreen now={now}/><ExternalAuthority/></NativeSessionProvider>);await login();await screen.findByText(row.customName);fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.details.replace('%{name}',row.customName)}));expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
 // Hold the effect cleanup to exercise the render where the old detail state still exists.
 mockFocus.hold=true;fireEvent.press(screen.getByRole('button',{name:'external rotation'}));await waitFor(()=>expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false));expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText(copy.billingMonth.private)).toBeNull();expect(screen.getByRole('button',{name:copy.billingMonth.next})).toBeTruthy();
 await act(async()=>{reject(new Error('retired rotation'));});expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);expect(screen.queryByText(row.customName)).toBeNull();
});

it('renders confirmed undated detection outside totals/day ribbon and hides it after authoritative Undo refresh',async()=>{
 const undated={...row,source:'DETECTED' as const,nextChargeDate:null};jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[undated],nextCursor:null}).mockResolvedValueOnce({items:[{...undated,status:'DETECTED'}],nextCursor:null});mount();await login();await screen.findByText(copy.nativeDetection.undatedTitle);expect(screen.getByText(row.customName)).toBeTruthy();expect(screen.getByText(copy.billingMonth.empty)).toBeTruthy();expect(screen.queryByText(copy.billingMonth.subtotal)).toBeNull();fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.refresh}));await waitFor(()=>expect(screen.queryByText(copy.nativeDetection.undatedTitle)).toBeNull());expect(screen.queryByText(row.customName)).toBeNull();
});
