import React from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {useFocusEffect} from 'expo-router';
import { NativePersonalScreen, validateManualDraft } from './NativePersonalScreen';
import { NativeSessionProvider, useNativeSession } from '@/state/NativeSession';
import { NativeSessionCore } from '@/state/NativeSessionCore';
import * as api from '@/api/privateMobileApi';
import { catalogs } from '@subtrack/i18n';
import type { NativeBundleStore } from '@/utils/secureSessionBundle';
import {SandboxSessionProvider,useSandboxSession} from '@/state/SandboxSession';
import {SandboxEntry} from './SandboxEntry';
import type {SandboxMobileApi} from '@/api/sandboxMobileApi';
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLocale:{value:'en'|'sv'}={value:'en'};
const mockSetLocale = jest.fn(); const mockSetMode = jest.fn();
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn(), useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('@/api/privateMobileApi', () => ({ verifiedNativeLogin: jest.fn(), revokeNativeSession: jest.fn(), rotateNativeSession: jest.fn(), completeNativeEnrollment: jest.fn(),
  readNativeProfile: jest.fn(), saveNativeProfile: jest.fn(), readNativeMode: jest.fn(), chooseNativeJustMe: jest.fn(), readNativeSubscriptions: jest.fn(), editNativeSubscription: jest.fn(), updateNativeSubscriptionStatus: jest.fn(), createNativeSubscription: jest.fn() }));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ ...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json'), setMode: mockSetMode }) }));
