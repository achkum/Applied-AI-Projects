import React from 'react';
import { Pressable, ScrollView, Text, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NativePersonalScreen } from './NativePersonalScreen';
import { NativeSessionProvider } from '@/state/NativeSession';
import { NativeSessionCore } from '@/state/NativeSessionCore';
import * as api from '@/api/privateMobileApi';
import { catalogs } from '@subtrack/i18n';
import type { NativeBundleStore } from '@/utils/secureSessionBundle';
const mockSetLocale = jest.fn(); const mockSetMode = jest.fn();
jest.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/api/privateMobileApi', () => ({ verifiedNativeLogin: jest.fn(), revokeNativeSession: jest.fn(), rotateNativeSession: jest.fn(), completeNativeEnrollment: jest.fn(),
  readNativeProfile: jest.fn(), saveNativeProfile: jest.fn(), readNativeMode: jest.fn(), chooseNativeJustMe: jest.fn(), readNativeSubscriptions: jest.fn(), editNativeSubscription: jest.fn(), updateNativeSubscriptionStatus: jest.fn(), createNativeSubscription: jest.fn() }));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ ...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false), setMode: mockSetMode }) }));
jest.mock('@/context/I18nContext', () => ({ useI18n: () => ({ ...jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en'), setLocale: mockSetLocale }) }));
const credentials = { transport: 'mobile' as const, sessionId: '123e4567-e89b-42d3-a456-426614174000', accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
const profile = { displayName: 'Synthetic', avatarColourToken: null, avatarEmoji: null, language: 'en' as const, theme: 'system' as const, defaultCurrency: 'SEK' as const, profileComplete: true };
const row = { id: credentials.sessionId, revision: '1', source: 'MANUAL' as const, visibility: 'owner' as const, customName: 'Current database name', merchantId: null, merchantName: null,
  categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const, status: 'ACTIVE' as const, expectedAmountMinor: '9007199254740993', currency: 'SEK', nextChargeDate: null, alwaysPrivate: true };
const copy = catalogs.en.onboarding;
// Cold native host/Babel initialization took 4429 ms in the first workflow.
// Prepare only generic hosts; every behavioral test retains its 5000 ms deadline.
beforeAll(() => {
  const fixture = render(<ScrollView><Text>host ready</Text><Pressable><Text>host button</Text></Pressable><TextInput /></ScrollView>);
  expect(fixture.getByText('host ready')).toBeTruthy();
  fixture.unmount();
}, 60_000);
beforeEach(() => { jest.resetAllMocks(); mockSetLocale.mockResolvedValue(undefined); mockSetMode.mockResolvedValue(undefined); jest.mocked(api.verifiedNativeLogin).mockResolvedValue(credentials);
  jest.mocked(api.readNativeProfile).mockResolvedValue(profile); jest.mocked(api.readNativeMode).mockResolvedValue({ mode: 'just-me' }); });
function mount() { const store: NativeBundleStore = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  return render(<NativeSessionProvider store={store}><NativePersonalScreen /></NativeSessionProvider>); }
it('reads current private rows only after fresh verification and clears them immediately on offline logout', async () => {
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({ items: [row], nextCursor: null });
  jest.mocked(api.revokeNativeSession).mockRejectedValue(new Error('offline')); mount();
  await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByText(row.customName)).toBeNull(); fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify }));
  await screen.findByText(row.customName); expect(api.readNativeProfile).toHaveBeenCalledWith(credentials.accessToken, expect.any(AbortSignal));
  fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.logout })); expect(screen.queryByText(row.customName)).toBeNull();
  await screen.findByText(copy.nativePersonal.logoutLocal);
});
it('uses exact localized Money input and displays authoritative reread rather than the submitted draft', async () => {
  jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ items: [row], nextCursor: null });
  jest.mocked(api.createNativeSubscription).mockResolvedValue({ id: row.id }); mount();
  await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify })); await screen.findByText(copy.ownerSubscriptions.empty);
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.title }));
  fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name), 'Submitted draft');
  fireEvent.press(screen.getByRole('button', { name: copy.ownerSubscriptions.category.VIDEO_STREAMING }));
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount), '90071992547409.93');
  fireEvent.press(screen.getByRole('button', { name: copy.manualSubscription.save }));
  await screen.findByText(copy.nativePersonal.saved); expect(screen.getByText(row.customName)).toBeTruthy(); expect(screen.queryByText('Submitted draft')).toBeNull();
  expect(api.createNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({ expectedAmountMinor: '9007199254740993' }), credentials.accessToken, expect.any(AbortSignal));
});

