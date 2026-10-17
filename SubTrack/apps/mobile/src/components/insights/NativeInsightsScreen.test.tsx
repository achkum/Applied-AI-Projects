import React from 'react';
import { Text } from 'react-native';
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
const mockFocus: { cleanup?: void | (() => void) } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useFocusEffect: (callback: () => void | (() => void)) => {
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
function expectHero(minor: bigint) { expect(screen.getByLabelText(heroLabel(minor))).toBeTruthy(); expect(screen.getByText(formatted(minor).replace('SEK', '').trim())).toBeTruthy(); }
beforeEach(() => { jest.clearAllMocks(); mockFocus.cleanup = undefined; });
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
  expect(screen.getByLabelText(`2026-10, ${formatMinorUnits(12000n, 'SEK', { locale: 'en', display: 'code' })}, ${copy.charges.replace('%{count}', '1')}`)).toBeTruthy();
  const overview = screen.getByRole('button', { name: `${copy.overview}. ${copy.activePlans.replace('%{count}', '2')}. ${copy.findings.replace('%{count}', '2')}` });
  expect(overview.props.accessibilityState.expanded).toBe(false); fireEvent.press(overview);
  expect(screen.getByText(copy.method)).toBeTruthy(); expect(overview.props.accessibilityState.expanded).toBe(true);
  fireEvent.press(screen.getAllByRole('button', { name: copy.compare })[0]!); expect(mockPush).toHaveBeenCalledWith({ pathname: '/personal-comparisons', params: { subscriptionId: row.id } });
  expect(screen.queryByText(/\/100/)).toBeNull(); expect(screen.queryByText('Me')).toBeNull();
});
it('keeps signed-out screens free of private rows and avoids all backend access', () => {
  const reader = jest.fn(), session = facade('verification-required');
  render(<NativeInsightsScreen useSession={() => session} reader={reader} inactiveContent={<Text>Sign in</Text>} />);
  expect(screen.getByText('Sign in')).toBeTruthy(); expect(screen.queryByText(row.customName)).toBeNull(); expect(reader).not.toHaveBeenCalled();
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
it('shows actionable Home empty state and real Insights/Household navigation without fake totals', async () => {
  const session = facade(), reader = jest.fn().mockResolvedValue({ kind: 'ready', projection: projectNativeAnalytics([], [], now()) });
  render(<NativeHomeOverview session={session} reader={reader} now={now} />);
  await screen.findByText(copy.empty); expect(screen.queryByText(formatted(0n))).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: copy.connectBank })); expect(mockPush).toHaveBeenLastCalledWith('/personal-bank');
  fireEvent.press(screen.getByRole('button', { name: copy.seeInsights })); expect(mockPush).toHaveBeenLastCalledWith('/personal-insights');
  fireEvent.press(screen.getByRole('button', { name: copy.household })); expect(mockPush).toHaveBeenLastCalledWith('/personal-household');
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
  expect(screen.getAllByText(formatted(17000n)).length).toBeGreaterThan(0);
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
  await screen.findByText(copy.unavailable); fireEvent.press(screen.getByRole('button', { name: copy.refresh }));
  await screen.findByText(copy.empty); expect(screen.getByText(copy.noHistory)).toBeTruthy(); expect(screen.queryByText(copy.priceRise)).toBeNull();
});