jest.mock('@/context/I18nContext', () => ({ useI18n: () => ({ ...jest.requireActual('../signature/testUtils/contextMocks').makeI18n(mockLocale.value), setLocale: mockSetLocale }) }));
const credentials = { transport: 'mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
const profile = { displayName: 'Synthetic', avatarColourToken: null, avatarEmoji: null, language: 'en' as const, theme: 'system' as const, defaultCurrency: 'SEK' as const, profileComplete: true };
const row = { id: credentials.sessionId, revision: '1', source: 'MANUAL' as const, visibility: 'owner' as const, customName: 'Current database name', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const, status: 'ACTIVE' as const, expectedAmountMinor: '9007199254740993', currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
const copy = catalogs.en.onboarding;
function chooseCategory(label:string){fireEvent.changeText(screen.getByTestId('native-subscription-category'),label);fireEvent.press(screen.getByRole('button',{name:label}));}
function expandCurrentRow(id=row.id){const current=screen.getByTestId(`native-subscription-row-${id}`);if(!current.props.accessibilityState.expanded)fireEvent.press(current);}
function openProfile(){const tab=screen.queryByTestId('native-nav-profile');if(tab)fireEvent.press(tab);}
function performLogout(){openProfile();fireEvent.press(screen.getByRole('button',{name:catalogs[mockLocale.value].onboarding.nativePersonal.logout}));}

// Cold native host/Babel initialization took 4429 ms in the first workflow.
// Prepare only generic hosts; every behavioral test retains its 5000 ms deadline.
beforeAll(() => {
  const fixture = render(<ScrollView><Text>host ready</Text><Pressable><Text>host button</Text></Pressable><TextInput /></ScrollView>);
  expect(fixture.getByText('host ready')).toBeTruthy();
  fixture.unmount();
}, 60_000);
beforeEach(() => {mockLocale.value='en'; jest.resetAllMocks(); jest.mocked(useFocusEffect).mockImplementation(effect => { React.useEffect(effect, [effect]); }); mockSetLocale.mockResolvedValue(undefined); mockSetMode.mockResolvedValue(undefined); jest.mocked(api.verifiedNativeLogin).mockResolvedValue(credentials);
  jest.mocked(api.readNativeProfile).mockResolvedValue(profile); jest.mocked(api.readNativeMode).mockResolvedValue({ mode: 'just-me' }); });
it('sandbox entry completes profile/Just Me/Add/Edit/status/readback/logout through separate injected authority',async()=>{
  let currentProfile={...profile,displayName:null as string|null,profileComplete:false};let mode:'just-me'|null=null;let rows:typeof row[]=[];
  const sandboxCredentials={transport:'sandbox-mobile' as const,sessionId:credentials.sessionId,accessToken:'sandbox.payload.signature',refreshToken:`s250r.${'A'.repeat(43)}`,sessionExpiresAt:10000};
  const sandboxApi={bootstrap:jest.fn().mockResolvedValue({...sandboxCredentials,installationCapability:`s250c.${'A'.repeat(43)}`}),resume:jest.fn(),refresh:jest.fn(),logout:jest.fn().mockResolvedValue(undefined),
    readNativeProfile:jest.fn(async()=>currentProfile),saveNativeProfile:jest.fn(async()=>{currentProfile={...profile,profileComplete:true};return currentProfile;}),readNativeMode:jest.fn(async()=>({mode})),chooseNativeJustMe:jest.fn(async()=>{mode='just-me';return{mode};}),
    readNativeSubscriptions:jest.fn(async()=>({items:rows,nextCursor:null})),createNativeSubscription:jest.fn(async()=>{rows=[{...row,customName:'Persisted sandbox service'}];return{id:row.id};}),
    editNativeSubscription:jest.fn(async()=>{rows=[{...rows[0]!,customName:'Persisted edited service',revision:'2'}];return{id:row.id,revision:'2'};}),
    updateNativeSubscriptionStatus:jest.fn(async()=>{rows=[{...rows[0]!,status:'PAUSED' as never,revision:'3'}];return{id:row.id,status:'PAUSED',revision:'3'};})};
  const store={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)};
  const onSetupComplete=jest.fn();render(<SandboxSessionProvider available store={store} api={sandboxApi as unknown as SandboxMobileApi}><NativePersonalScreen useSession={useSandboxSession} api={sandboxApi as unknown as import('./NativePersonalScreen').NativePersonalApi} sandbox inactiveContent={<SandboxEntry/>} onSetupComplete={onSetupComplete}/></SandboxSessionProvider>);
  await waitFor(()=>expect(screen.getByRole('button',{name:copy.sandbox.enter}).props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByRole('button',{name:copy.nativePersonal.verify})).toBeNull();fireEvent.press(screen.getByRole('button',{name:copy.sandbox.enter}));
  await screen.findByLabelText(copy.nativePersonal.name);fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Fiction');fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));
  await screen.findByText(copy.nativePersonal.profileSaved);fireEvent.press(screen.getByRole('button',{name:copy.mode.choose}));await screen.findByRole('tab',{name:copy.productNav.manage});expect(onSetupComplete).toHaveBeenCalledWith('mutation');
  expect(screen.getByRole('button',{name:copy.nativeBank.open}).props.accessibilityState.disabled).toBe(false);expect(screen.getByRole('button',{name:copy.nativeDetection.open}).props.accessibilityState.disabled).toBe(false);expect(screen.queryByText(copy.sandbox.manageUnavailable)).toBeNull();fireEvent.press(screen.getByRole('button',{name:copy.nativeBank.open}));expect(mockPush).toHaveBeenCalledWith('/personal-bank');fireEvent.press(screen.getByRole('button',{name:copy.nativeDetection.open}));expect(mockPush).toHaveBeenCalledWith('/personal-detections');
  fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.title}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Fiction');chooseCategory(copy.ownerSubscriptions.category.VIDEO_STREAMING);
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount),'12.00');fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.save}));await screen.findByText('Persisted sandbox service');
  expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Changed draft');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText('Persisted edited service');
  expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await waitFor(()=>expect(sandboxApi.updateNativeSubscriptionStatus).toHaveBeenCalledTimes(1));await screen.findByText(`${copy.ownerSubscriptions.cadence.MONTHLY} · ${copy.ownerSubscriptions.status.PAUSED}`);
  performLogout();await screen.findByText(copy.nativePersonal.logoutConfirmed);expect(screen.queryByText('Persisted edited service')).toBeNull();expect(api.verifiedNativeLogin).not.toHaveBeenCalled();
});
it.each(['en','sv'] as const)('uses the localized single profile heading during setup in %s',async locale=>{
 mockLocale.value=locale;const localized=catalogs[locale].onboarding;jest.mocked(api.readNativeProfile).mockResolvedValue({...profile,displayName:null,profileComplete:false});
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:localized.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:localized.nativePersonal.verify}));
 expect(await screen.findByRole('header',{name:localized.profile.title})).toBeTruthy();
 expect(screen.getByTestId('native-personal-title')).toBe(screen.getByRole('header',{name:localized.profile.title}));
 expect(screen.getAllByTestId('native-personal-title')).toHaveLength(1);
 expect(screen.queryByText(localized.nativePersonal.introduction)).toBeNull();expect(screen.queryByText(catalogs[locale].scope.personal)).toBeNull();expect(screen.queryByRole('button',{name:localized.nativePersonal.logout})).toBeNull();
});
function mount(children?:React.ReactNode) { const store: NativeBundleStore = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  return render(<NativeSessionProvider store={store}><NativePersonalScreen />{children}</NativeSessionProvider>); }
it('reads current private rows only after fresh verification and clears them immediately on offline logout', async () => {
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({ items: [row], nextCursor: null });
  jest.mocked(api.revokeNativeSession).mockRejectedValue(new Error('offline')); mount();
  await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByText(row.customName)).toBeNull(); fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify }));
  await screen.findByText(row.customName); expect(api.readNativeProfile).toHaveBeenCalledWith(credentials.accessToken, expect.any(AbortSignal));
  fireEvent.press(screen.getByRole('button', { name: copy.nativeBank.open })); expect(mockPush).toHaveBeenCalledWith('/personal-bank');
  performLogout(); expect(screen.queryByText(row.customName)).toBeNull();
  expect(screen.queryByRole('button', { name: copy.nativeBank.open })).toBeNull();
  await screen.findByText(copy.nativePersonal.logoutLocal);
  expect(screen.queryByRole('button', { name: copy.nativePersonal.logout })).toBeNull();
  expect(screen.queryByText(copy.nativePersonal.restart)).toBeNull();
});
it('uses exact localized Money input and displays authoritative reread rather than the submitted draft', async () => {
  jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ items: [row], nextCursor: null });
  jest.mocked(api.createNativeSubscription).mockResolvedValue({ id: row.id }); mount();
  await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify })); await screen.findByText(copy.ownerSubscriptions.empty);
  expect(screen.getByRole('button', { name: copy.manualSubscription.title })).toBeTruthy();
  expect(screen.getByLabelText(copy.ownerSubscriptionList.search)).toBeTruthy();
  expect(screen.queryByRole('button', { name: copy.nativePersonal.logout })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.title }));
  expect(screen.getByLabelText(copy.manualSubscription.name)).toBeTruthy();
  expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();
  expect(screen.queryByLabelText(copy.ownerSubscriptionList.search)).toBeNull();
  expect(screen.getByRole('tab', { name: copy.productNav.manage })).toBeTruthy();
  expect(screen.queryByRole('button', { name: copy.nativePersonal.logout })).toBeNull();
  fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name), 'Submitted draft');
  chooseCategory(copy.ownerSubscriptions.category.VIDEO_STREAMING);
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount), '90071992547409.93');
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.save }));
  await screen.findByText(copy.nativePersonal.saved); expect(screen.getByText(row.customName)).toBeTruthy(); expect(screen.queryByText('Submitted draft')).toBeNull();
  expect(screen.getByRole('button', { name: copy.manualSubscription.title })).toBeTruthy();
  expect(screen.getByLabelText(copy.ownerSubscriptionList.search)).toBeTruthy();
  expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();
  expect(api.createNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({ expectedAmountMinor: '9007199254740993' }), credentials.accessToken, expect.any(AbortSignal));
});