it('completes profile and Just me only from separate authoritative reads',async()=>{
  jest.mocked(api.readNativeProfile).mockResolvedValueOnce({...profile,displayName:null,profileComplete:false}).mockResolvedValueOnce(profile);
  jest.mocked(api.saveNativeProfile).mockResolvedValue({...profile,displayName:'Ignored patch response'});
  jest.mocked(api.readNativeMode).mockResolvedValueOnce({mode:null}).mockResolvedValueOnce({mode:'just-me'});
  jest.mocked(api.chooseNativeJustMe).mockResolvedValue({mode:'just-me'});
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[],nextCursor:null});mount();
  await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));
  await screen.findByLabelText(copy.nativePersonal.name);fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Synthetic');
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));await screen.findByText(copy.nativePersonal.profileSaved);
  expect(screen.queryByText('Ignored patch response')).toBeNull();
  fireEvent.press(screen.getByRole('button',{name:copy.mode.choose}));await screen.findByText(copy.ownerSubscriptions.empty);
  expect(api.readNativeProfile).toHaveBeenCalledTimes(2);expect(api.readNativeMode).toHaveBeenCalledTimes(2);
  expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});

it('keeps an off-page Add explicit until a subsequent authoritative page contains the created ID',async()=>{
  const rows=Array.from({length:50},(_,index)=>({...row,id:'123e4567-e89b-42d3-a456-'+String(index).padStart(12,'0'),customName:'Earlier '+index}));
  jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:rows,nextCursor:'cursor-one'})
    .mockResolvedValueOnce({items:rows,nextCursor:'cursor-one'}).mockResolvedValueOnce({items:[row],nextCursor:null});
  jest.mocked(api.createNativeSubscription).mockResolvedValue({id:row.id});mount();
  await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText('Earlier 0');
  fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.title}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Not authoritative draft');
  fireEvent.press(screen.getByRole('button',{name:copy.ownerSubscriptions.category.VIDEO_STREAMING}));fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.amount),'1.00');
  fireEvent.press(screen.getByRole('button',{name:copy.manualSubscription.save}));await screen.findByText(copy.nativePersonal.readbackUnavailable);
  expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByText('Not authoritative draft')).toBeNull();
  fireEvent.press(screen.getByRole('button',{name:copy.ownerSubscriptions.loadMore}));await screen.findByText(copy.nativePersonal.saved);
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
  mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByLabelText(copy.nativePersonal.name);
  jest.mocked(api.readNativeProfile).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  fireEvent.changeText(screen.getByLabelText(copy.nativePersonal.name),'Synthetic');fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.saveProfile}));
  await waitFor(()=>expect(api.readNativeProfile).toHaveBeenCalledTimes(2));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.logout}));
  await act(async()=>resolve({...profile,language:'sv',theme:'dark'}));await waitFor(()=>expect(screen.queryByLabelText(copy.nativePersonal.name)).toBeNull());
  expect(mockSetLocale).not.toHaveBeenCalledWith('sv');expect(mockSetMode).not.toHaveBeenCalledWith('dark');
});
it('uses the accepted category fallback rather than exposing an unresolved legacy translation key',async()=>{
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,categoryCode:'LEGACY_UNKNOWN'}],nextCursor:null});
  mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
  expect(screen.getByText(copy.ownerSubscriptions.categoryFallback+' · '+copy.ownerSubscriptions.status.ACTIVE)).toBeTruthy();
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
  fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.logout}));expect(screen.queryByText(row.customName)).toBeNull();
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
  const establish = jest.spyOn(NativeSessionCore.prototype, 'establish')
    .mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
  jest.mocked(api.readNativeSubscriptions).mockResolvedValue({ items: [row], nextCursor: null });
  try {
    mount(); await waitFor(() => expect(screen.getByRole('button', { name: copy.nativePersonal.verify }).props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.verify }));
    fireEvent.press(screen.getByRole('button', { name: copy.nativePersonal.logout }));
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
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));
 expect(screen.getByLabelText(copy.nativePersonal.amount).props.value).toBe('90071992547409.93');
 fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Draft edit');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));
 await screen.findByText(copy.nativeSubscriptionEdit.saved);expect(screen.getByText(saved.customName)).toBeTruthy();
 expect(api.editNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({id:row.id,expectedRevision:'1',expectedAmountMinor:row.expectedAmountMinor,customName:'Draft edit'}),credentials.accessToken,expect.any(AbortSignal));
});
it('stale Edit preserves draft until explicit saved-value review and new intent',async()=>{
 const current={...row,customName:'Other saved change',revision:'2'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[current],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({conflict:'MANUAL_EDIT_CONFLICT'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Preserved draft');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));
 await screen.findByText(copy.nativeSubscriptionEdit.conflict);expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Preserved draft');
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));expect(api.editNativeSubscription).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.review}));expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Preserved draft');
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await waitFor(()=>expect(api.editNativeSubscription).toHaveBeenCalledTimes(2));expect(jest.mocked(api.editNativeSubscription).mock.calls[1]?.[0].expectedRevision).toBe('2');
});
it('Pause tracks only acknowledged and reread status, with no provider cancellation',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[{...row,status:'PAUSED',revision:'2'}],nextCursor:null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:row.id,status:'PAUSED'});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);
 expect(api.updateNativeSubscriptionStatus).toHaveBeenCalledWith({id:row.id,status:'PAUSED'},credentials.accessToken,expect.any(AbortSignal));expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.resume})).toBeTruthy();
});

