import React from 'react';
import {AccessibilityInfo,DeviceEventEmitter,Modal,RefreshControl,StyleSheet,Text} from 'react-native';
import {Circle,Polygon,Polyline,Text as SvgText} from 'react-native-svg';
import {AnalyticsMoney,AnalyticsPriceBox,AnalyticsText,AnalyticsTrend} from './NativeAnalyticsUI';
import {getColorByTheme} from '@/utils/colors';
import {money} from '../../../../../packages/money/src/money';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NativeInsightsScreen } from './NativeInsightsScreen';
import { NativeComparisonsScreen } from './NativeComparisonsScreen';
import { NativeHomeOverview } from './NativeHomeOverview';
import { projectNativeAnalytics, type AnalyticsCharge } from '@/api/nativeAnalyticsProjection';
import type { NativeAnalyticsRead } from '@/api/nativeAnalyticsReader';
import type { NativeFeatureSession } from '../onboarding/NativePersonalScreen';
import { formatMinorUnits } from '@/api/privateMobileMoney';
import { catalogs } from '@subtrack/i18n';
import type { SandboxHouseholdView } from '@subtrack/contracts/sandbox-household';
import { NativeSessionCore } from '@/state/NativeSessionCore';
import type { NativeAnalyticsReader } from '@/api/nativeAnalyticsReader';
const mockPush = jest.fn(), mockReplace = jest.fn();
let mockSearchParams:{memberId?:string|string[]}={};
const mockFocus: { cleanup?: void | (() => void) } = {};
jest.mock('expo-router', () => ({useLocalSearchParams:()=>mockSearchParams, useRouter: () => ({ push: mockPush, replace: mockReplace }), useFocusEffect: (callback: () => void | (() => void)) => {
  const React = jest.requireActual('react'); React.useEffect(() => { mockFocus.cleanup = callback(); return () => { mockFocus.cleanup?.(); }; }, [callback]);
} }));
jest.mock('@/api/privateMobileApi', () => ({ readNativeProfile: jest.fn(), readNativeMode: jest.fn(), readNativeSubscriptions: jest.fn() }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ ...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false), theme: jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json') }) }));
jest.mock('@/context/I18nContext', () => ({ useI18n: () => jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en') }));
const row = { id: '123e4567-e89b-42d3-a456-426614174000', revision: '1', source: 'MANUAL' as const, visibility: 'owner' as const, customName: 'Example streaming', merchantId: null, merchantName: null, categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY' as const, status: 'ACTIVE' as const, expectedAmountMinor: '10000', currency: 'SEK', nextChargeDate: '2026-10-17', alwaysPrivate: true };
const second = { ...row, id: '223e4567-e89b-42d3-a456-426614174000', customName: 'Other streaming', expectedAmountMinor: '7000' };
const homeHousehold: NonNullable<SandboxHouseholdView['household']> = { id: '323e4567-e89b-42d3-a456-426614174000', name: 'Example household', members: [{ id: '423e4567-e89b-42d3-a456-426614174000', displayName: 'Example owner', role: 'ADMIN' }, { id: '523e4567-e89b-42d3-a456-426614174000', displayName: 'Example child', role: 'DEPENDANT' }], assignments: [{ subscriptionId: row.id, memberIds: [], payerMemberId: '423e4567-e89b-42d3-a456-426614174000' }] };
const now = () => new Date(2026, 9, 17, 12), copy = catalogs.en.nativeAnalytics;
const history: AnalyticsCharge[] = ['-10000', '-10000', '-10000', '-12000', '-12000'].map((amountMinor, index) => ({ id: `charge-${index}`, subscriptionId: row.id, displayName: row.customName, date: `2026-${String(6 + index).padStart(2, '0')}-03`, amountMinor, currency: 'SEK' }));
function ready(): NativeAnalyticsRead { return { kind: 'ready', projection: projectNativeAnalytics([row, second], history, now()) }; }
const facade = (phase: NativeFeatureSession['phase'] = 'active'): NativeFeatureSession => ({ phase, login: jest.fn(), refresh: jest.fn(), logout: jest.fn(), run: async work => work('isolated-token', new AbortController().signal) });
const formatted = (minor: bigint) => formatMinorUnits(minor, 'SEK', { locale: 'en', display: 'code' }).replace(/[\u00a0\u202f]/g, ' ');
const heroLabel = (minor: bigint) => formatMinorUnits(minor, 'SEK', { locale: 'en', display: 'code' });
function expectHero(minor: bigint) { expect(screen.getByLabelText(heroLabel(minor))).toBeTruthy(); expect(screen.getByText(formatted(minor).replace('SEK', '').trim().replace(/,00$/,''))).toBeTruthy(); }
beforeEach(() => { jest.clearAllMocks();jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);jest.spyOn(AccessibilityInfo,'addEventListener').mockImplementation((event,handler)=>DeviceEventEmitter.addListener(event,handler)); mockFocus.cleanup = undefined;mockSearchParams={}; });
async function realSession() {
  const credentials = { transport: 'mobile' as const, sessionId: row.id, accessToken: 'header.payload.signature', refreshToken: 'v2r.' + 'a'.repeat(43) };
  const store = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) }, changed = jest.fn();
  const core = new NativeSessionCore(store, changed); await core.establish(async () => credentials);
  const session: NativeFeatureSession = { ...facade(), run: work => core.run(work) };
  return { core, session, changed, store };
}
it('keeps real native authority usable for Manage when leaving Home during an in-flight analytics read', async () => {
  const { core, session, changed, store } = await realSession();
  const reader: jest.MockedFunction<NativeAnalyticsReader> = jest.fn((_token: string, signal: AbortSignal, at: Date) => { expect(at).toEqual(now()); return new Promise<NativeAnalyticsRead>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('Local route read aborted')), { once: true }); }); });
  render(<NativeHomeOverview session={session} reader={reader} now={now} />);
  await waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
  act(() => { mockFocus.cleanup?.(); });
  await expect(core.run(async token => token)).resolves.toBe('header.payload.signature');
  expect(changed).toHaveBeenLastCalledWith('active'); expect(store.clear).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('native-home-overview')).toBeNull();
});
it('still retires real native authority on a genuine analytics read failure while Home stays focused', async () => {
  const { core, session, changed, store } = await realSession();
  const reader = jest.fn().mockRejectedValue(new Error('Server denied owner read'));
  render(<NativeHomeOverview session={session} reader={reader} now={now} />);
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith('verification-required'));
  await expect(core.run(async () => true)).rejects.toThrow('Fresh verification required');
  expect(store.clear).toHaveBeenCalledTimes(2); expect(screen.queryByTestId('native-home-overview')).toBeNull();
});