it.each([
  ['name', 'invalidName', ''],
  ['category', 'invalidCategory', undefined],
  ['amount', 'invalidAmount', '0'],
  ['date', 'invalidDate', '2026-02-30'],
] as const)('shows the actionable %s validation in both locales without writing or clearing the draft', async (fieldName, message, invalidValue) => {
  for (const locale of ['en', 'sv'] as const) {
    mockLocale.value = locale;
    const localized = catalogs[locale].onboarding;
    jest.mocked(api.readNativeSubscriptions).mockResolvedValue({ items: [], nextCursor: null });
    const view = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: localized.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByRole('button', { name: localized.nativePersonal.verify })); await screen.findByText(localized.ownerSubscriptions.empty);
    fireEvent.press(screen.getByRole('button', { name: localized.manualSubscription.title }));
    const badValue = typeof invalidValue === 'string' ? invalidValue : '';
    fireEvent.changeText(screen.getByLabelText(localized.manualSubscription.name), fieldName === 'name' ? badValue : 'Retained draft');
    if (fieldName !== 'category') chooseCategory(localized.ownerSubscriptions.category.VIDEO_STREAMING);
    const validAmount = locale === 'sv' ? '12,00' : '12.00';
    fireEvent.changeText(screen.getByLabelText(localized.nativePersonal.amount), fieldName === 'amount' ? badValue : validAmount);
    if(fieldName==='date'){expect(validateManualDraft({customName:'Retained draft',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',amount:validAmount,date:badValue},locale).error).toBe('invalidDate');fireEvent.press(screen.getByTestId('native-subscription-date'));expect(screen.queryByRole('button',{name:badValue})).toBeNull();fireEvent.press(screen.getByRole('button',{name:catalogs[locale].actions.close}));}
    if(fieldName!=='date'){fireEvent.press(screen.getByRole('button', { name: localized.manualSubscription.save }));await screen.findByText(localized.manualSubscription[message]);}
    expect(api.createNativeSubscription).not.toHaveBeenCalled();
    expect(api.editNativeSubscription).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-subscription-name').props.value).toBe(fieldName === 'name' ? badValue : 'Retained draft');
    expect(screen.getByTestId('native-subscription-name').props.accessibilityLabel).toBe(localized.manualSubscription.name);
    expect(screen.getByTestId('native-subscription-amount').props.value).toBe(fieldName === 'amount' ? badValue : validAmount);
    expect(screen.getByTestId('native-subscription-amount').props.accessibilityLabel).toBe(localized.nativePersonal.amount);
    expect(screen.getByText(catalogs[locale].onboarding.datePicker.choose)).toBeTruthy();
    expect(screen.getByTestId('native-subscription-date').props.accessibilityLabel).toBe(localized.nativePersonal.date);
    view.unmount();
  }
});

it('accepts the Swedish decimal separator and persists the canonical full Add body', async () => {
  mockLocale.value = 'sv';
  const localized = catalogs.sv.onboarding;
  jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ items: [row], nextCursor: null });
  jest.mocked(api.createNativeSubscription).mockResolvedValue({ id: row.id }); mount();
  await waitFor(() => expect(screen.getByRole('button', { name: localized.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: localized.nativePersonal.verify })); await screen.findByText(localized.ownerSubscriptions.empty);
  fireEvent.press(screen.getByRole('button', { name: localized.manualSubscription.title }));
  fireEvent.changeText(screen.getByLabelText(localized.manualSubscription.name), 'Swedish draft');
  chooseCategory(localized.ownerSubscriptions.category.VIDEO_STREAMING);
  fireEvent.changeText(screen.getByLabelText(localized.nativePersonal.amount), '129,90');
  fireEvent.press(screen.getByRole('button', { name: localized.manualSubscription.save })); await screen.findByText(localized.nativePersonal.saved);
  expect(api.createNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({ customName: 'Swedish draft', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', expectedAmountMinor: '12990', nextChargeDate: null }), credentials.accessToken, expect.any(AbortSignal));
});

it('classifies an invalid cadence through the canonical parser without weakening the full-form gate', () => {
  expect(validateManualDraft({ customName: 'Retained draft', categoryCode: 'VIDEO_STREAMING', cadence: 'UNSUPPORTED', amount: '12.00', date: '' }, 'en'))
    .toEqual({ body: null, error: 'invalidCadence' });
});

it('preserves failed Add feedback when the real session core requires fresh verification',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});
 jest.mocked(api.createNativeSubscription).mockRejectedValue(new Error('offline'));
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(copy.ownerSubscriptions.empty);
 fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.title}));
 fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Unpersisted draft');
 chooseCategory(copy.ownerSubscriptions.category.VIDEO_STREAMING);
 fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount),'129.90');
 fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.save}));
 await screen.findByText(copy.nativePersonal.unavailable);
 expect(screen.getByRole('button',{name:copy.nativePersonal.verify})).toBeTruthy();
 expect(screen.queryByLabelText(copy.manualSubscription.name)).toBeNull();
 expect(screen.queryByText('Unpersisted draft')).toBeNull();
 expect(api.createNativeSubscription).toHaveBeenCalledTimes(1);
});

it('keeps the Add form isolated after validation errors and restores Manage on Cancel', async () => {
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({ items: [row], nextCursor: null });
  mount(); await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify })); await screen.findByText(row.customName);
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.title }));
  fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name), 'Retained draft');
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount), '12.00');
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.save }));
  await screen.findByText(copy.manualSubscription.invalidCategory);
  expect(screen.getByTestId('native-subscription-name').props.value).toBe('Retained draft');
  expect(screen.getByTestId('native-subscription-amount').props.value).toBe('12.00');
  expect(screen.queryByText(row.customName)).toBeNull();
  expect(screen.queryByLabelText(copy.ownerSubscriptionList.search)).toBeNull();
  expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();
  expect(screen.queryByRole('button', { name: copy.nativeBank.open })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.nativePersonal.logout })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.cancel }));
  expect(screen.getByRole('button', { name: copy.manualSubscription.title })).toBeTruthy();
  expect(screen.getByText(row.customName)).toBeTruthy();
  expect(screen.getByLabelText(copy.ownerSubscriptionList.search)).toBeTruthy();
  expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();
  expect(api.createNativeSubscription).not.toHaveBeenCalled();
});

it('completes profile and Just me only from separate authoritative reads',async()=>{
  jest.mocked(api.readNativeProfile).mockResolvedValueOnce({...profile,displayName:null,profileComplete:false}).mockResolvedValueOnce(profile);
  jest.mocked(api.saveNativeProfile).mockResolvedValue({...profile,displayName:'Ignored patch response'});
  jest.mocked(api.readNativeMode).mockResolvedValueOnce({mode:null}).mockResolvedValueOnce({mode:'just-me'});
  jest.mocked(api.chooseNativeJustMe).mockResolvedValue({mode:'just-me'});
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});mount();
  await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));
  await screen.findByLabelText(copy.nativePersonal.name);expect(screen.getByTestId('native-profile-name').props.accessibilityLabel).toBe(copy.nativePersonal.name);fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Synthetic');
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));await screen.findByText(copy.nativePersonal.profileSaved);
  expect(screen.queryByText('Ignored patch response')).toBeNull();
  fireEvent.press(screen.getByRole('button',{name:copy.mode.choose}));await screen.findByText(copy.ownerSubscriptions.empty);
  expect(api.readNativeProfile).toHaveBeenCalledTimes(2);expect(api.readNativeMode).toHaveBeenCalledTimes(2);
  expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});