const earlierPage = () => Array.from({length:50},(_,index)=>({...row,id:`123e4567-e89b-42d3-a456-${String(index+1).padStart(12,'0')}`,customName:`Earlier ${index}`,status:'ARCHIVED' as const}));
async function laterPageScreen(first:ReturnType<typeof earlierPage>) {
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(first[0]!.customName);
 fireEvent.press(screen.getByRole('button',{name:copy.ownerSubscriptions.loadMore}));await screen.findByText(row.customName);
}
it('rereads both loaded owner pages after later-page Edit, retaining acknowledged target',async()=>{
 const first=earlierPage();const current={...row,customName:'Later saved edit',revision:'2'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:[current],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({id:row.id,revision:'2'});await laterPageScreen(first);
 fireEvent.press(screen.getAllByRole('button',{name:copy.nativeSubscriptionEdit.edit})[50]!);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.saved);
 expect(screen.getByText(current.customName)).toBeTruthy();expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith(credentials.accessToken,expect.any(AbortSignal),'cursorB');
});
it('later-page stale conflict preserves draft and requires explicit review of the reread row',async()=>{
 const first=earlierPage();const current={...row,revision:'2',categoryCode:'LEGACY_CATEGORY'};
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:[current],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({conflict:'MANUAL_EDIT_CONFLICT'});await laterPageScreen(first);
 fireEvent.press(screen.getAllByRole('button',{name:copy.nativeSubscriptionEdit.edit})[50]!);fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Private later draft');
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativeSubscriptionEdit.conflict);
 expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Private later draft');
 expect(screen.queryByText(/onboarding\.ownerSubscriptions\.category\.LEGACY_CATEGORY/)).toBeNull();expect(screen.getAllByText(new RegExp(copy.ownerSubscriptions.categoryFallback)).length).toBeGreaterThan(0);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.review}));expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Private later draft');
});
it('later-page tracking Pause rereads the loaded range and confirms only the target status',async()=>{
 const first=earlierPage();jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:[{...row,status:'PAUSED',revision:'2'}],nextCursor:null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:row.id,status:'PAUSED'});await laterPageScreen(first);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativeSubscriptionEdit.statusSaved);expect(screen.getByText(row.customName)).toBeTruthy();
 expect(api.readNativeSubscriptions).toHaveBeenLastCalledWith(credentials.accessToken,expect.any(AbortSignal),'cursorB');
});
it('a missing reread never treats a preserved Edit draft as deleted',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:[row],nextCursor:null}).mockResolvedValueOnce({items:[],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({conflict:'MANUAL_EDIT_CONFLICT'});mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));
 fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));
 fireEvent.changeText(screen.getByLabelText(copy.manualSubscription.name),'Still private draft');fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativePersonal.readbackUnavailable);
 expect(screen.getByLabelText(copy.manualSubscription.name).props.value).toBe('Still private draft');expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}).props.accessibilityState.disabled).toBe(true);
 expect(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.review})).toBeTruthy();
});
it.each(['edit','status'])('wrong resource ID in acknowledged %s retires authority without success feedback',async operation=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[row],nextCursor:null});
 jest.mocked(api.editNativeSubscription).mockResolvedValue({id:'123e4567-e89b-42d3-a456-426614174099',revision:'2'});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:'123e4567-e89b-42d3-a456-426614174099',status:'PAUSED'});
 mount();await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 if(operation==='edit'){fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));}
 else fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));
 await screen.findByText(copy.nativePersonal.unavailable);expect(screen.queryByText(copy.nativeSubscriptionEdit.saved)).toBeNull();expect(screen.queryByText(copy.nativeSubscriptionEdit.statusSaved)).toBeNull();expect(api.readNativeSubscriptions).toHaveBeenCalledTimes(1);
});

