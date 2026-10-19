import React from 'react';
import {AccessibilityInfo,Modal,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from 'react-native';
import {NativeProductCard} from './NativeProductUI';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react-native';
import {NativeBillingMonthScreen,billingMonthAxisLabelDates} from './NativeBillingMonthScreen';
import {billingMonthCalendarDates} from '@/api/privateMobileBillingMonth';
import {NativeSubscriptionDetailContent} from './NativeSubscriptionDetailContent';
import {NativeSessionProvider,useNativeSession} from '@/state/NativeSession';
import type {NativeBundleStore} from '@/utils/secureSessionBundle';
import * as api from '@/api/privateMobileApi';
import {catalogs} from '@subtrack/i18n';
import {formatMinorUnits} from '@/api/privateMobileMoney';
const mockReplace=jest.fn();const mockFocus:{enabled:boolean;hold?:boolean;start?: (()=>void|(()=>void)) | undefined;cleanup?:void|(()=>void)}={enabled:true};
it('keeps today legible without adjacent ribbon-axis labels at every date and month boundary',()=>{
 for(const month of [{year:2024,month:2},{year:2026,month:2},{year:2026,month:10}]){
  const dates=billingMonthCalendarDates(month);
  for(const today of dates){const labels=[...billingMonthAxisLabelDates(dates,today)];expect(labels).toContain(today);const positions=labels.map(date=>dates.indexOf(date));for(let index=1;index<positions.length;index++)expect(positions[index]!-positions[index-1]!).toBeGreaterThanOrEqual(3);}
 }
 const october=billingMonthCalendarDates({year:2026,month:10});expect([...billingMonthAxisLabelDates(october,'2026-11-01')]).toEqual(['2026-10-01','2026-10-08','2026-10-22','2026-10-29']);expect([...billingMonthAxisLabelDates(october,'2026-10-18')]).not.toContain('2026-10-19');
});
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:mockReplace,push:mockReplace}),useFocusEffect:(callback:()=>void|(()=>void))=>{
 const React=jest.requireActual('react');React.useEffect(()=>{mockFocus.start=callback;const cleanup=mockFocus.enabled&&!mockFocus.hold?callback():undefined;mockFocus.cleanup=cleanup;return ()=>{if(!mockFocus.hold)cleanup?.();if(mockFocus.cleanup===cleanup)mockFocus.cleanup=undefined;};},[callback]);
}}));
jest.mock('@/api/privateMobileApi',()=>({verifiedNativeLogin:jest.fn(),completeNativeEnrollment:jest.fn(),rotateNativeSession:jest.fn(),revokeNativeSession:jest.fn(),readNativeProfile:jest.fn(),readNativeMode:jest.fn(),readNativeSubscriptions:jest.fn()}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const credentials={transport:'mobile' as const,sessionId:'123e4567-e89b-42d3-a456-426614174000',accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)};
const row={id:credentials.sessionId,revision:'1',source:'MANUAL' as const,visibility:'owner' as const,customName:'Expected saved renewal',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:'9007199254740993',currency:'SEK',nextChargeDate:'2026-03-28',alwaysPrivate:true};
const copy=catalogs.en.onboarding;const now=()=>new Date(2026,2,28,12);
it('sandbox dependency port reuses Month totals and replaces private inactive controls',async()=>{
 const facade={phase:'verification-required' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:jest.fn()};
 const view=render(<NativeBillingMonthScreen now={now} sandbox useSession={()=>facade} inactiveContent={<Text>Sandbox entry control</Text>}/>);
 expect(screen.queryByText(copy.sandbox.noticeShort)).toBeNull();expect(screen.getByText('Sandbox entry control')).toBeTruthy();expect(screen.queryByRole('button',{name:copy.nativePersonal.verify})).toBeNull();view.unmount();
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth');const readProjection=jest.fn().mockResolvedValue({kind:'ready',projection:selectBillingMonth([row],{year:2026,month:3})});
 const active={...facade,phase:'active' as const,run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>work('sandbox-only',new AbortController().signal)};
 render(<NativeBillingMonthScreen now={now} sandbox useSession={()=>active} readProjection={readProjection}/>);await screen.findByText(row.customName);expect(readProjection).toHaveBeenCalledWith('sandbox-only',expect.anything(),{year:2026,month:3});expect(api.readNativeSubscriptions).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:copy.nativeDetection.open})).toBeNull();
});
beforeAll(()=>{const f=render(<ScrollView><Text>host</Text><Pressable><Text>button</Text></Pressable></ScrollView>);f.unmount();},60000);
beforeEach(()=>{jest.resetAllMocks();jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);jest.spyOn(AccessibilityInfo,'addEventListener').mockReturnValue({remove:jest.fn()} as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>);mockFocus.enabled=true;mockFocus.hold=false;mockFocus.start=undefined;mockFocus.cleanup=undefined;
 jest.mocked(api.verifiedNativeLogin).mockResolvedValue(credentials);jest.mocked(api.revokeNativeSession).mockResolvedValue(undefined);
 jest.mocked(api.readNativeProfile).mockResolvedValue({displayName:'Synthetic',avatarColourToken:null,avatarEmoji:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:true});jest.mocked(api.readNativeMode).mockResolvedValue({mode:'just-me'});
});
function mount(clock=now){const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};return render(<NativeSessionProvider store={store}><NativeBillingMonthScreen now={clock}/></NativeSessionProvider>);}
async function login(){await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));}
function refresh(){fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');}
it('shows both same-day entries, exact saved totals, detail isolation and management navigation',async()=>{
 const second={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'Second saved service',expectedAmountMinor:'7'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row,second],nextCursor:null});mount();expect(api.readNativeSubscriptions).not.toHaveBeenCalled();await login();await screen.findByText(row.customName);
 expect(screen.getByText(second.customName)).toBeTruthy();expect(screen.getByText(formatMinorUnits(BigInt(row.expectedAmountMinor)+7n,'SEK',{locale:'en',display:'code'}).replace(/[\u00a0\u202f]/g,' '))).toBeTruthy();
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.details.replace('%{name}',row.customName)}));expect(screen.getByText(copy.billingMonth.manual)).toBeTruthy();expect(screen.queryByText(copy.billingMonth.private)).toBeNull();expect(screen.queryByRole('button',{name:copy.billingMonth.next})).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.manage}));expect(mockReplace).toHaveBeenCalledWith('/personal');
});
it.each(['week','selected-day'] as const)('opens the exact %s renewal through its stable row ID while preserving spoken name and amount metadata',async placement=>{
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth'),{projectNativeAnalytics}=jest.requireActual('@/api/nativeAnalyticsProjection');
 const clock=()=>new Date(2026,2,placement==='week'?28:20,12);
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection:projectNativeAnalytics([row],null,clock())});
 const readProjection=jest.fn().mockResolvedValue({kind:'ready',projection:selectBillingMonth([row],{year:2026,month:3})});
 const active={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(operation:(token:string,signal:AbortSignal)=>Promise<T>)=>operation('scoped-owner',new AbortController().signal)};
 render(<NativeBillingMonthScreen now={clock} useSession={()=>active} readProjection={readProjection} overviewReader={reader}/>);
 const target=await screen.findByTestId('native-month-detail-row'),price=formatMinorUnits(BigInt(row.expectedAmountMinor),'SEK',{locale:'en',display:'code'}).replace(/[\u00a0\u202f]/g,' ');
 expect(screen.getAllByTestId('native-month-detail-row')).toHaveLength(1);
 expect(target.props.accessibilityRole).toBe('button');expect(target.props.accessibilityLabel).toBe(copy.billingMonth.details.replace('%{name}',row.customName));
 expect(screen.getByText(row.customName)).toBeTruthy();expect(screen.getAllByText(price).length).toBeGreaterThan(0);
 if(placement==='week')expect(target.props.accessibilityValue).toEqual({text:`2026-03-28 · ${price}`});
 fireEvent.press(target);
 await screen.findByRole('header',{name:row.customName});expect(screen.getByText('2026-03-28')).toBeTruthy();expect(screen.getByText(copy.billingMonth.manual)).toBeTruthy();
 expect(screen.getByLabelText(`${price} · ${copy.ownerSubscriptions.cadence.MONTHLY}`)).toBeTruthy();expect(readProjection).toHaveBeenCalledTimes(1);
});
it('keeps month-axis labels on one centered line below a continuous token-colored baseline without changing dates',async()=>{
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth'),{projectNativeAnalytics}=jest.requireActual('@/api/nativeAnalyticsProjection');
 const clock=()=>new Date(2026,9,18,12),saved={...row,nextChargeDate:'2026-10-19'},reader=jest.fn().mockResolvedValue({kind:'ready',projection:projectNativeAnalytics([saved],null,clock())});
 const readProjection=jest.fn().mockResolvedValue({kind:'ready',projection:selectBillingMonth([saved],{year:2026,month:10})}),active={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(operation:(token:string,signal:AbortSignal)=>Promise<T>)=>operation('scoped-owner',new AbortController().signal)};
 render(<NativeBillingMonthScreen now={clock} useSession={()=>active} readProjection={readProjection} overviewReader={reader}/>);
 const chart=await screen.findByTestId('native-month-ribbon'),labels:readonly {props:{children:React.ReactNode}}[]=chart.findAllByType(Text);expect(labels).toHaveLength(31);expect(labels.map(label=>String(label.props.children)).filter(label=>label.trim())).toEqual(['1','8','18','22','29']);
 const tokens=jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json');
 for(const label of chart.findAllByType(Text))expect(StyleSheet.flatten(label.parent?.props.style)).toMatchObject({alignSelf:'stretch',alignItems:'center',borderTopWidth:1,borderTopColor:tokens.color.light['line.hairline'],marginTop:8,paddingTop:6});
 for(const label of ['22','29']){const text=within(chart).getByText(label);expect(text.props.numberOfLines).toBe(1);expect(StyleSheet.flatten(text.props.style)).toMatchObject({width:28,maxWidth:28,textAlign:'center'});let column=text.parent;while(column&&StyleSheet.flatten(column.props.style)?.flex!==1)column=column.parent;expect(StyleSheet.flatten(column?.props.style)).toMatchObject({flex:1,minWidth:0});}
 expect(screen.getByTestId('native-month-selected-date').props.children).toBe(saved.nextChargeDate);expect(screen.getByTestId('native-home-calendar')).toBeTruthy();
});
it('shared detail body keeps exact large Money and annual cost, owns no Modal and exposes its top Close action',()=>{
 const close=jest.fn(),manage=jest.fn();render(<NativeSubscriptionDetailContent item={row} onClose={close} onManage={manage}/>);
 const price=formatMinorUnits(BigInt(row.expectedAmountMinor),'SEK',{locale:'en',display:'code'}).replace(/[\u00a0\u202f]/g,' ');
 expect(screen.getByRole('header',{name:row.customName})).toBeTruthy();expect(screen.getByText(price.replace('SEK','').trim())).toBeTruthy();
 expect(screen.getByText(formatMinorUnits(BigInt(row.expectedAmountMinor)*12n,'SEK',{locale:'en',display:'code'}).replace(/[\u00a0\u202f]/g,' '))).toBeTruthy();
 expect(screen.UNSAFE_queryByType(Modal)).toBeNull();fireEvent.press(screen.getByRole('button',{name:catalogs.en.actions.close}));expect(close).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.manage}));expect(manage).toHaveBeenCalledTimes(1);
});
it('shared detail body leaves custom cadence annual cost unknown and preserves injected real actions',()=>{
 render(<NativeSubscriptionDetailContent item={{...row,cadence:'CUSTOM',nextChargeDate:null}} onClose={jest.fn()} actions={<Text>Owned action</Text>}/>);
 expect(screen.getByText(catalogs.en.nativeProductDetails.notSet)).toBeTruthy();expect(screen.getByText(catalogs.en.nativeProductDetails.unknown)).toBeTruthy();expect(screen.queryByText(copy.manualSubscription.placeholder)).toBeNull();expect(screen.getByText('Owned action')).toBeTruthy();expect(screen.queryByRole('button',{name:copy.billingMonth.manage})).toBeNull();
});
it('keeps account controls in Profile and uses the five product tabs without duplicate Upcoming or Refresh buttons',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});mount();await login();await screen.findByText(copy.billingMonth.empty);
 expect(screen.queryByRole('button',{name:copy.nativePersonal.logout})).toBeNull();for(const theme of Object.values(catalogs.en.preferences.themes))expect(screen.queryByRole('button',{name:theme})).toBeNull();
 expect(screen.queryByRole('button',{name:copy.productNav.upcoming})).toBeNull();expect(screen.queryByRole('button',{name:copy.billingMonth.refresh})).toBeNull();
 fireEvent.press(screen.getByRole('tab',{name:copy.productNav.home}));expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');
 fireEvent.press(screen.getByRole('tab',{name:copy.productNav.manage}));expect(mockReplace).toHaveBeenLastCalledWith('/personal');
});
it('renders every selectable month date and shows a date-scoped empty state without hiding other saved dates',async()=>{
 const second={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'Second same-day service',expectedAmountMinor:'7'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row,second],nextCursor:null});mount();await login();await screen.findByText(row.customName);
 const day28=copy.billingMonth.day.replace('%{date}','2026-03-28'),day29=copy.billingMonth.day.replace('%{date}','2026-03-29'),day31=copy.billingMonth.day.replace('%{date}','2026-03-31');
 expect(screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-03-01')})).toBeTruthy();expect(screen.getByRole('button',{name:day31})).toBeTruthy();
 expect(screen.getByRole('button',{name:day28}).props.accessibilityState.selected).toBe(true);
 fireEvent.press(screen.getByRole('button',{name:day29}));expect(screen.queryByText('2026-03-29')).toBeNull();expect(screen.queryByText(copy.billingMonth.dayEmpty)).toBeNull();
 expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText(second.customName)).toBeNull();expect(screen.queryByText(copy.billingMonth.empty)).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:day28}));await screen.findByText(row.customName);expect(screen.getByText(second.customName)).toBeTruthy();expect(screen.queryByText(copy.billingMonth.dayEmpty)).toBeNull();
});
it('reads new calendar month and date selection without expanding the original saved dates',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row,{...row,id:'223e4567-e89b-42d3-a456-426614174000',nextChargeDate:'2026-03-30',customName:'Later day'}],nextCursor:null});mount();await login();await screen.findByText(row.customName);
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-03-30')}));await screen.findByText('Later day');expect(screen.queryByText(row.customName)).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.next}));await screen.findByText(copy.billingMonth.empty);expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(2);
});
it('reveals the selected saved day using measured ribbon geometry without snapping during browsing',async()=>{
 const selectedRow={...row,nextChargeDate:'2026-03-17'};jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[selectedRow],nextCursor:null});
 const scrollTo=jest.spyOn(ScrollView.prototype,'scrollTo').mockImplementation(()=>{});
 try{
  mount();await login();await screen.findByText(selectedRow.customName);
  const ribbon=screen.UNSAFE_getAllByType(ScrollView).find(node=>node.props.horizontal);expect(ribbon).toBeTruthy();expect(screen.getByTestId('native-month-ribbon').props.horizontal).toBe(true);expect(screen.UNSAFE_getAllByType(ScrollView).filter(node=>node.props.testID==='native-month-ribbon')).toHaveLength(1);
  const day=screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-03-17')});
  fireEvent(ribbon!,'layout',{nativeEvent:{layout:{x:0,y:0,width:240,height:64}}});
  fireEvent(ribbon!,'contentSizeChange',1800,64);
  fireEvent(day,'layout',{nativeEvent:{layout:{x:100,y:0,width:52,height:64}}});expect(scrollTo).not.toHaveBeenCalled();
  fireEvent(day,'layout',{nativeEvent:{layout:{x:920,y:0,width:52,height:64}}});
  expect(scrollTo).toHaveBeenCalledWith({x:732,y:0,animated:false});
  scrollTo.mockClear();fireEvent(ribbon!,'scroll',{nativeEvent:{contentOffset:{x:732,y:0},layoutMeasurement:{width:240,height:64},contentSize:{width:1800,height:64}}});
  expect(scrollTo).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-03-18')}));expect(scrollTo).not.toHaveBeenCalled();
 }finally{scrollTo.mockRestore();}
});
it('ignores old month day geometry after navigation invalidates the ribbon',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});
 const scrollTo=jest.spyOn(ScrollView.prototype,'scrollTo').mockImplementation(()=>{});
 try{
  mount();await login();await screen.findByText(row.customName);const staleDay=screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-03-28')}),lateLayout=staleDay.props.onLayout,staleRibbon=screen.UNSAFE_getAllByType(ScrollView).find(node=>node.props.horizontal)!,lateScroll=staleRibbon.props.onScroll;
  fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.next}));await screen.findByText(copy.billingMonth.empty);expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(2);
  scrollTo.mockClear();lateLayout({nativeEvent:{layout:{x:1600,y:0,width:52,height:64}}});lateScroll({nativeEvent:{contentOffset:{x:700,y:0},layoutMeasurement:{width:240,height:64},contentSize:{width:1800,height:64}}});expect(scrollTo).not.toHaveBeenCalled();
  const ribbon=screen.UNSAFE_getAllByType(ScrollView).find(node=>node.props.horizontal)!;fireEvent(ribbon,'layout',{nativeEvent:{layout:{x:0,y:0,width:240,height:64}}});fireEvent(ribbon,'contentSizeChange',1800,64);
  fireEvent(screen.getByRole('button',{name:copy.billingMonth.day.replace('%{date}','2026-04-01')}),'layout',{nativeEvent:{layout:{x:0,y:0,width:52,height:64}}});expect(scrollTo).not.toHaveBeenCalled();
 }finally{scrollTo.mockRestore();}
});
it('refresh and return from focus reread owner state; current errors retire authority',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,status:'PAUSED'}],nextCursor:null}).mockRejectedValueOnce(new Error('private failure'));mount();await login();await screen.findByText(row.customName);
 act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(screen.queryByText(row.customName)).toBeNull();act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await screen.findByText(copy.billingMonth.empty);
 refresh();await screen.findByText(copy.nativePersonal.unavailable);expect(screen.getByRole('button',{name:copy.nativePersonal.verify})).toBeTruthy();
});
it('late rejected reads after blur cannot replace a fresh month or retire its session',async()=>{
 let reject!:(e:Error)=>void;const pending=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.readNativeSubscriptions).mockImplementationOnce(()=>pending).mockResolvedValueOnce({items:[row],nextCursor:null});mount();await login();await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1));
 act(()=>{mockFocus.enabled=false;mockFocus.cleanup?.();});expect(jest.mocked(api.readNativeSubscriptions).mock.calls[0]![1].aborted).toBe(true);act(()=>{mockFocus.enabled=true;mockFocus.cleanup=mockFocus.start?.();});await act(async()=>{reject(new Error('obsolete private failure'));});await screen.findByText(row.customName);expect(screen.queryByText(copy.nativePersonal.unavailable)).toBeNull();expect(api.revokeNativeSession).not.toHaveBeenCalled();
});
it('incomplete authority shows setup before requesting subscriptions',async()=>{
 jest.mocked(api.readNativeMode).mockResolvedValue({mode:null});mount();await login();await screen.findByText(copy.nativeRenewals.setup);expect(api.readNativeSubscriptions).not.toHaveBeenCalled();
});

