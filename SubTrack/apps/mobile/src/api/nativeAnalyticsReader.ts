import type { NativePersonalApi } from '@/components/onboarding/NativePersonalScreen';
import { readAllOwnerSubscriptions } from './privateMobileSubscriptionList';
import { projectNativeAnalytics, type AnalyticsCharge, type ComparisonPlan, type NativeAnalytics } from './nativeAnalyticsProjection';
import { parseSandboxHouseholdView, type SandboxHouseholdView } from '@subtrack/contracts/sandbox-household';

export type NativeAnalyticsView = NativeAnalytics & Readonly<{ profile?: Readonly<{ displayName: string | null; avatarEmoji: string | null }>; household?: NonNullable<SandboxHouseholdView['household']> }>;
export type NativeAnalyticsRead = Readonly<{ kind: 'ready'; projection: NativeAnalyticsView } | { kind: 'setup-required' }>;
export type NativeAnalyticsReader = (token: string, signal: AbortSignal, now: Date) => Promise<NativeAnalyticsRead>;
export function createNativeAnalyticsReader(api: Pick<NativePersonalApi, 'readNativeProfile' | 'readNativeMode' | 'readNativeSubscriptions'>,
  options: { history?: (token: string, signal: AbortSignal) => Promise<{ items: readonly AnalyticsCharge[]; nextCursor: null }>; catalogue?: readonly ComparisonPlan[]; household?: (token: string, signal: AbortSignal) => Promise<SandboxHouseholdView> } = {}): NativeAnalyticsReader {
  return async (token, signal, now) => {
    if (signal.aborted) throw new Error('Analytics unavailable');
    const profile = await api.readNativeProfile(token, signal), mode = await api.readNativeMode(token, signal);
    if (signal.aborted) throw new Error('Analytics unavailable');
    if (!profile.profileComplete || mode.mode !== 'just-me') return { kind: 'setup-required' };
    const page = await readAllOwnerSubscriptions(cursor => api.readNativeSubscriptions(token, signal, cursor), signal);
    const history = options.history ? await options.history(token, signal) : null;
    const household = options.household ? parseSandboxHouseholdView(await options.household(token, signal)).household : null;
    if (signal.aborted || history && history.nextCursor !== null) throw new Error('Analytics unavailable');
    return { kind: 'ready', projection: { ...projectNativeAnalytics(page.items, history?.items ?? null, now, options.catalogue, (history?.items.length ?? 0) >= 400), profile: { displayName: profile.displayName, avatarEmoji: profile.avatarEmoji }, ...(household ? { household } : {}) } };
  };
}
