import React from 'react';
import {Keyboard,Platform,RefreshControl,ScrollView} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {NativeHouseholdScreen} from './NativeHouseholdScreen';
import {parseSandboxHouseholdView,type SandboxHouseholdView} from '@subtrack/contracts/sandbox-household';
import type {NativeFeatureSession} from '../onboarding/NativePersonalScreen';
import type {SandboxHouseholdApi} from '@/api/sandboxHouseholdApi';
import {catalogs} from '@subtrack/i18n';
import {SandboxSessionCore} from '@/state/SandboxSessionCore';
import {formatMinorUnits} from '@/api/privateMobileMoney';
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('expo-crypto',()=>({getRandomBytesAsync:jest.fn(async()=>new Uint8Array(16))}));
jest.mock('@/api/sandboxMobileApi',()=>({sandboxMobileApi:{householdBusiness:jest.fn(),readNativeSubscriptions:jest.fn()}}));
jest.mock('react-native-safe-area-context',()=>jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router',()=>({useRouter:()=>({replace:jest.fn()}),useFocusEffect:(callback:()=>void|(()=>void))=>{const React=jest.requireActual('react');React.useEffect(callback,[callback]);}}));
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
const admin='123e4567-e89b-42d3-a456-426614174000',child='123e4567-e89b-42d3-a456-426614174001';
const copy=catalogs.en.onboarding.nativeHousehold;
async function realSandboxSession(){
 const credentials={transport:'sandbox-mobile' as const,sessionId:admin,accessToken:'header.payload.signature',refreshToken:`s250r.${'A'.repeat(43)}`,sessionExpiresAt:10000},capability=`s250c.${'A'.repeat(43)}`;
 const store={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)},changed=jest.fn();
 const core=new SandboxSessionCore(store,{bootstrap:jest.fn().mockResolvedValue({...credentials,installationCapability:capability}),resume:jest.fn(),refresh:jest.fn(),logout:jest.fn()},changed);await core.bootstrap('en');
 const session:NativeFeatureSession={phase:'active',run:work=>core.run(work),login:jest.fn(),refresh:jest.fn(),logout:jest.fn()};return{core,session,store,changed,capability};
}
it('leaving Household during an in-flight read preserves real sandbox authority for the next page',async()=>{
 const f=await realSandboxSession(),api:SandboxHouseholdApi={read:jest.fn((_token,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Route read aborted')),{once:true}))),mutate:jest.fn()};
 const subscriptions=jest.fn().mockResolvedValue({items:[],nextCursor:null}),view=render(<NativeHouseholdScreen useSession={()=>f.session} api={api} readSubscriptions={subscriptions}/>);
 await waitFor(()=>expect(api.read).toHaveBeenCalledTimes(1));view.unmount();
 await expect(f.core.run(async token=>token)).resolves.toBe('header.payload.signature');expect(f.changed).toHaveBeenLastCalledWith('active',true);expect(f.store.write).toHaveBeenCalledTimes(1);expect(api.mutate).not.toHaveBeenCalled();
});
it('a genuine focused Household read failure still retires real sandbox authority',async()=>{
 const f=await realSandboxSession(),api:SandboxHouseholdApi={read:jest.fn().mockRejectedValue(new Error('Owner read denied')),mutate:jest.fn()},subscriptions=jest.fn().mockResolvedValue({items:[],nextCursor:null});
 render(<NativeHouseholdScreen useSession={()=>f.session} api={api} readSubscriptions={subscriptions}/>);await waitFor(()=>expect(f.changed).toHaveBeenLastCalledWith('verification-required',true));
 await expect(f.core.run(async()=>true)).rejects.toThrow('Sandbox session unavailable');expect(f.store.write).toHaveBeenLastCalledWith({version:1,installationCapability:f.capability,session:null});
});
function household(children=true):SandboxHouseholdView{return parseSandboxHouseholdView({household:{id:admin,name:'Example family',members:[{id:admin,displayName:'Example parent',role:'ADMIN'},...(children?[{id:child,displayName:'Example child',role:'DEPENDANT'}]:[])],assignments:[]}});}
function fixture(initial:SandboxHouseholdView={household:null}){
 const api:SandboxHouseholdApi={read:jest.fn().mockResolvedValue(initial),mutate:jest.fn().mockResolvedValue({household:null})};
 const session:NativeFeatureSession={phase:'active',run:jest.fn().mockImplementation(work=>work('access',new AbortController().signal)),login:jest.fn(),refresh:jest.fn(),logout:jest.fn()};
 const subscriptions=jest.fn().mockResolvedValue({items:[],nextCursor:null});
 return {api,session,subscriptions,view:render(<NativeHouseholdScreen useSession={()=>session} api={api} readSubscriptions={subscriptions}/>)};
}
async function openMemberEditor(){await waitFor(()=>expect(screen.getByTestId('native-household-member-add-open').props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByTestId('native-household-member-add-open'));}
async function refresh(){await waitFor(()=>expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false));fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');}
it('creates a durable household and uses independent authoritative readback instead of optimistic mutation response',async()=>{
 const f=fixture();await screen.findByLabelText(copy.householdName);jest.mocked(f.api.read).mockResolvedValue(household(false));
 expect(screen.getByTestId('native-household-create').props.accessibilityLabel).toBe(copy.create);fireEvent.changeText(screen.getByTestId('native-household-name'),'Example family');fireEvent.press(screen.getByTestId('native-household-create'));
 await screen.findAllByText('Example parent');expect(f.api.mutate).toHaveBeenCalledWith({operation:'household-create',name:'Example family'},'access',expect.any(AbortSignal));expect(f.api.read).toHaveBeenCalledTimes(2);expect(screen.queryByRole('button',{name:copy.create})).toBeNull();
});
it.each(['ios','android'] as const)('configures household keyboard scrolling on %s, dismisses before sending and retains authoritative readback',async platform=>{
 const os=jest.replaceProperty(Platform,'OS',platform);
 try{
 const f=fixture(household(false));await openMemberEditor();const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
 const scroll=screen.UNSAFE_getAllByType(ScrollView)[0]!;
 expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
 expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(platform==='ios'?true:undefined);
 expect(scroll.props.keyboardDismissMode).toBe(platform==='ios'?'interactive':undefined);
 try{jest.mocked(f.api.mutate).mockImplementation(async()=>{expect(dismiss).toHaveBeenCalledTimes(1);return household();});jest.mocked(f.api.read).mockResolvedValue(household());
 fireEvent.changeText(screen.getByTestId('native-household-member-name'),'Example child');
 const scope=screen.UNSAFE_getAllByType(ScrollView).find(item=>item.props.horizontal)!;expect(scope.props.keyboardShouldPersistTaps).toBe('handled');
 fireEvent.press(screen.getByTestId(`native-household-scope-${admin}`));expect(screen.getByTestId(`native-household-scope-${admin}`).props.accessibilityState.selected).toBe(true);expect(screen.getByTestId('native-household-member-name').props.value).toBe('Example child');expect(f.api.mutate).not.toHaveBeenCalled();
 fireEvent.press(screen.getByTestId(`native-household-scope-${admin}`));fireEvent.press(screen.getByTestId('native-household-member-add'));await screen.findByRole('button',{name:copy.remove});expect(f.api.mutate).toHaveBeenCalledTimes(1);expect(screen.queryByTestId('native-household-member-name')).toBeNull();}finally{dismiss.mockRestore();}
 }finally{os.restore();}
});
it('adds profile-only members, confirms removal and never offers removal of the admin',async()=>{
 const f=fixture(household(false));await screen.findAllByText('Example parent');jest.mocked(f.api.read).mockResolvedValue(household());
 await openMemberEditor();
 expect(screen.getByTestId('native-household-member-add').props.accessibilityLabel).toBe(copy.add);fireEvent.changeText(screen.getByTestId('native-household-member-name'),'Example child');fireEvent.press(screen.getByTestId('native-household-member-add'));
 await screen.findByRole('button',{name:copy.remove});expect(jest.mocked(f.api.mutate).mock.calls[0]?.[0]).toMatchObject({operation:'dependant-add',displayName:'Example child',requestId:expect.stringMatching(/-4[0-9a-f]{3}-[89ab]/)});
 fireEvent.press(screen.getByRole('button',{name:copy.remove}));expect(f.api.mutate).toHaveBeenCalledTimes(1);fireEvent.press(screen.getByRole('button',{name:copy.cancel}));expect(f.api.mutate).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByRole('button',{name:copy.remove}));jest.mocked(f.api.read).mockResolvedValue(household(false));await waitFor(()=>expect(screen.getByRole('button',{name:copy.confirmRemove}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.confirmRemove}));
 await waitFor(()=>expect(f.api.mutate).toHaveBeenCalledTimes(2));
 await waitFor(()=>expect(screen.queryByRole('button',{name:copy.remove})).toBeNull());expect(f.api.mutate).toHaveBeenLastCalledWith({operation:'dependant-remove',memberId:child},'access',expect.any(AbortSignal));
});
it('shows specific name validation before sending and clears private household state on session retirement',async()=>{
 const f=fixture(household());await openMemberEditor();fireEvent.press(screen.getByRole('button',{name:copy.add}));await screen.findByText(copy.invalidName);expect(f.api.mutate).not.toHaveBeenCalled();
 f.session.phase='verification-required';f.view.rerender(<NativeHouseholdScreen useSession={()=>f.session} api={f.api} readSubscriptions={f.subscriptions} inactiveContent={<React.Fragment/>}/>);expect(screen.queryByText('Example family')).toBeNull();expect(screen.queryByText('Example parent')).toBeNull();
});
it('ignores late household reads after leaving the route',async()=>{
 let resolve!:(value:SandboxHouseholdView)=>void;const waiting=new Promise<SandboxHouseholdView>(done=>{resolve=done;});const f=fixture();jest.mocked(f.api.read).mockResolvedValueOnce(waiting);await refresh();
 await waitFor(()=>expect(f.api.read).toHaveBeenCalledTimes(2));f.view.unmount();await act(async()=>resolve(household()));expect(jest.mocked(f.api.mutate)).not.toHaveBeenCalled();
});
it('shows unknown planned payer until explicit saved attribution, then renders that member band without assigning the admin',async()=>{
 const f=fixture(household()),subscription='123e4567-e89b-42d3-a456-426614174002';
 f.subscriptions.mockResolvedValue({items:[{id:subscription,visibility:'owner',source:'MANUAL',revision:'1',customName:'Example plan',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',status:'ACTIVE',expectedAmountMinor:'101',currency:'SEK',nextChargeDate:null,alwaysPrivate:true}],nextCursor:null});
 await refresh();
 await screen.findByTestId('native-household-payer-band-unknown');expect(screen.queryByTestId(`native-household-payer-band-${admin}`)).toBeNull();
 const exact=formatMinorUnits(101n,'SEK',{locale:'en',display:'code'});expect(screen.getAllByText(copy.payerUnknown)).toHaveLength(2);expect(screen.getByTestId('native-household-payer-distribution').props.accessibilityValue.text).toContain(`${copy.payerUnknown} · ${exact}`);
 jest.mocked(f.api.read).mockResolvedValue(parseSandboxHouseholdView({household:{...household().household,assignments:[{subscriptionId:subscription,memberIds:[admin,child],payerMemberId:child}]}}));
 await refresh();
 await screen.findByTestId(`native-household-payer-band-${child}`);expect(screen.queryByTestId('native-household-payer-band-unknown')).toBeNull();expect(screen.queryByTestId(`native-household-payer-band-${admin}`)).toBeNull();
 expect(screen.queryByText(copy.payerUnknown)).toBeNull();expect(screen.getByTestId('native-household-payer-distribution').props.accessibilityValue.text).toContain(`Example child · ${exact}`);
 fireEvent.press(screen.getByTestId(`native-household-scope-${child}`));expect(screen.getByTestId('native-household-payer-distribution').props.accessibilityValue.text).toBe(`Example child · ${exact}`);expect(f.api.mutate).not.toHaveBeenCalled();
});
it('keeps rename and member editors closed until requested and Cancel performs no mutation',async()=>{
 const f=fixture(household());await screen.findAllByText('Example parent');
 expect(screen.queryByTestId('native-household-name')).toBeNull();expect(screen.queryByTestId('native-household-member-name')).toBeNull();
 fireEvent.press(screen.getByTestId('native-household-rename'));fireEvent.changeText(screen.getByTestId('native-household-name'),'Unsaved household');fireEvent.press(screen.getByRole('button',{name:copy.cancel}));
 expect(screen.queryByTestId('native-household-name')).toBeNull();await openMemberEditor();fireEvent.changeText(screen.getByTestId('native-household-member-name'),'Unsaved member');fireEvent.press(screen.getByRole('button',{name:copy.cancel}));
 expect(screen.queryByTestId('native-household-member-name')).toBeNull();fireEvent.press(screen.getByTestId(`native-household-member-edit-${child}`));expect(screen.getByTestId('native-household-member-name').props.value).toBe('Example child');fireEvent.press(screen.getByRole('button',{name:copy.cancel}));
 expect(f.api.mutate).not.toHaveBeenCalled();expect(screen.queryByTestId('native-household-member-name')).toBeNull();
});
it('opens attribution from a compact plan row and shows exact unequal per-person allocations without rounding',async()=>{
 const subscription='123e4567-e89b-42d3-a456-426614174002',initial=parseSandboxHouseholdView({household:{...household().household!,assignments:[{subscriptionId:subscription,memberIds:[admin,child],payerMemberId:child}]}}),f=fixture(initial);
 f.subscriptions.mockResolvedValue({items:[{id:subscription,visibility:'owner',source:'MANUAL',revision:'1',customName:'Example plan',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',status:'ACTIVE',expectedAmountMinor:'101',currency:'SEK',nextChargeDate:null,alwaysPrivate:true}],nextCursor:null});
 await refresh();
 await screen.findByTestId(`native-household-assignment-${subscription}`);const amount=(minor:bigint)=>formatMinorUnits(minor,'SEK',{locale:'en',display:'code'});
 expect(screen.getByText(copy.perPersonRange.replace('%{minimum}',amount(50n)).replace('%{maximum}',amount(51n)))).toBeTruthy();
 expect(screen.queryByTestId(`native-household-assignment-save-${subscription}`)).toBeNull();
 await waitFor(()=>expect(screen.getByTestId(`native-household-assignment-${subscription}`).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByTestId(`native-household-assignment-${subscription}`));
 expect(screen.getByTestId(`native-household-user-${child}`).props.accessibilityState.selected).toBe(true);
 fireEvent.press(screen.getByTestId(`native-household-user-${child}`));fireEvent.press(screen.getByTestId(`native-household-assignment-save-${subscription}`));
 await waitFor(()=>expect(f.api.mutate).toHaveBeenCalledWith({operation:'household-assign',subscriptionId:subscription,memberIds:[admin],payerMemberId:child},'access',expect.any(AbortSignal)));
 await waitFor(()=>expect(screen.queryByTestId(`native-household-assignment-save-${subscription}`)).toBeNull());
 expect(f.api.read).toHaveBeenCalledTimes(3);
});

it('uses the actual pull gesture to reread and exposes Retry only after a current read failure',async()=>{
 const f=fixture(household());await screen.findAllByText('Example parent');
 expect(screen.queryByTestId('native-household-refresh')).toBeNull();expect(screen.getByTestId('native-household-scroll').props.refreshControl).toBeTruthy();
 jest.mocked(f.api.read).mockRejectedValueOnce(new Error('Current owner unavailable'));await refresh();
 await screen.findByText(copy.unavailable);expect(f.api.mutate).not.toHaveBeenCalled();
 fireEvent.press(screen.getByTestId('native-household-refresh'));await screen.findAllByText('Example parent');
 await waitFor(()=>expect(screen.queryByTestId('native-household-refresh')).toBeNull());expect(f.api.read).toHaveBeenCalledTimes(3);
 f.session.phase='verification-required';f.view.rerender(<NativeHouseholdScreen useSession={()=>f.session} api={f.api} readSubscriptions={f.subscriptions} inactiveContent={<React.Fragment/>}/>);
 expect(screen.queryByTestId('native-household-refresh')).toBeNull();expect(screen.getByTestId('native-household-scroll').props.refreshControl).toBeUndefined();
});

it('shows an empty scoped list for a member with no assignments and restores plans for Everyone without reading again',async()=>{
 const subscription='123e4567-e89b-42d3-a456-426614174002',f=fixture(household());
 f.subscriptions.mockResolvedValue({items:[{id:subscription,visibility:'owner',source:'MANUAL',revision:'1',customName:'Parent plan',merchantId:null,merchantName:null,categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',status:'ACTIVE',expectedAmountMinor:'101',currency:'SEK',nextChargeDate:null,alwaysPrivate:true}],nextCursor:null});
 await refresh();await screen.findByTestId(`native-household-assignment-${subscription}`);
 fireEvent.press(screen.getByTestId(`native-household-scope-${child}`));
 expect(screen.queryByTestId(`native-household-assignment-${subscription}`)).toBeNull();expect(screen.getByText(copy.noSubscriptions)).toBeTruthy();
 fireEvent.press(screen.getByTestId('native-household-scope-everyone'));expect(screen.getByTestId(`native-household-assignment-${subscription}`)).toBeTruthy();expect(screen.queryByText(copy.noSubscriptions)).toBeNull();
 expect(f.api.read).toHaveBeenCalledTimes(2);expect(f.api.mutate).not.toHaveBeenCalled();
});