it.each(['cursor','duplicate'])('malformed paginated %s readback retires authority without announcing success',async defect=>{
 const first=earlierPage();jest.mocked(api.readNativeSubscriptions).mockResolvedValueOnce({items:first,nextCursor:'cursorA'}).mockResolvedValueOnce({items:[row],nextCursor:null})
  .mockResolvedValueOnce({items:first,nextCursor:'cursorB'}).mockResolvedValueOnce({items:defect==='duplicate'?[first[0]!,row]:[row],nextCursor:defect==='cursor'?'cursorB':null});
 jest.mocked(api.updateNativeSubscriptionStatus).mockResolvedValue({id:row.id,status:'PAUSED'});await laterPageScreen(first);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.pause}));await screen.findByText(copy.nativePersonal.unavailable);
 expect(screen.queryByText(copy.nativeSubscriptionEdit.statusSaved)).toBeNull();expect(screen.queryByText(row.customName)).toBeNull();
});
it('legacy category draft uses the accepted fallback until the owner chooses an approved category',async()=>{
 jest.mocked(api.readNativeSubscriptions).mockResolvedValue({items:[{...row,categoryCode:'LEGACY_CATEGORY'}],nextCursor:null});mount();
 await waitFor(()=>expect(screen.getByRole('button',{name:copy.nativePersonal.verify}).props.accessibilityState.disabled).toBe(false));fireEvent.press(screen.getByRole('button',{name:copy.nativePersonal.verify}));await screen.findByText(row.customName);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.edit}));expect(screen.queryByText('onboarding.ownerSubscriptions.category.LEGACY_CATEGORY')).toBeNull();
 expect(screen.getAllByText(copy.ownerSubscriptions.categoryFallback).length).toBeGreaterThan(0);
 fireEvent.press(screen.getByRole('button',{name:copy.nativeSubscriptionEdit.save}));await screen.findByText(copy.nativePersonal.invalid);expect(api.editNativeSubscription).not.toHaveBeenCalled();
});