it.each([[1,0,'previous'],[9999,11,'next']] as const)('disables impossible month navigation at year %s',async(year,month,direction)=>{
 const date=new Date(0);date.setFullYear(year,month,1);jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});mount(()=>date);expect(screen.queryByRole('button',{name:copy.billingMonth[direction]})).toBeNull();await login();await screen.findByText(copy.billingMonth.empty);const reads=jest.mocked(api.readNativeSubscriptions).mock.calls.length;await waitFor(()=>expect(screen.getByRole('button',{name:copy.billingMonth[direction]}).props.accessibilityState.disabled).toBe(true));fireEvent.press(screen.getByRole('button',{name:copy.billingMonth[direction]}));expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(reads);
});

it('synchronously hides an open private detail when external session authority retires before focus cleanup',async()=>{
 let reject!:(e:Error)=>void;const rotation=new Promise<never>((_,fail)=>{reject=fail;});jest.mocked(api.rotateNativeSession).mockImplementation(()=>rotation);jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});
 function ExternalAuthority(){const session=useNativeSession();return <Pressable accessibilityRole="button" accessibilityLabel="external rotation" onPress={()=>{void session.refresh().catch(()=>undefined);}}><Text>External</Text></Pressable>;}
 const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};
 render(<NativeSessionProvider store={store}><NativeBillingMonthScreen now={now}/><ExternalAuthority/></NativeSessionProvider>);await login();await screen.findByText(row.customName);fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.details.replace('%{name}',row.customName)}));expect(screen.UNSAFE_getAllByType(Modal).find(modal=>modal.props.testID==='native-month-detail-modal')!.props.visible).toBe(true);
 // Hold the effect cleanup to exercise the render where the old detail state still exists.
 mockFocus.hold=true;fireEvent.press(screen.getByRole('button',{name:'external rotation'}));await waitFor(()=>expect(screen.UNSAFE_getAllByType(Modal).find(modal=>modal.props.testID==='native-month-detail-modal')!.props.visible).toBe(false));expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText(copy.billingMonth.private)).toBeNull();expect(screen.queryByRole('button',{name:copy.billingMonth.next})).toBeNull();expect(screen.queryByRole('tab',{name:copy.productNav.manage})).toBeNull();
 await act(async()=>{reject(new Error('retired rotation'));});expect(screen.UNSAFE_getAllByType(Modal).find(modal=>modal.props.testID==='native-month-detail-modal')!.props.visible).toBe(false);expect(screen.queryByText(row.customName)).toBeNull();
});

