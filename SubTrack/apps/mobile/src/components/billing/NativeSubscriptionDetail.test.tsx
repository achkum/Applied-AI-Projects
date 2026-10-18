import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativeSubscriptionDetail} from './NativeSubscriptionDetail';
import {projectNativeAnalytics,type AnalyticsCharge} from '@/api/nativeAnalyticsProjection';
import type {NativeAnalyticsRead,NativeAnalyticsReader} from '@/api/nativeAnalyticsReader';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import {NativeSessionCore} from '@/state/NativeSessionCore';
import {formatMinorUnits} from '@/api/privateMobileMoney';
import {catalogs} from '@subtrack/i18n';
const mockCleanup:{current?:void|(()=>void)}={};
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-router',()=>({useFocusEffect:(callback:()=>void|(()=>void))=>{const React=jest.requireActual('react');React.useEffect(()=>{mockCleanup.current=callback();return()=>{mockCleanup.current?.();};},[callback]);}}));
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const row={id:'123e4567-e89b-42d3-a456-426614174000',revision:'1',source:'MANUAL' as const,visibility:'owner' as const,customName:'Owned sample plan',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY' as const,status:'ACTIVE' as const,expectedAmountMinor:'10001',currency:'SEK',nextChargeDate:'2026-10-19',alwaysPrivate:true};
const other={...row,id:'223e4567-e89b-42d3-a456-426614174000',customName:'Unrelated owner plan'};
const members=[{id:'323e4567-e89b-42d3-a456-426614174000',displayName:'Sample parent',role:'ADMIN' as const},{id:'423e4567-e89b-42d3-a456-426614174000',displayName:'Sample child',role:'DEPENDANT' as const}];
const household={id:'523e4567-e89b-42d3-a456-426614174000',name:'Sample family',members,assignments:[{subscriptionId:row.id,memberIds:members.map(member=>member.id),payerMemberId:members[0]!.id}]};
const now=()=>new Date(2026,9,17,12),history:AnalyticsCharge[]=['-10000','-10000','-10000','-12000','-12000'].map((amountMinor,index)=>({id:`charge-${index}`,subscriptionId:row.id,displayName:row.customName,date:`2026-${String(6+index).padStart(2,'0')}-03`,amountMinor,currency:'SEK'}));
const ready=():NativeAnalyticsRead=>({kind:'ready',projection:{...projectNativeAnalytics([row,other],[...history,{...history[0]!,id:'unrelated-charge',subscriptionId:other.id,amountMinor:'-999999'}],now(),[],true),household}});
const session=(phase:NativeFeatureSession['phase']='active'):NativeFeatureSession=>({phase,login:jest.fn(),refresh:jest.fn(),logout:jest.fn(),run:async work=>work('owner-token',new AbortController().signal)});
const formatted=(amount:bigint)=>formatMinorUnits(amount,'SEK',{locale:'en',display:'code'}).replace(/[\u00a0\u202f]/g,' ');
beforeEach(()=>{jest.clearAllMocks();mockCleanup.current=undefined;});
it('keeps the production view primary-only when no authorized metadata adapter is provided',()=>{
 const active=session();render(<NativeSubscriptionDetail session={active} item={row} onClose={jest.fn()}/>);
 expect(screen.getByRole('header',{name:row.customName})).toBeTruthy();expect(screen.queryByText(catalogs.en.onboarding.nativeHousehold.payerLabel)).toBeNull();expect(screen.queryByTestId('native-subscription-charge-history')).toBeNull();
});
it('attaches only matching current household assignments and exact attributed charge history to the primary item',async()=>{
 const reader=jest.fn().mockResolvedValue(ready()),close=jest.fn();render(<NativeSubscriptionDetail session={session()} reader={reader} now={now} item={row} onClose={close}/>);
 await screen.findByText(members[0]!.displayName);expect(screen.getByText('Sample parent, Sample child')).toBeTruthy();expect(screen.getByText(`${formatted(5000n)}–${formatted(5001n)}`)).toBeTruthy();
 const chart=screen.getByTestId('native-subscription-charge-history');for(const charge of history)expect(chart.props.accessibilityLabel).toContain(`${charge.date}, ${formatMinorUnits(-BigInt(charge.amountMinor),'SEK',{locale:'en',display:'code'})}`);
 expect(chart.props.accessibilityLabel).not.toContain(formatMinorUnits(999999n,'SEK',{locale:'en',display:'code'}));expect(screen.getByText(catalogs.en.nativeAnalytics.historyLimited)).toBeTruthy();
 expect(screen.getByLabelText(`${formatted(10001n)} · ${catalogs.en.onboarding.ownerSubscriptions.cadence.MONTHLY}`)).toBeTruthy();expect(reader).toHaveBeenCalledWith('owner-token',expect.any(AbortSignal),now());fireEvent.press(screen.getByTestId('native-subscription-detail-close'));expect(close).toHaveBeenCalledTimes(1);
});
it.each(['revision','id'] as const)('withholds attached metadata on an authoritative %s mismatch while preserving the primary exact item',async mismatch=>{
 const value=ready();if(value.kind!=='ready')throw Error('fixture');const projection={...value.projection,subscriptions:value.projection.subscriptions.map(item=>item.id===row.id?{...item,...(mismatch==='revision'?{revision:'2'}:{id:'623e4567-e89b-42d3-a456-426614174000'})}:item)};
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection});render(<NativeSubscriptionDetail session={session()} reader={reader} now={now} item={row} onClose={jest.fn()}/>);await waitFor(()=>expect(reader).toHaveBeenCalledTimes(1));await act(async()=>{});
 expect(screen.getByRole('header',{name:row.customName})).toBeTruthy();expect(screen.queryByText(members[0]!.displayName)).toBeNull();expect(screen.queryByTestId('native-subscription-charge-history')).toBeNull();
});
it.each(['PAUSED','CANCELLED','ARCHIVED'] as const)('retains real payer and booked history for a current confirmed %s subscription',async status=>{
 const item={...row,status},projection={...projectNativeAnalytics([item],history,now()),household};expect(projection.active).toEqual([]);
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection});render(<NativeSubscriptionDetail session={session()} reader={reader} now={now} item={item} onClose={jest.fn()}/>);
 await screen.findByText(members[0]!.displayName);expect(screen.getByTestId('native-subscription-charge-history').props.accessibilityLabel).toContain('2026-10-03');expect(screen.getByRole('header',{name:item.customName})).toBeTruthy();
});
it.each(['DETECTED','REJECTED'] as const)('withholds household and charge metadata for an unconfirmed %s subscription even if matching history is present',async status=>{
 const item={...row,status},projection={...projectNativeAnalytics([item],history,now()),household,attributedCharges:history};
 const reader=jest.fn().mockResolvedValue({kind:'ready',projection});render(<NativeSubscriptionDetail session={session()} reader={reader} now={now} item={item} onClose={jest.fn()}/>);await waitFor(()=>expect(reader).toHaveBeenCalledTimes(1));await act(async()=>{});
 expect(screen.getByRole('header',{name:item.customName})).toBeTruthy();expect(screen.queryByText(members[0]!.displayName)).toBeNull();expect(screen.queryByTestId('native-subscription-charge-history')).toBeNull();
});
async function realSession(){
 const changed=jest.fn(),store={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)},core=new NativeSessionCore(store,changed);
 await core.establish(async()=>({transport:'mobile',sessionId:row.id,accessToken:'header.payload.signature',refreshToken:'v2r.'+'a'.repeat(43)}));return {core,changed,store,facade:{...session(),run:<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>core.run(work)}};
}
it('aborts a closed detail read without retiring the real authenticated session',async()=>{
 const {core,changed,store,facade}=await realSession();let signal:AbortSignal|undefined;
 const reader:NativeAnalyticsReader=jest.fn((_token,current)=>new Promise((_resolve,reject)=>{signal=current;current.addEventListener('abort',()=>reject(Error('Closed detail')),{once:true});}));
 const view=render(<NativeSubscriptionDetail session={facade} reader={reader} now={now} item={row} onClose={jest.fn()}/>);await waitFor(()=>expect(reader).toHaveBeenCalledTimes(1));view.unmount();expect(signal?.aborted).toBe(true);await expect(core.run(async token=>token)).resolves.toBe('header.payload.signature');expect(changed).toHaveBeenLastCalledWith('active');expect(store.clear).toHaveBeenCalledTimes(1);
});
it('hides all detail content on retirement and ignores a late owner metadata response',async()=>{
 let finish!:(value:NativeAnalyticsRead)=>void;const reader=jest.fn(()=>new Promise<NativeAnalyticsRead>(resolve=>{finish=resolve;}));const view=render(<NativeSubscriptionDetail session={session()} reader={reader} now={now} item={row} onClose={jest.fn()}/>);await waitFor(()=>expect(reader).toHaveBeenCalledTimes(1));
 view.rerender(<NativeSubscriptionDetail session={session('verification-required')} reader={reader} now={now} item={row} onClose={jest.fn()}/>);await act(async()=>finish(ready()));expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText(members[0]!.displayName)).toBeNull();expect(screen.queryByTestId('native-subscription-charge-history')).toBeNull();
});