it('confirms Add only after automatically reading the complete authoritative owner list',async()=>{
  const rows=Array.from({length:50},(_,index)=>({...row,id:'123e4567-e89b-42d3-a456-'+String(index).padStart(12,'0'),customName:'Earlier '+index}));
  jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:rows,nextCursor:null})
    .mockResolvedValueOnce({items:rows,nextCursor:'cursor-one'}).mockResolvedValueOnce({items:[row],nextCursor:null});
  jest.mocked(api.createNativeSubscription).mockResolvedValue({id:row.id});mount();
  await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText('Earlier 0');
  fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.title}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Not authoritative draft');
  chooseCategory(copy.ownerSubscriptions.category.VIDEO_STREAMING);fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount),'1.00');
  fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.save}));await screen.findByText(copy.nativePersonal.saved);
  expect(screen.queryByText('Not authoritative draft')).toBeNull();expect(screen.queryByRole('button',{name:copy.ownerSubscriptions.loadMore})).toBeNull();
  expect(screen.getByText(row.customName)).toBeTruthy();expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith(credentials.accessToken,expect.any(AbortSignal),'cursor-one');
});

it('applies language and theme from authoritative profile reads and never displays a session rotation control',async()=>{
  jest.mocked(api.readNativeProfile).mockResolvedValueOnce({...profile,displayName:null,profileComplete:false})
    .mockResolvedValueOnce({...profile,language:'sv',theme:'dark'});
  jest.mocked(api.readNativeMode).mockResolvedValue({mode:null});jest.mocked(api.saveNativeProfile).mockResolvedValue({...profile,language:'en',theme:'light'});
  mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByLabelText(copy.nativePersonal.name);
  expect(mockSetLocale).toHaveBeenLastCalledWith('en');expect(mockSetMode).toHaveBeenLastCalledWith('system');
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Synthetic');
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));await screen.findByText(copy.nativePersonal.profileSaved);
  expect(mockSetLocale).toHaveBeenLastCalledWith('sv');expect(mockSetMode).toHaveBeenLastCalledWith('dark');
  expect(screen.queryByRole('button',{name:copy.nativePersonal.refresh})).toBeNull();
});
it('does not apply stale profile preferences after logout while the current profile reread is pending',async()=>{
  jest.mocked(api.readNativeProfile).mockResolvedValueOnce({...profile,displayName:null,profileComplete:false});
  jest.mocked(api.readNativeMode).mockResolvedValue({mode:null});jest.mocked(api.saveNativeProfile).mockResolvedValue(profile);
  let resolve:(value:Awaited<ReturnType<typeof api.readNativeProfile>>)=>void=()=>undefined;
  function Retire(){const session=useNativeSession();return <Pressable accessibilityRole='button' accessibilityLabel='End test session' onPress={()=>{void session.logout();}}><Text>End test session</Text></Pressable>;}
  mount(<Retire/>);await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByLabelText(copy.nativePersonal.name);
  jest.mocked(api.readNativeProfile).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Synthetic');fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));
  await waitFor(()=>expect(api.readNativeProfile).toHaveBeenCalledTimes(2));expect(screen.queryByRole('button',{name:copy.nativePersonal.logout})).toBeNull();fireEvent.press(screen.getByRole('button',{name:'End test session'}));
  await act(async()=>resolve({...profile,language:'sv',theme:'dark'}));await waitFor(()=>expect(screen.queryByLabelText(copy.nativePersonal.name)).toBeNull());
  expect(mockSetLocale).not.toHaveBeenCalledWith('sv');expect(mockSetMode).not.toHaveBeenCalledWith('dark');
});
it('uses the accepted category fallback rather than exposing an unresolved legacy translation key',async()=>{
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,categoryCode:'LEGACY_UNKNOWN'}],nextCursor:null});
  mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
  expect(screen.getByRole('header',{name:copy.ownerSubscriptions.categoryFallback})).toBeTruthy();expect(screen.getByTestId(`native-subscription-row-${row.id}`).props.accessibilityState.expanded).toBe(false);expect(screen.queryByText(copy.ownerSubscriptions.status.ACTIVE)).toBeNull();
  expect(screen.queryByText('onboarding.ownerSubscriptions.category.LEGACY_UNKNOWN')).toBeNull();
});

it('does not let an old logout acknowledgement replace feedback after fresh verification starts',async()=>{
  const fresh={...row,customName:'Fresh current data'};
  jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[fresh],nextCursor:null});
  let acknowledge:()=>void=()=>undefined;jest.mocked(api.revokeNativeSession).mockImplementationOnce(()=>new Promise<undefined>(done=>{acknowledge=()=>done(undefined);}));
  let completeVerification:(value:typeof credentials)=>void=()=>undefined;
  jest.mocked(api.verifiedNativeLogin).mockResolvedValueOnce(credentials)
    .mockImplementationOnce(()=>new Promise(done=>{completeVerification=done;}));
  mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
  performLogout();expect(screen.queryByText(row.customName)).toBeNull();
  await waitFor(()=>expect(api.revokeNativeSession).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));
  await act(async()=>acknowledge());await waitFor(()=>expect(api.verifiedNativeLogin).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(copy.nativePersonal.logoutConfirmed)).toBeNull();expect(screen.queryByText(copy.nativePersonal.logoutLocal)).toBeNull();
  expect(screen.queryByText(fresh.customName)).toBeNull();
  await act(async()=>completeVerification(credentials));await screen.findByText(fresh.customName);
  expect(screen.queryByText(copy.nativePersonal.logoutConfirmed)).toBeNull();expect(screen.queryByText(copy.nativePersonal.logoutLocal)).toBeNull();
  expect(api.verifiedNativeLogin).toHaveBeenCalledTimes(2);
});

it('shows genuine current verification failure after its own busy phase', async () => {
  jest.mocked(api.verifiedNativeLogin).mockRejectedValueOnce(new Error('verification unavailable'));
  mount(); await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify }));
  await screen.findByText(copy.nativePersonal.unavailable);
  expect(screen.queryByText(row.customName)).toBeNull();
});