it('renders confirmed undated detection outside totals/day ribbon and hides it after authoritative Undo refresh',async()=>{
 const undated={...row,source:'DETECTED' as const,nextChargeDate:null};jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[undated],nextCursor:null}).mockResolvedValueOnce({items:[{...undated,status:'DETECTED'}],nextCursor:null});mount();await login();await screen.findByText(copy.nativeDetection.undatedTitle);expect(screen.getByText(row.customName)).toBeTruthy();expect(screen.getByText(copy.billingMonth.empty)).toBeTruthy();expect(screen.queryByText(copy.billingMonth.subtotal)).toBeNull();refresh();await waitFor(()=>expect(screen.queryByText(copy.nativeDetection.undatedTitle)).toBeNull());expect(screen.queryByText(row.customName)).toBeNull();
});

it('keeps the Home household scope, calendar rows and exact totals consistent without new owner reads',async()=>{
 const first={...row,expectedAmountMinor:'10000'},second={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'Second family plan',expectedAmountMinor:'7000',nextChargeDate:'2026-03-30'};
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth'),{projectNativeAnalytics}=jest.requireActual('@/api/nativeAnalyticsProjection');
 const memberId='323e4567-e89b-42d3-a456-426614174000';
 const household={id:'423e4567-e89b-42d3-a456-426614174000',name:'Example family',members:[{id:credentials.sessionId,displayName:'Example parent',role:'ADMIN'},{id:memberId,displayName:'Example child',role:'DEPENDANT'}],assignments:[{subscriptionId:first.id,memberIds:[credentials.sessionId],payerMemberId:credentials.sessionId},{subscriptionId:second.id,memberIds:[memberId],payerMemberId:memberId}]};
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection:{...projectNativeAnalytics([first,second],null,now()),household}});
 const readProjection=jest.fn().mockResolvedValue({kind:'ready',projection:selectBillingMonth([first,second],{year:2026,month:3})});
 const active={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(operation:(token:string,signal:AbortSignal)=>Promise<T>)=>operation('scoped-owner',new AbortController().signal)};
 render(<NativeBillingMonthScreen now={now} useSession={()=>active} readProjection={readProjection} overviewReader={reader}/>);
 await screen.findByRole('header',{name:household.name});
 expect(screen.getByTestId('native-home-title').props.children).toBe(household.name);expect(screen.getByTestId('native-home-calendar').props.accessibilityLabel).toContain('2026');
 const detail=(name:string)=>copy.billingMonth.details.replace('%{name}',name);
 const weekCard=screen.UNSAFE_getAllByType(NativeProductCard).find(card=>card.findAllByProps({accessibilityLabel:detail(first.customName)}).length>0)!;
 expect(StyleSheet.flatten(weekCard.props.style)).toMatchObject({paddingVertical:0,gap:0});expect(StyleSheet.flatten(weekCard.findAllByType(View)[0]!.props.style).backgroundColor).toBe(jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json').color.light['bg.surface']);
 expect(screen.getByText(`${copy.datePicker.today} · Example parent`)).toBeTruthy();expect(screen.getByRole('button',{name:detail(first.customName)}).props.accessibilityValue.text).toContain(copy.nativeHousehold.plannedPayer.replace('%{name}','Example parent'));expect(screen.getByRole('button',{name:detail(first.customName)}).props.accessibilityValue.text).toContain('2026-03-28');expect(screen.getByText(catalogs.en.nativeProductDetails.earlierDates)).toBeTruthy();
 expect(screen.getByRole('button',{name:detail(first.customName)})).toBeTruthy();expect(screen.getByRole('button',{name:detail(second.customName)})).toBeTruthy();
 fireEvent.press(screen.getByTestId(`native-home-scope-${memberId}`));
 expect(screen.queryByRole('button',{name:detail(first.customName)})).toBeNull();expect(screen.getByRole('button',{name:detail(second.customName)})).toBeTruthy();
 fireEvent.press(screen.getByTestId('native-home-scope-everyone'));
 expect(screen.getByRole('button',{name:detail(first.customName)})).toBeTruthy();expect(reader).toHaveBeenCalledTimes(1);expect(readProjection).toHaveBeenCalledTimes(1);
 expect(screen.getByTestId('native-home-calendar')).toBeTruthy();
 // The reference overview fits the whole month; precise accessible selection uses the real picker.
 const chart=screen.getByTestId('native-month-ribbon');
 fireEvent(chart,'layout',{nativeEvent:{layout:{width:310}}});
 fireEvent.press(chart,{nativeEvent:{locationX:295}});
 expect(screen.getByTestId('native-month-selected-date').props.children).toBe('2026-03-30');
 fireEvent.press(screen.getByTestId('native-home-calendar'));
 fireEvent.press(screen.getByTestId('native-date-2026-03-05'));
 expect(screen.getByTestId('native-month-selected-date').props.children).toBe('2026-03-05');
 expect(screen.queryByTestId('native-date-2026-03-05')).toBeNull();
});