it('renders actual findings, expandable category contributions, exact trend alternatives and a real comparisons action', async () => {
  const reader = jest.fn().mockResolvedValue(ready()), session = facade();
  render(<NativeInsightsScreen useSession={() => session} reader={reader} now={now} />);
  await screen.findByText(copy.priceRise);
  expect(screen.getByRole('header', { name: copy.insights })).toBeTruthy();
  expect(screen.getByText(copy.categoryOverlap.replace('%{count}', '2'))).toBeTruthy();
  expect(screen.getByText(copy.trendEvidence)).toBeTruthy();
  expect(screen.getByText(`${copy.previous}: ${formatMinorUnits(10000n,'SEK',{locale:'en',display:'code'})} · ${copy.current}: ${formatMinorUnits(12000n,'SEK',{locale:'en',display:'code'})}`)).toBeTruthy();
  expect(screen.getByLabelText(`${formatMinorUnits(2000n,'SEK',{locale:'en',display:'code'})} ${copy.morePerMonth}. ${copy.increaseEvidence.replace('%{first}','2026-06-03').replace('%{last}','2026-10-03')}`)).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByText(formatMinorUnits(2000n,'SEK',{locale:'en',display:'code'})).props.style).color).toBe(getColorByTheme(jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json'),false,'status.warning'));
  expect(screen.getByTestId('native-insights-trend').props.accessibilityLabel).toContain(`2026-10, ${formatMinorUnits(12000n, 'SEK', { locale: 'en', display: 'code' })}, ${copy.charges.replace('%{count}', '1')}`);
  expect(screen.getByText('May – October')).toBeTruthy();
  const overview = screen.getByRole('button', { name: `${copy.overview}. ${copy.activePlans.replace('%{count}', '2')}. ${copy.findings.replace('%{count}', '2')}` });
  expect(StyleSheet.flatten(screen.getByTestId('native-insights-plan-ring').props.style)).toMatchObject({width:64,height:64});const neutralRing=screen.UNSAFE_getAllByType(Circle).find(node=>node.props.r===26);expect(neutralRing).toBeTruthy();expect(neutralRing!.props.strokeDasharray).toBeUndefined();
  expect(overview.props.accessibilityState.expanded).toBe(false); fireEvent.press(overview);
  expect(screen.getByText(copy.method)).toBeTruthy(); expect(overview.props.accessibilityState.expanded).toBe(true);
  fireEvent.press(screen.getAllByRole('button', { name: copy.openPlan.replace('%{name}',row.customName) })[0]!);await screen.findByRole('header',{name:row.customName});expect(screen.getByText(row.nextChargeDate)).toBeTruthy();expect(reader).toHaveBeenCalledTimes(2);expect(mockPush).not.toHaveBeenCalled();fireEvent.press(screen.getByTestId('native-subscription-detail-close'));expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);
  expect(screen.queryByText(/\/100/)).toBeNull(); expect(screen.queryByText('Me')).toBeNull();
});
it('keeps signed-out screens free of private rows and avoids all backend access', () => {
  const reader = jest.fn(), session = facade('verification-required');
  render(<NativeInsightsScreen useSession={() => session} reader={reader} inactiveContent={<Text>Sign in</Text>} />);
  expect(screen.getByText('Sign in')).toBeTruthy(); expect(screen.queryByText(row.customName)).toBeNull(); expect(reader).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType(RefreshControl).props.enabled).toBe(false);
});
it('suppresses completed stale owner responses on blur and revocation', async () => {
  let finish!: (value: NativeAnalyticsRead) => void;
  const reader = jest.fn(() => new Promise<NativeAnalyticsRead>(resolve => { finish = resolve; }));
  let session = facade();
  const view = render(<NativeInsightsScreen useSession={() => session} reader={reader} now={now} />);
  await waitFor(() => expect(reader).toHaveBeenCalledTimes(1));
  session = facade('verification-required'); view.rerender(<NativeInsightsScreen useSession={() => session} reader={reader} now={now} inactiveContent={<Text>Sign in</Text>} />);
  await act(async () => { finish(ready()); });
  expect(screen.queryByText(row.customName)).toBeNull(); expect(screen.queryByText(copy.priceRise)).toBeNull(); expect(screen.getByText('Sign in')).toBeTruthy();
});
it('compares saved prices accurately by month/year and only labels fixture alternatives as sample prices', async () => {
  const projection = projectNativeAnalytics([row, second], [], now(), [{ id: 'fixture:example-video', name: 'Example Video sample', categoryCode: 'VIDEO_STREAMING', cadence: 'MONTHLY', amountMinor: '6000', currency: 'SEK', source: 'synthetic-persona-fixture' }]);
  const reader = jest.fn().mockResolvedValue({ kind: 'ready', projection }), session = facade();
  render(<NativeComparisonsScreen useSession={() => session} reader={reader} now={now} />);
  await screen.findByText(copy.samplePrice); expect(screen.getByText(copy.fixtureSource)).toBeTruthy();
  expect(screen.queryByText(copy.youPay)).toBeNull(); expect(screen.getAllByText(copy.currentPlan).length).toBeGreaterThan(1);
  expect(screen.getAllByText(formatted(3000n)).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByRole('button', { name: copy.annual }));
  expect(screen.getAllByText(formatted(36000n)).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByRole('button', { name: second.customName }));
  expect(screen.getByText(copy.more.replace('%{period}', copy.annual))).toBeTruthy();
  expect(screen.queryByText(/verified today|live price|market average/i)).toBeNull();
});
it('shows actionable Home empty state and Insights navigation without duplicate tab destinations or fake totals', async () => {
  const session = facade(), reader = jest.fn().mockResolvedValue({ kind: 'ready', projection: projectNativeAnalytics([], [], now()) });
  render(<NativeHomeOverview session={session} reader={reader} now={now} />);
  await screen.findByText(copy.empty); expect(screen.queryByText(formatted(0n))).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: copy.connectBank })); expect(mockPush).toHaveBeenLastCalledWith('/personal-bank');
  fireEvent.press(screen.getByRole('button', { name: copy.seeInsights })); expect(mockPush).toHaveBeenLastCalledWith('/personal-insights');
  expect(screen.queryByRole('button',{name:copy.household})).toBeNull();expect(screen.queryByRole('button',{name:copy.compare})).toBeNull();
});
it('uses real price-rise evidence in Home preview and switches its exact hero total with one period action', async () => {
  const session = facade(), reader = jest.fn().mockResolvedValue(ready());
  render(<NativeHomeOverview session={session} reader={reader} now={now} />);
  await screen.findByText(copy.previous);
  expect(screen.getByText(row.customName)).toBeTruthy();
  expect(screen.getByText(formatted(2000n))).toBeTruthy();
  expectHero(17000n);
  expect(screen.queryByRole('button', { name: copy.monthly })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: copy.annual }));
  expectHero(204000n);
  expect(screen.getByRole('button', { name: copy.monthly })).toBeTruthy();
  expect(screen.queryByText(/score|possible savings|verified today/i)).toBeNull();
});
it('places the parent timeline between the hero and Insights and uses only the authorized profile avatar', async () => {
  const session = facade(), read = ready();
  const reader = jest.fn().mockResolvedValue({ ...read, ...(read.kind === 'ready' ? { projection: { ...read.projection, profile: { displayName: 'Example', avatarEmoji: '🌻' } } } : {}) });
  const rendered = render(<NativeHomeOverview session={session} reader={reader} now={now}><Text>Actual calendar timeline</Text></NativeHomeOverview>);
  await screen.findByText('🌻');
  const text = JSON.stringify(rendered.toJSON());
  expect(text.indexOf('Actual calendar timeline')).toBeLessThan(text.indexOf(copy.insights));
  fireEvent.press(screen.getByRole('button', { name: catalogs.en.onboarding.productNav.profile }));
  expect(mockPush).toHaveBeenLastCalledWith('/personal-profile');
});
it('defaults Home to Everyone with the actual household heading and restores full totals when a member toggles off', async () => {
  const session = facade(), base = ready();
  if (base.kind !== 'ready') throw new Error('fixture');
  const reader = jest.fn().mockResolvedValue({ kind: 'ready', projection: { ...base.projection, household: homeHousehold } });
  const timeline = jest.fn((ids: ReadonlySet<string> | null) => <Text>{ids === null ? 'Everyone timeline' : Array.from(ids).join(',')}</Text>);
  render(<NativeHomeOverview session={session} reader={reader} now={now}>{timeline}</NativeHomeOverview>);
  await screen.findByRole('header', { name: homeHousehold.name });
  expect(screen.getByTestId('native-home-scope-everyone').props.accessibilityState.selected).toBe(true);
  expectHero(17000n); expect(screen.getByText('Everyone timeline')).toBeTruthy();
  fireEvent.press(screen.getByTestId(`native-home-scope-${homeHousehold.members[0]!.id}`));
  expect(screen.queryByLabelText(heroLabel(17000n))).toBeNull(); expect(screen.getByText(row.id)).toBeTruthy();
  expect(timeline.mock.calls[timeline.mock.calls.length - 1]![0]).toEqual(new Set([row.id]));
  fireEvent.press(screen.getByTestId(`native-home-scope-${homeHousehold.members[0]!.id}`));
  expectHero(17000n); expect(timeline.mock.calls[timeline.mock.calls.length - 1]![0]).toBeNull();
  expect(reader).toHaveBeenCalledTimes(1);
});
it('does not assume unknown payers belong to a selected member or leak unrelated insight evidence into that scope', async () => {
  const session = facade(), base = ready(); if (base.kind !== 'ready') throw new Error('fixture');
  const reader = jest.fn().mockResolvedValue({ kind: 'ready', projection: { ...base.projection, household: homeHousehold } });
  render(<NativeHomeOverview session={session} reader={reader} now={now}>{ids => <Text>{ids === null ? 'All rows' : `Visible ${ids.size}`}</Text>}</NativeHomeOverview>);
  await screen.findByText(homeHousehold.name);
  fireEvent.press(screen.getByTestId(`native-home-scope-${homeHousehold.members[1]!.id}`));
  expect(screen.getByText('Visible 0')).toBeTruthy(); expect(screen.queryByText(row.customName)).toBeNull(); expect(screen.queryByText(copy.priceRise)).toBeNull();
  expect(screen.queryByLabelText(heroLabel(17000n))).toBeNull(); expect(screen.queryByRole('button', { name: copy.connectBank })).toBeNull();
  fireEvent.press(screen.getByTestId('native-home-scope-everyone')); expectHero(17000n);
});
it('discloses custom-cycle exclusions beside Home and collapsed Insights totals', async () => {
  const session = facade(), custom = { ...row, id: '623e4567-e89b-42d3-a456-426614174000', customName: 'Custom-cycle plan', cadence: 'CUSTOM' as const, expectedAmountMinor: '99999' };
  const reader = jest.fn().mockResolvedValue({ kind: 'ready', projection: projectNativeAnalytics([row, second, custom], null, now()) });
  const home = render(<NativeHomeOverview session={session} reader={reader} now={now} />);
  const warning = copy.unknownCadence.replace('%{count}', '1');
  await screen.findByText(warning); expectHero(17000n); home.unmount();
  render(<NativeInsightsScreen useSession={() => session} reader={reader} now={now} />);
  await screen.findByText(warning); expect(screen.getByTestId('native-insights-overview').props.accessibilityState.expanded).toBe(false);
  expect(screen.getByTestId('native-insights-overview').props.accessibilityLabel).toContain(copy.activePlans.replace('%{count}', '3'));
  expect(screen.getByText(copy.summaryMonthly.replace('%{amount}',formatted(17000n)).replace('%{count}','2'))).toBeTruthy();
});
it('keeps inline sample comparisons in Insights truthful and opens the actual selected saved plan',async()=>{
 const projection=projectNativeAnalytics([row,second],history,now(),[{id:'fixture:example-video',name:'Example Video sample',categoryCode:'VIDEO_STREAMING',cadence:'MONTHLY',amountMinor:'6000',currency:'SEK',source:'synthetic-persona-fixture'}]);
 render(<NativeInsightsScreen useSession={()=>facade()} reader={jest.fn().mockResolvedValue({kind:'ready',projection})} now={now}/>);
 await screen.findByRole('header',{name:copy.sameCategory});
 expect(screen.getAllByText(copy.samplePrice)).toHaveLength(2);expect(screen.getAllByText(copy.fixtureSource)).toHaveLength(1);
 expect(screen.getByText(copy.comparisonTitle.replace('%{name}',row.customName).replace('%{alternative}','Example Video sample'))).toBeTruthy();
 fireEvent.press(screen.getAllByRole('button',{name:copy.compare})[0]!);expect(mockPush).toHaveBeenLastCalledWith({pathname:'/personal-comparisons',params:{subscriptionId:row.id}});
 expect(screen.queryByText(/market average|live offer today|score.*100/i)).toBeNull();
});
it.each([1,2])('uses the actual category-overlap count for singular and plural summary copy (%s)',async count=>{
 const music=[{...row,id:'323e4567-e89b-42d3-a456-426614174000',categoryCode:'MUSIC_AUDIO'},{...second,id:'423e4567-e89b-42d3-a456-426614174000',categoryCode:'MUSIC_AUDIO'}];
 const projection=projectNativeAnalytics(count===1?[row,second]:[row,second,...music],null,now());
 render(<NativeInsightsScreen useSession={()=>facade()} reader={jest.fn().mockResolvedValue({kind:'ready',projection})} now={now}/>);
 await screen.findByText(count===1?copy.summaryOverlapOne:copy.summaryOverlap.replace('%{count}',String(count)));
 expect(screen.queryByText(count===1?copy.summaryOverlap.replace('%{count}','1'):copy.summaryOverlapOne)).toBeNull();
 expect(catalogs.sv.nativeAnalytics.summaryOverlapOne).toBe('1 kategori innehåller fler än ett aktivt abonnemang.');
});
it('skips an identical named sample in both inline Insights and the dedicated comparison list',async()=>{
 const own={...row,customName:'Example Video'},fixtures=[{id:'fixture:same',name:' example video ',categoryCode:row.categoryCode,cadence:'MONTHLY' as const,amountMinor:'9000',currency:'SEK',source:'synthetic-persona-fixture' as const},{id:'fixture:other',name:'Other sample',categoryCode:row.categoryCode,cadence:'MONTHLY' as const,amountMinor:'6000',currency:'SEK',source:'synthetic-persona-fixture' as const}],projection=projectNativeAnalytics([own],null,now(),fixtures),reader=jest.fn().mockResolvedValue({kind:'ready',projection});
 const view=render(<NativeInsightsScreen useSession={()=>facade()} reader={reader} now={now}/>);
 await screen.findByText(copy.comparisonTitle.replace('%{name}',own.customName).replace('%{alternative}','Other sample'));expect(screen.queryByText(copy.comparisonTitle.replace('%{name}',own.customName).replace('%{alternative}',' example video '))).toBeNull();view.unmount();
 render(<NativeComparisonsScreen useSession={()=>facade()} reader={reader} now={now}/>);await screen.findByText('Other sample');expect(screen.getAllByText(copy.samplePrice)).toHaveLength(1);expect(screen.queryByText(' example video ')).toBeNull();expect(screen.getByText(copy.fixtureSource)).toBeTruthy();
});
it('keeps every exact historical amount accessible while showing the reference area chart and in-chart month labels',()=>{
 const projection=projectNativeAnalytics([row],history,now());render(<AnalyticsTrend months={projection.trend}/>);
 const label=screen.getByTestId('native-insights-trend').props.accessibilityLabel;
 for(const month of projection.trend)expect(label).toContain(`${month.month}, ${formatMinorUnits(month.amount.minorUnits,month.amount.currency,{locale:'en',display:'code'})}, ${copy.charges.replace('%{count}',String(month.chargeCount))}`);
 expect(screen.UNSAFE_getAllByType(Polygon)).toHaveLength(1);expect(screen.UNSAFE_getAllByType(SvgText).some(node=>node.props.children==='Oct')).toBe(true);
 expect(screen.queryByText('2026-10')).toBeNull();
});
it('distinguishes a lower-cost comparison with semantic positive text without recoloring the current saved price',()=>{
 render(<><AnalyticsPriceBox><AnalyticsText kind="label">Current</AnalyticsText><AnalyticsMoney value={money(10000n,'SEK')} kind="price"/></AnalyticsPriceBox><AnalyticsPriceBox positive><AnalyticsText kind="label">Alternative</AnalyticsText><AnalyticsMoney value={money(7000n,'SEK')} kind="price"/></AnalyticsPriceBox></>);
 const theme=jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json');
 expect(StyleSheet.flatten(screen.getByText('Alternative').props.style).color).toBe(getColorByTheme(theme,false,'status.positive'));
 expect(StyleSheet.flatten(screen.getByText(formatMinorUnits(7000n,'SEK',{locale:'en',display:'code'})).props.style).color).toBe(getColorByTheme(theme,false,'status.positive'));
 expect(StyleSheet.flatten(screen.getByText(formatMinorUnits(10000n,'SEK',{locale:'en',display:'code'})).props.style).color).toBe(getColorByTheme(theme,false,'ink.primary'));
});
it('draws zero booked history on the baseline and a constant positive amount as an honest flat series',()=>{
 const zero=projectNativeAnalytics([],[],now()).trend,view=render(<AnalyticsTrend months={zero}/>);const heights=()=>String(screen.UNSAFE_getByType(Polyline).props.points).split(' ').map(point=>Number(point.split(',')[1]));expect(new Set(heights())).toEqual(new Set([142]));
 view.rerender(<AnalyticsTrend months={zero.map(month=>({...month,amount:money(10000n,'SEK'),chargeCount:1}))}/>);expect(new Set(heights()).size).toBe(1);expect(heights()[0]).toBeLessThan(142);expect(screen.getByTestId('native-insights-trend').props.accessibilityLabel).toContain(formatMinorUnits(10000n,'SEK',{locale:'en',display:'code'}));
});
it('omits only a whole hero zero-fraction suffix while retaining exact accessible money and nonzero minor units',()=>{
 const view=render(<AnalyticsMoney value={money(124300n,'SEK')} kind="hero"/>);expect(screen.getByText('1 243')).toBeTruthy();expect(screen.getByLabelText(formatMinorUnits(124300n,'SEK',{locale:'en',display:'code'}))).toBeTruthy();
 view.rerender(<AnalyticsMoney value={money(12990n,'SEK')} kind="hero"/>);expect(screen.getByText('129,90')).toBeTruthy();expect(screen.getByLabelText(formatMinorUnits(12990n,'SEK',{locale:'en',display:'code'}))).toBeTruthy();
 view.rerender(<AnalyticsMoney value={money(1000n,'KWD')} kind="hero"/>);expect(screen.getByText('1')).toBeTruthy();expect(screen.getByLabelText(formatMinorUnits(1000n,'KWD',{locale:'en',display:'code'}))).toBeTruthy();
 view.rerender(<AnalyticsMoney value={money(1001n,'KWD')} kind="hero"/>);expect(screen.getByText('1,001')).toBeTruthy();
 view.rerender(<AnalyticsMoney value={money(1243n,'JPY')} kind="hero"/>);expect(screen.getByText('1 243')).toBeTruthy();
});
it('opens a comparison from its insight without using the route parameter as backend authority', async () => {
  const reader = jest.fn().mockResolvedValue(ready()), session = facade();
  render(<NativeComparisonsScreen useSession={() => session} reader={reader} now={now} initialSubscriptionId={second.id} />);
  await screen.findByText(copy.more.replace('%{period}', copy.monthly));
  expect(screen.getByRole('button', { name: second.customName }).props.accessibilityState.selected).toBe(true);
  expect(reader).toHaveBeenCalledWith('isolated-token', expect.any(AbortSignal), now());
});
it('shows truthful empty and failed-read states with retry, not static example findings', async () => {
  const reader = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ kind: 'ready', projection: projectNativeAnalytics([], null, now()) }), session = facade();
  render(<NativeInsightsScreen useSession={() => session} reader={reader} now={now} />);
  await screen.findByText(copy.unavailable); fireEvent.press(screen.getByRole('button', { name: catalogs.en.actions.retry }));
  await screen.findByText(copy.empty); expect(screen.getByText(copy.noHistory)).toBeTruthy(); expect(screen.queryByText(copy.priceRise)).toBeNull();
  expect(screen.queryByTestId('native-insights-overview')).toBeNull();expect(screen.queryByTestId('native-insights-trend')).toBeNull();expect(screen.queryByRole('button',{name:copy.compare})).toBeNull();expect(screen.getByRole('button',{name:copy.openSubscriptions})).toBeTruthy();
  expect(screen.queryByRole('button',{name:catalogs.en.actions.retry})).toBeNull();expect(screen.queryByRole('button',{name:copy.refresh})).toBeNull();
});
it('uses actual shared-plan assignments and carries the selected planned-payer scope from Home into Insights navigation',async()=>{
 const base=ready();if(base.kind!=='ready')throw Error('fixture');const household={...homeHousehold,assignments:[{...homeHousehold.assignments[0]!,memberIds:homeHousehold.members.map(member=>member.id)}]};
 render(<NativeHomeOverview session={facade()} reader={jest.fn().mockResolvedValue({kind:'ready',projection:{...base.projection,household}})} now={now}/>);await screen.findByText(household.name);
 expect(screen.getByRole('button',{name:`1 ${copy.sharedPlans}`})).toBeTruthy();fireEvent.press(screen.getByTestId(`native-home-scope-${household.members[0]!.id}`));fireEvent.press(screen.getByRole('button',{name:copy.seeInsights}));expect(mockPush).toHaveBeenLastCalledWith({pathname:'/personal-insights',params:{memberId:household.members[0]!.id}});
 fireEvent.press(screen.getByRole('button',{name:`1 ${copy.sharedPlans}`}));expect(mockPush).toHaveBeenLastCalledWith('/personal-household');
});
it('validates the Insights route member against actual membership and scopes findings and plans without creating assignments',async()=>{
 const base=ready();if(base.kind!=='ready')throw Error('fixture');const projection={...base.projection,household:homeHousehold},reader=jest.fn().mockResolvedValue({kind:'ready',projection});mockSearchParams={memberId:homeHousehold.members[1]!.id};
 const view=render(<NativeInsightsScreen useSession={()=>facade()} reader={reader} now={now}/>);await screen.findByText(copy.empty);expect(screen.queryByText(row.customName)).toBeNull();expect(screen.queryByTestId('native-insights-trend')).toBeNull();
 mockSearchParams={memberId:'unknown-member'};view.rerender(<NativeInsightsScreen useSession={()=>facade()} reader={reader} now={now}/>);await screen.findByText(copy.priceRise);expect(screen.getByTestId('native-insights-trend').props.accessibilityLabel).toContain('2026-10');expect(reader).toHaveBeenCalledTimes(1);
});
it('opens a real subscription sheet from Insights and hides it when authenticated authority retires',async()=>{
 let session=facade();const reader=jest.fn().mockResolvedValue(ready()),view=render(<NativeInsightsScreen useSession={()=>session} reader={reader} now={now}/>);await screen.findByText(copy.priceRise);fireEvent.press(screen.getAllByRole('button',{name:copy.openPlan.replace('%{name}',row.customName)})[0]!);
 await screen.findByRole('header',{name:row.customName});expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);expect(screen.getByTestId('native-insights-background',{includeHiddenElements:true}).props.accessibilityElementsHidden).toBe(true);expect(screen.queryByRole('header',{name:copy.insights})).toBeNull();
 session=facade('verification-required');view.rerender(<NativeInsightsScreen useSession={()=>session} reader={reader} now={now}/>);expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);expect(screen.queryByRole('header',{name:row.customName})).toBeNull();
});
it('closes a previous member detail and suppresses its pending focus when only the route scope changes',async()=>{
 const base=ready();if(base.kind!=='ready')throw Error('fixture');const reader=jest.fn().mockResolvedValue({kind:'ready',projection:{...base.projection,household:homeHousehold}}),session=facade(),focus=jest.spyOn(AccessibilityInfo,'setAccessibilityFocus').mockImplementation(()=>{});mockSearchParams={memberId:homeHousehold.members[0]!.id};
 const view=render(<NativeInsightsScreen useSession={()=>session} reader={reader} now={now}/>);await screen.findByText(copy.priceRise);fireEvent.press(screen.getAllByRole('button',{name:copy.openPlan.replace('%{name}',row.customName)})[0]!);await screen.findByRole('header',{name:row.customName});const previousDismiss=screen.UNSAFE_getByType(Modal).props.onDismiss;
 mockSearchParams={memberId:homeHousehold.members[1]!.id};view.rerender(<NativeInsightsScreen useSession={()=>session} reader={reader} now={now}/>);await screen.findByText(copy.empty);expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(false);expect(screen.queryByRole('header',{name:row.customName})).toBeNull();act(()=>previousDismiss());expect(focus).not.toHaveBeenCalled();
});
it('applies reference hero and compact card typography without changing exact monetary accessibility',()=>{
 render(<><AnalyticsMoney value={money(123456n,'SEK')} kind="hero" heroPeriod={copy.perMonth}/><AnalyticsText kind="summary">Narrative</AnalyticsText><AnalyticsText kind="title">Card title</AnalyticsText></>);
 const hero=screen.getByText(formatted(123456n).replace('SEK','').trim()),heroStyle=StyleSheet.flatten(hero.props.style);expect(heroStyle).toMatchObject({fontSize:64,lineHeight:57.6,letterSpacing:-2.88});expect(screen.getByLabelText(heroLabel(123456n))).toBeTruthy();expect(StyleSheet.flatten(screen.getByText('Narrative').props.style)).toMatchObject({fontSize:14.5,lineHeight:14.5*1.55});expect(StyleSheet.flatten(screen.getByText('Card title').props.style).fontSize).toBe(15.5);
});
it.each([['Insights',NativeInsightsScreen,'native-insights-scroll'],['Comparisons',NativeComparisonsScreen,'native-comparisons-scroll']] as const)('%s pulls a fresh authorized projection without a normal Refresh control',async(_name,Screen,scrollId)=>{
 const session=facade(),reader=jest.fn().mockResolvedValueOnce(ready()).mockResolvedValueOnce({kind:'ready',projection:projectNativeAnalytics([{...row,customName:'Updated owner plan'}],history,now())});
 render(<Screen useSession={()=>session} reader={reader} now={now}/>);await screen.findAllByText(row.customName);expect(screen.getByTestId(scrollId)).toBeTruthy();expect(screen.queryByRole('button',{name:copy.refresh})).toBeNull();expect(screen.queryByRole('button',{name:catalogs.en.actions.retry})).toBeNull();
 fireEvent(screen.UNSAFE_getByType(RefreshControl),'refresh');await screen.findAllByText('Updated owner plan');expect(reader).toHaveBeenCalledTimes(2);expect(reader).toHaveBeenLastCalledWith('isolated-token',expect.any(AbortSignal),now());expect(screen.queryByText(second.customName)).toBeNull();
});