it('ignores a late login rejection after logout and a newer verification', async () => {
  let reject: (error: Error) => void = () => undefined;
  // Isolate the screen callback boundary: Core cleanup races are covered separately.
  const originalEstablish=NativeSessionCore.prototype.establish;
  const establish = jest.spyOn(NativeSessionCore.prototype, 'establish')
    .mockImplementationOnce(function(this:NativeSessionCore,verify) { return originalEstablish.call(this,verify).then(()=>new Promise<void>((_,fail)=>{reject=fail;})); });
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({ items: [row], nextCursor: null });
  try {
    mount(); await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify }));
    await screen.findByText(row.customName);
    performLogout();
    await screen.findByText(copy.nativePersonal.logoutConfirmed);
    fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify }));
    await screen.findByText(row.customName);
    await act(async () => reject(new Error('old login failure')));
    expect(screen.queryByText(copy.nativePersonal.unavailable)).toBeNull();
    expect(screen.getByText(row.customName)).toBeTruthy();
  } finally { establish.mockRestore(); }
});

it('Edit preserves exact huge amount and reads authoritative revision after save',async()=>{
 const saved={...row,customName:'Saved edit',revision:'2'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[saved],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({id:row.id,revision:'2'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));
 expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByLabelText(copy.ownerSubscriptionList.search)).toBeNull();
 expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();expect(screen.getByRole('tab',{name:copy.productNav.manage})).toBeTruthy();
 expect(screen.getByLabelText(copy.nativePersonal.amount).props.value).toBe('90071992547409.93');
 fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Draft edit');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));
 await screen.findByText(copy.nativeSubscriptionEdit.saved);expect(screen.getByText(saved.customName)).toBeTruthy();
 expect(screen.getByLabelText(copy.ownerSubscriptionList.search)).toBeTruthy();expect(screen.getByRole('button',{name:copy.manualSubscription.title})).toBeTruthy();
 expect(api.editNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({id:row.id,expectedRevision:'1',expectedAmountMinor:row.expectedAmountMinor,customName:'Draft edit'}),credentials.accessToken,expect.any(AbortSignal));
});
it('stale Edit preserves draft until explicit saved-value review and new intent',async()=>{
 const current={...row,customName:'Other saved change',revision:'2'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[current],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({conflict:'MANUAL_EDIT_CONFLICT'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Preserved draft');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));
 await screen.findByText(copy.nativeSubscriptionEdit.conflict);expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Preserved draft');
 expect(screen.queryByLabelText(copy.ownerSubscriptionList.search)).toBeNull();expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));expect(api.editNativeSubscription).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.review}));expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Preserved draft');
 expect(screen.queryByLabelText(copy.ownerSubscriptionList.search)).toBeNull();expect(screen.queryByRole('button',{name:copy.nativePersonal.logout})).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await waitFor(()=>expect(api.editNativeSubscription).toHaveBeenCalledTimes(2));expect(jest.mocked(api.editNativeSubscription).mock.calls[1]?.[0].expectedRevision).toBe('2');
});
it('Pause tracks only acknowledged and reread status, with no provider cancellation',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,status:'PAUSED',revision:'2'}],nextCursor:null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:row.id,status:'PAUSED'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);
 expect(api.updateNativeSubscriptionStatus).toHaveBeenCalledWith({id:row.id,status:'PAUSED'},credentials.accessToken,expect.any(AbortSignal));expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeTruthy();
});

const earlierPage = () => Array.from({length:50},(_,index)=>({...row,id:`123e4567-e89b-42d3-a456-${String(index+1).padStart(12,'0')}`,customName:`Earlier ${index}`,status:'ARCHIVED' as const}));
async function laterPageScreen(first:ReturnType<typeof earlierPage>) {
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(first[0]!.customName);
 await screen.findByText(row.customName);expect(screen.queryByRole('button',{name:copy.ownerSubscriptions.loadMore})).toBeNull();
}
it('rereads both loaded owner pages after later-page Edit, retaining acknowledged target',async()=>{
 const first=earlierPage();const current={...row,customName:'Later saved edit',revision:'2'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:[current],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({id:row.id,revision:'2'});await laterPageScreen(first);
 expandCurrentRow(row.id);fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.saved);
 expect(screen.getByText(current.customName)).toBeTruthy();expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith(credentials.accessToken,expect.any(AbortSignal),'cursorB');
});
it('later-page stale conflict preserves draft and requires explicit review of the reread row',async()=>{
 const first=earlierPage();const current={...row,revision:'2',categoryCode:'LEGACY_CATEGORY'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:[current],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({conflict:'MANUAL_EDIT_CONFLICT'});await laterPageScreen(first);
 expandCurrentRow(row.id);fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Private later draft');
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.conflict);
 expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Private later draft');
 expect(screen.queryByText(/onboarding\.ownerSubscriptions\.category\.LEGACY_CATEGORY/)).toBeNull();expect(screen.getAllByText(new RegExp(copy.ownerSubscriptions.categoryFallback)).length).toBeGreaterThan(0);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.review}));expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Private later draft');
});
it('later-page tracking Pause rereads the loaded range and confirms only the target status',async()=>{
 const first=earlierPage();jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:[{...row,status:'PAUSED',revision:'2'}],nextCursor:null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:row.id,status:'PAUSED'});await laterPageScreen(first);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);expect(screen.getByText(row.customName)).toBeTruthy();
 expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith(credentials.accessToken,expect.any(AbortSignal),'cursorB');
});
it('a missing reread never treats a preserved Edit draft as deleted',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({conflict:'MANUAL_EDIT_CONFLICT'});mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));
 fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Still private draft');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativePersonal.readbackUnavailable);
 expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Still private draft');expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}).props.accessibilityState.disabled).toBe(true);
 expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.review})).toBeTruthy();
});
it.each(['edit','status'])('wrong resource ID in acknowledged %s retires authority without success feedback',async operation=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({id:'123e4567-e89b-42d3-a456-426614174099',revision:'2'});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:'123e4567-e89b-42d3-a456-426614174099',status:'PAUSED'});
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 if(operation==='edit'){expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));}
 else {expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));}
 await screen.findByText(copy.nativePersonal.unavailable);expect(screen.queryByText(copy.nativeSubscriptionEdit.saved)).toBeNull();expect(screen.queryByText(copy.nativeSubscriptionEdit.statusSaved)).toBeNull();expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});