it('keeps the compact Upcoming route available from an empty Home week',async()=>{
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth'),{projectNativeAnalytics}=jest.requireActual('@/api/nativeAnalyticsProjection');
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection:projectNativeAnalytics([],null,now())});
 const readProjection=jest.fn().mockResolvedValue({kind:'ready',projection:selectBillingMonth([],{year:2026,month:3})});
 const active={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(operation:(token:string,signal:AbortSignal)=>Promise<T>)=>operation('scoped-owner',new AbortController().signal)};
 render(<NativeBillingMonthScreen now={now} useSession={()=>active} readProjection={readProjection} overviewReader={reader}/>);
 const upcoming=await screen.findByRole('button',{name:copy.productNav.upcoming});
 expect(screen.getByTestId('native-home-upcoming')).toBe(upcoming);
 expect(screen.getByText(catalogs.en.nativeProductDetails.noRenewalsThisWeek)).toBeTruthy();
 expect(screen.queryByText(copy.billingMonth.empty)).toBeNull();expect(screen.getByRole('button',{name:catalogs.en.nativeAnalytics.connectBank})).toBeTruthy();expect(screen.getByRole('button',{name:catalogs.en.nativeAnalytics.addManually})).toBeTruthy();
 fireEvent.press(upcoming);expect(mockReplace).toHaveBeenCalledWith('/personal-home');
 expect(screen.queryByRole('button',{name:copy.billingMonth.refresh})).toBeNull();
 expect(screen.getByTestId('native-month-scroll').props.refreshControl).toBeTruthy();
});

it('one Home pull refresh rereads both calendar and analytics through the real active session',async()=>{
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth'),{projectNativeAnalytics}=jest.requireActual('@/api/nativeAnalyticsProjection');
 const first={...row,expectedAmountMinor:'10000'},second={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'New current owner service',expectedAmountMinor:'7000',nextChargeDate:'2026-03-30'};
 let saved=[first];
 const reader=jest.fn(async(token:string,signal:AbortSignal,at:Date)=>{expect(token).toBe(credentials.accessToken);expect(signal.aborted).toBe(false);return {kind:'ready' as const,projection:projectNativeAnalytics(saved,null,at)};});
 const readProjection=jest.fn(async(token:string,signal:AbortSignal,month:{year:number;month:number})=>{expect(token).toBe(credentials.accessToken);expect(signal.aborted).toBe(false);return {kind:'ready' as const,projection:selectBillingMonth(saved,month)};});
 const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};
 render(<NativeSessionProvider store={store}><NativeBillingMonthScreen now={now} overviewReader={reader} readProjection={readProjection}/></NativeSessionProvider>);
 await login();await screen.findByTestId('native-month-detail-row');await screen.findByLabelText(formatMinorUnits(10000n,'SEK',{locale:'en',display:'code'}));expect(reader).toHaveBeenCalledTimes(1);expect(readProjection).toHaveBeenCalledTimes(1);
 saved=[{...first,revision:'2',expectedAmountMinor:'20000'},second];refresh();
 await screen.findByRole('button',{name:copy.billingMonth.details.replace('%{name}',second.customName)});await screen.findByLabelText(formatMinorUnits(27000n,'SEK',{locale:'en',display:'code'}));
 expect(screen.getByText(catalogs.en.nativeAnalytics.activePlans.replace('%{count}','2'))).toBeTruthy();expect(reader).toHaveBeenCalledTimes(2);expect(readProjection).toHaveBeenCalledTimes(2);expect(screen.queryByRole('button',{name:copy.nativePersonal.verify})).toBeNull();
 const chart=screen.getByTestId('native-month-ribbon');fireEvent(chart,'layout',{nativeEvent:{layout:{width:310}}});fireEvent.press(chart,{nativeEvent:{locationX:295}});expect(reader).toHaveBeenCalledTimes(2);expect(readProjection).toHaveBeenCalledTimes(2);
});