it.each(['cursor','duplicate'])('malformed paginated %s readback retires authority without announcing success',async defect=>{
 const first=earlierPage();jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:defect==='duplicate'?[first[0]!,row]:[row],nextCursor:defect==='cursor'?'cursorB':null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:row.id,status:'PAUSED'});await laterPageScreen(first);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativePersonal.unavailable);
 expect(screen.queryByText(copy.nativeSubscriptionEdit.statusSaved)).toBeNull();expect(screen.queryByText(row.customName)).toBeNull();
});
it('legacy category draft uses the accepted fallback until the owner chooses an approved category',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,categoryCode:'LEGACY_CATEGORY'}],nextCursor:null});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));expect(screen.queryByText('onboarding.ownerSubscriptions.category.LEGACY_CATEGORY')).toBeNull();
 expect(screen.getByTestId('native-subscription-category').props.value).toBe('');
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.manualSubscription.invalidCategory);expect(api.editNativeSubscription).not.toHaveBeenCalled();
});

it('opens native Home only after current profile and Just me readback',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});mount();
 expect(screen.queryByRole('tab',{name:copy.productNav.home})).toBeNull();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));
 await screen.findByRole('tab',{name:copy.productNav.home});expect(screen.getAllByRole('tab')).toHaveLength(5);fireEvent.press(screen.getByRole('tab',{name:copy.productNav.home}));expect(mockReplace).toHaveBeenCalledWith('/personal-billing-month');
});

it('personal list focus after the agenda rereads changed saved rows',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,customName:'After agenda edit'}],nextCursor:null});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 const focused=jest.mocked(useFocusEffect).mock.calls[jest.mocked(useFocusEffect).mock.calls.length-1]![0];act(()=>{focused();});await screen.findByText('After agenda edit');expect(screen.queryByText(row.customName)).toBeNull();
});

it('production confirmed detected rows retain owner display without sandbox editing controls',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,source:'DETECTED'}],nextCursor:null});mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);expect(screen.queryByText(copy.nativeDetection.detected)).toBeNull();expandCurrentRow();expect(screen.queryByRole('button',{name:copy.nativeSubscriptionEdit.edit})).toBeNull();expect(screen.queryByRole('button',{name:copy.nativeSubscriptionEdit.pause})).toBeNull();fireEvent.press(screen.getAllByRole('button',{name:copy.nativeDetection.open})[0]!);expect(mockPush).toHaveBeenCalledWith('/personal-detections');
});


it('searches the terminal second page with Unicode names, localized category and clear/no-match states',async()=>{
 const second={...row,id:'223e4567-e89b-42d3-a456-426614174001',customName:'Café Fictional',expectedAmountMinor:'2500'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:'next-page'}).mockResolvedValueOnce({items:[second],nextCursor:null});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(second.customName);
 expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith(credentials.accessToken,expect.any(AbortSignal),'next-page');const search=screen.getByLabelText(copy.ownerSubscriptionList.search);fireEvent.changeText(search,'CAFE\u0301');expect(screen.getByText(second.customName)).toBeTruthy();expect(screen.queryByText(row.customName)).toBeNull();
 fireEvent.changeText(search,'absent');expect(screen.getByText(copy.ownerSubscriptionList.noMatch)).toBeTruthy();expect(screen.queryByText(second.customName)).toBeNull();fireEvent.press(screen.getByRole('button',{name:copy.ownerSubscriptionList.clear}));expect(screen.getByText(second.customName)).toBeTruthy();expect(screen.getByText(row.customName)).toBeTruthy();
 fireEvent.changeText(search,copy.ownerSubscriptions.category.VIDEO_STREAMING.toUpperCase());expect(screen.getByText(second.customName)).toBeTruthy();expect(screen.getByText(row.customName)).toBeTruthy();
});

it('combines category filters with search and restores all categories without another server read',async()=>{
 const music={...row,id:'22222222-2222-4222-8222-222222222222',customName:'Soundwave Family',categoryCode:'MUSIC_AUDIO'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row,music],nextCursor:null});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 const all=catalogs.en.nativeProductDetails.allCategories;
 expect(screen.getByRole('button',{name:all}).props.accessibilityState.selected).toBe(true);
 fireEvent.press(screen.getByRole('button',{name:copy.ownerSubscriptions.category.VIDEO_STREAMING}));
 expect(screen.getByRole('button',{name:copy.ownerSubscriptions.category.VIDEO_STREAMING}).props.accessibilityState.selected).toBe(true);
 expect(screen.getByText(row.customName)).toBeTruthy();expect(screen.queryByText(music.customName)).toBeNull();
 fireEvent.changeText(screen.getByLabelText(copy.ownerSubscriptionList.search),'Soundwave');
 expect(screen.getByText(copy.ownerSubscriptionList.noMatch)).toBeTruthy();expect(screen.queryByText(row.customName)).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:all}));
 expect(screen.getByRole('button',{name:all}).props.accessibilityState.selected).toBe(true);
 expect(screen.getByText(music.customName)).toBeTruthy();expect(screen.queryByText(row.customName)).toBeNull();
 expect(screen.getByLabelText(copy.ownerSubscriptionList.search).props.value).toBe('Soundwave');
 fireEvent.press(screen.getByRole('button',{name:copy.ownerSubscriptionList.clear}));
 expect(screen.getByText(row.customName)).toBeTruthy();expect(screen.getByText(music.customName)).toBeTruthy();expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});

it('renders active per-cadence currency totals and recomputes category groups after persisted edit/status readback',async()=>{
 const saved={...row,expectedAmountMinor:'12990'},edited={...saved,revision:'2',categoryCode:'MUSIC_AUDIO'},paused={...edited,status:'PAUSED' as const};jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[saved],nextCursor:null}).mockResolvedValueOnce({items:[edited],nextCursor:null}).mockResolvedValueOnce({items:[paused],nextCursor:null});jest.mocked(api.editNativeSubscription).mockResolvedValue({id:saved.id,revision:'2'});jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:saved.id,status:'PAUSED'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(saved.customName);expect(screen.getByText(`${copy.ownerSubscriptions.cadence.MONTHLY} · 129,90 SEK`)).toBeTruthy();
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));chooseCategory(copy.ownerSubscriptions.category.MUSIC_AUDIO);fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.saved);expect(screen.getByRole('header',{name:copy.ownerSubscriptions.category.MUSIC_AUDIO})).toBeTruthy();expect(screen.queryByRole('header',{name:copy.ownerSubscriptions.category.VIDEO_STREAMING})).toBeNull();
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);expect(screen.getByText(saved.customName)).toBeTruthy();expect(screen.queryByText(copy.ownerSubscriptionList.expectedSubtotal)).toBeNull();expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeTruthy();
});

it('blur aborts a complete read and clears query/data while stale completion cannot revive the view',async()=>{
 let complete:(page:{items:typeof row[];nextCursor:null})=>void=()=>{throw Error('not started')};jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;})).mockResolvedValue({items:[row],nextCursor:null});mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);fireEvent.changeText(screen.getByLabelText(copy.ownerSubscriptionList.search),'database');fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.reload}));await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(2));
 const focusCalls=jest.mocked(useFocusEffect).mock.calls;const callback=focusCalls[focusCalls.length-1]![0];let cleanup:void|(()=>void);act(()=>{cleanup=callback();});act(()=>{if(cleanup)cleanup();});expect(screen.queryByText(row.customName)).toBeNull();const signal=jest.mocked(api.readNativeSubscriptions).mock.calls[1]![1];expect(signal.aborted).toBe(true);await act(async()=>{complete({items:[row],nextCursor:null});});expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText(copy.nativePersonal.unavailable)).toBeNull();act(()=>{callback();});await screen.findByText(row.customName);expect(screen.getByLabelText(copy.ownerSubscriptionList.search).props.value).toBe('');
});

async function realActivePersonalSession(){
 const store:NativeBundleStore={read:jest.fn().mockResolvedValue(null),write:jest.fn().mockResolvedValue(undefined),clear:jest.fn().mockResolvedValue(undefined)},changed=jest.fn(),core=new NativeSessionCore(store,changed);await core.establish(async()=>credentials);
 const session:import('./NativePersonalScreen').NativeFeatureSession={phase:'active',run:work=>core.run(work),login:jest.fn(),refresh:jest.fn(),logout:jest.fn()};return{core,session,store,changed};
}
it('clearing the actual date picker keeps Edit mounted, closes its modal and submits an explicit null date',async()=>{
 const dated={...row,nextChargeDate:'2026-10-17'},edited={...dated,customName:'Example streaming Plus',nextChargeDate:null,revision:'2'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[dated],nextCursor:null}).mockResolvedValueOnce({items:[edited],nextCursor:null});jest.mocked(api.editNativeSubscription).mockResolvedValue({id:row.id,revision:'2'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Example streaming Plus');fireEvent.press(screen.getByTestId('native-subscription-date'));
 expect(screen.getByTestId('native-date-2026-10-17')).toBeTruthy();fireEvent.press(screen.getByRole('button',{name:copy.datePicker.clear}));
 expect(screen.queryByRole('button',{name:copy.datePicker.clear})).toBeNull();expect(screen.queryByTestId('native-date-2026-10-17')).toBeNull();expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}).props.accessibilityState.disabled).toBe(false);expect(screen.queryByRole('button',{name:copy.manualSubscription.save})).toBeNull();expect(api.editNativeSubscription).not.toHaveBeenCalled();
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.saved);expect(api.editNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({id:row.id,expectedRevision:'1',customName:'Example streaming Plus',nextChargeDate:null}),credentials.accessToken,expect.any(AbortSignal));
});
it('real native authority survives an aborted read when leaving Manage',async()=>{
 const f=await realActivePersonalSession();jest.mocked(api.readNativeSubscriptions).mockImplementation((_token,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Route read aborted')),{once:true})));
 const view=render(<NativePersonalScreen useSession={()=>f.session}/>);await waitFor(()=>expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1));view.unmount();
 await expect(f.core.run(async token=>token)).resolves.toBe(credentials.accessToken);expect(f.changed).toHaveBeenLastCalledWith('active');expect(f.store.clear).toHaveBeenCalledTimes(1);
});
it('real native authority retires an uncertain sent tracking mutation after leaving Manage without retrying',async()=>{
 const f=await realActivePersonalSession();jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockImplementation((_body,_token,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Sent mutation response unavailable')),{once:true})));
 const view=render(<NativePersonalScreen useSession={()=>f.session}/>);await screen.findByText(row.customName);expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));
 await waitFor(()=>expect(api.updateNativeSubscriptionStatus).toHaveBeenCalledTimes(1));view.unmount();
 await expect(f.core.run(async()=>true)).rejects.toThrow('Fresh verification required');expect(f.changed).toHaveBeenLastCalledWith('verification-required');expect(f.store.clear).toHaveBeenCalledTimes(2);expect(api.updateNativeSubscriptionStatus).toHaveBeenCalledTimes(1);expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});

it('uses Swedish search/category/subtotal labels and clears search immediately on logout',async()=>{
 mockLocale.value='sv';jest.mocked(api.readNativeProfile).mockResolvedValue({...profile,language:'sv'});jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,customName:'Fiktiv tjänst'}],nextCursor:null});jest.mocked(api.revokeNativeSession).mockResolvedValue(undefined);mount();const sv=catalogs.sv.onboarding;await waitFor(()=>expect(screen.getByRole('button',{name:sv.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:sv.nativePersonal.verify}));await screen.findByText('Fiktiv tjänst');fireEvent.changeText(screen.getByLabelText(sv.ownerSubscriptionList.search),sv.ownerSubscriptions.category.VIDEO_STREAMING);expect(screen.getByText('Fiktiv tjänst')).toBeTruthy();expect(screen.getByText(new RegExp(`^${sv.ownerSubscriptions.cadence.MONTHLY} · `))).toBeTruthy();performLogout();expect(screen.queryByText('Fiktiv tjänst')).toBeNull();expect(screen.queryByLabelText(sv.ownerSubscriptionList.search)).toBeNull();
});