it.each([{month:10,today:'2026-10-31',following:'2026-11-02'},{month:12,today:'2026-12-31',following:'2027-01-02'}])('keeps scoped next-seven-days dates across month $month independently of calendar navigation',async({month,today,following})=>{
 const {selectBillingMonth}=jest.requireActual('@/api/privateMobileBillingMonth'),{projectNativeAnalytics}=jest.requireActual('@/api/nativeAnalyticsProjection'),clock=()=>new Date(2026,month-1,31,12);
 const first={...row,expectedAmountMinor:'10000',nextChargeDate:today},second={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'Next month child service',expectedAmountMinor:'7000',nextChargeDate:following},outside={...row,id:'623e4567-e89b-42d3-a456-426614174000',customName:'Outside seven-day window',nextChargeDate:following.slice(0,8)+'08'},memberId='323e4567-e89b-42d3-a456-426614174000';
 const household={id:'423e4567-e89b-42d3-a456-426614174000',name:'Boundary household',members:[{id:credentials.sessionId,displayName:'Parent',role:'ADMIN'},{id:memberId,displayName:'Child',role:'DEPENDANT'}],assignments:[{subscriptionId:first.id,memberIds:[credentials.sessionId],payerMemberId:credentials.sessionId},{subscriptionId:second.id,memberIds:[memberId],payerMemberId:memberId}]};
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection:{...projectNativeAnalytics([first,second,outside],null,clock()),household}}),readProjection=jest.fn(async(_token:string,_signal:AbortSignal,chosen:{year:number;month:number})=>({kind:'ready' as const,projection:selectBillingMonth([first,second,outside],chosen)}));
 const active={phase:'active' as const,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async<T,>(operation:(token:string,signal:AbortSignal)=>Promise<T>)=>operation('scoped-owner',new AbortController().signal)};
 render(<NativeBillingMonthScreen now={clock} useSession={()=>active} overviewReader={reader} readProjection={readProjection}/>);
 const label=(name:string)=>copy.billingMonth.details.replace('%{name}',name);await screen.findByRole('button',{name:label(first.customName)});expect(screen.getByRole('button',{name:label(second.customName)}).props.accessibilityValue.text).toContain(following);expect(screen.queryByText(outside.customName)).toBeNull();
 fireEvent.press(screen.getByTestId(`native-home-scope-${memberId}`));expect(screen.queryByRole('button',{name:label(first.customName)})).toBeNull();expect(screen.getByRole('button',{name:label(second.customName)})).toBeTruthy();expect(reader).toHaveBeenCalledTimes(1);expect(readProjection).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByTestId('native-home-calendar'));fireEvent.press(screen.getByRole('button',{name:copy.billingMonth.next}));fireEvent.press(screen.getByTestId(`native-date-${following}`));
 await waitFor(()=>expect(readProjection).toHaveBeenCalledTimes(2));expect(screen.getByRole('button',{name:label(second.customName)})).toBeTruthy();expect(reader).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByTestId('native-home-scope-everyone'));expect(screen.getByRole('button',{name:label(first.customName)})).toBeTruthy();expect(screen.getByRole('button',{name:label(second.customName)})).toBeTruthy();expect(reader).toHaveBeenCalledTimes(1);expect(screen.queryByText(outside.customName)).toBeNull();
});