it.each([false,true])('retains disabled loaded rows during pending status and clears them on logout=%s',async logout=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,status:'PAUSED',revision:'2'}],nextCursor:null});
 let finish: (value:{id:string;status:'PAUSED'})=>void=()=>undefined;
 jest.mocked(api.updateNativeSubscriptionStatus).mockImplementationOnce(()=>new Promise(done=>{finish=done;}));
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 expandCurrentRow();fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await waitFor(()=>expect(api.updateNativeSubscriptionStatus).toHaveBeenCalledTimes(1));
 expect(screen.getByText(row.customName)).toBeTruthy();
 expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}).props.accessibilityState.disabled).toBe(true);
 expect(screen.queryByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeNull();
 expect(screen.queryByText(copy.nativeSubscriptionEdit.statusSaved)).toBeNull();
 if(logout){performLogout();expect(screen.queryByText(row.customName)).toBeNull();}
 await act(async()=>finish({id:row.id,status:'PAUSED'}));
 if(logout){expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeNull();expect(screen.queryByText(copy.nativeSubscriptionEdit.statusSaved)).toBeNull();}
 else {await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeTruthy();}
});

it.each(['en','sv'] as const)('shows a concise signed-out screen without premature feedback in %s',async locale=>{
 mockLocale.value=locale;mount();const personal=catalogs[locale].onboarding.nativePersonal;
 await screen.findByRole('header',{name:personal.loginTitle});
 expect(screen.queryByText(personal.introduction)).toBeNull();expect(screen.queryByText(personal.restart)).toBeNull();
 expect(screen.queryByText(personal.logoutConfirmed)).toBeNull();expect(screen.queryByText(personal.saved)).toBeNull();
 expect(screen.queryByRole('button',{name:personal.logout})).toBeNull();
 expect(screen.queryByRole('tab',{name:catalogs[locale].onboarding.productNav.manage})).toBeNull();
 const login=screen.getByTestId('native-personal-login');expect(login).toBe(screen.getByRole('button',{name:personal.verify}));
 expect(login).not.toBe(screen.getByRole('header',{name:personal.loginTitle}));
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});
 await waitFor(()=>expect(login.props.accessibilityState.disabled).toBe(false));fireEvent.press(login);await screen.findByText(catalogs[locale].onboarding.ownerSubscriptions.empty);
});

it('profile setup offers only contract-supported avatars and saves selected emoji with readback',async()=>{
 const {parseProfilePatch}=jest.requireActual('@subtrack/contracts/profile');
 expect(()=>parseProfilePatch({displayName:'Example',avatarEmoji:'🥹'})).toThrow();
 jest.mocked(api.readNativeProfile).mockResolvedValueOnce({...profile,displayName:null,profileComplete:false}).mockResolvedValueOnce({...profile,avatarEmoji:'🙂'});
 jest.mocked(api.readNativeMode).mockResolvedValue({mode:null});jest.mocked(api.saveNativeProfile).mockResolvedValue({...profile,avatarEmoji:'🙂'});
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByLabelText(copy.nativePersonal.name);
 expect(screen.queryByLabelText(copy.nativePersonal.emoji)).toBeNull();expect(screen.queryByText(copy.nativePersonal.language)).toBeNull();expect(screen.queryByText(copy.nativePersonal.theme)).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));expect(screen.getByText(copy.nativePersonal.invalidProfileName)).toBeTruthy();expect(api.saveNativeProfile).not.toHaveBeenCalled();
 fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Example');
 for(const emoji of ['🙂','😀','😎','🌟','🌿','🐱','🦊','🦉']){expect(()=>parseProfilePatch({avatarEmoji:emoji})).not.toThrow();expect(screen.getByRole('button',{name:emoji})).toBeTruthy();}
 fireEvent.press(screen.getByRole('button',{name:'🙂'}));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));
 await screen.findByText(copy.nativePersonal.profileSaved);expect(api.saveNativeProfile).toHaveBeenCalledWith({displayName:'Example',avatarEmoji:'🙂'},credentials.accessToken,expect.any(AbortSignal));expect(api.readNativeProfile).toHaveBeenCalledTimes(2);
});

it('sandbox confirmed detected plans support correction and acknowledged tracking while pending detections stay review-only',async()=>{
 let persisted={...row,source:'DETECTED' as const,customName:'Detected current plan',nextChargeDate:'2026-11-17'};
 const pending={...persisted,id:'123e4567-e89b-42d3-a456-426614174001',customName:'Pending detection',status:'DETECTED' as const};
 const injected={...api,readNativeProfile:jest.fn().mockResolvedValue(profile),readNativeMode:jest.fn().mockResolvedValue({mode:'just-me'}),
  readNativeSubscriptions:jest.fn(async()=>({items:[persisted,pending],nextCursor:null})),
  editNativeSubscription:jest.fn(async()=>{persisted={...persisted,customName:'Backend confirmed correction',revision:'2'};return{id:persisted.id,revision:'2'};}),
  updateNativeSubscriptionStatus:jest.fn(async()=>{persisted={...persisted,status:'PAUSED' as never,revision:'3'};return{id:persisted.id,status:'PAUSED' as const};})};
 const session={phase:'active' as const,login:async()=>{},refresh:async()=>{},logout:async()=>true,run:async<T,>(work:(token:string,signal:AbortSignal)=>Promise<T>)=>work('sandbox-current',new AbortController().signal)};
 render(<NativePersonalScreen useSession={()=>session} api={injected} sandbox/>);await screen.findByText(persisted.customName);
 expandCurrentRow(pending.id);expect(screen.queryByRole('button',{name:copy.nativeSubscriptionEdit.edit})).toBeNull();expect(screen.queryByRole('button',{name:copy.nativeSubscriptionEdit.pause})).toBeNull();expect(screen.getAllByRole('button',{name:copy.nativeDetection.open}).length).toBe(2);
 expandCurrentRow(persisted.id);fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));
 expect(screen.getByLabelText(copy.nativePersonal.amount).props.value).toBe('90071992547409.93');fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'User correction');
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.saved);expect(screen.getByText('Backend confirmed correction')).toBeTruthy();expect(screen.queryByText('User correction')).toBeNull();
 expect(injected.editNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({id:row.id,expectedRevision:'1',customName:'User correction',expectedAmountMinor:row.expectedAmountMinor,nextChargeDate:'2026-11-17'}),'sandbox-current',expect.any(AbortSignal));
 expandCurrentRow(persisted.id);fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeTruthy();
 expect(injected.updateNativeSubscriptionStatus).toHaveBeenCalledWith({id:row.id,status:'PAUSED'},'sandbox-current',expect.any(AbortSignal));expect(api.readNativeProfile).not.toHaveBeenCalled();expect(api.editNativeSubscription).not.toHaveBeenCalled();expect(api.updateNativeSubscriptionStatus).not.toHaveBeenCalled();
});
