import type { SandboxMobileApi } from './sandboxMobileApi';
import { selectBillingMonth, type BillingMonth } from './privateMobileBillingMonth';
import { selectNativeRenewals } from './privateMobileRenewals';
import type { PrivateOwnerSubscriptionView } from '../../../../packages/contracts/generated/types.gen';

export function createSandboxProjections(api: Pick<SandboxMobileApi, 'readNativeProfile' | 'readNativeMode' | 'readNativeSubscriptions'>) {
  async function rows(token: string, signal: AbortSignal) {
    if (signal.aborted) throw new Error('Sandbox projection unavailable');
    const profile = await api.readNativeProfile(token, signal), mode = await api.readNativeMode(token, signal);
    if (signal.aborted) throw new Error('Sandbox projection unavailable');
    if (!profile.profileComplete || mode.mode !== 'just-me') return null;
    const collected: PrivateOwnerSubscriptionView[] = [], ids = new Set<string>(), cursors = new Set<string>(); let cursor: string | undefined;
    // Every continuing page must add a row; the 50-row ceiling bounds this loop.
    for (;;) {
      if (signal.aborted) throw new Error('Sandbox projection unavailable');
      const page = await api.readNativeSubscriptions(token, signal, cursor);
      if (signal.aborted) throw new Error('Sandbox projection unavailable');
      for (const row of page.items) {
        if (ids.has(row.id) || row.currency !== 'SEK' || !row.alwaysPrivate || collected.length >= 50) throw new Error('Sandbox projection unavailable');
        ids.add(row.id); collected.push(row);
      }
      if (page.nextCursor === null) return collected;
      if (cursors.has(page.nextCursor) || page.items.length === 0) throw new Error('Sandbox projection unavailable');
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
  }
  return Object.freeze({
    async readBillingMonth(token: string, signal: AbortSignal, month: BillingMonth) { const values = await rows(token, signal); return values === null ? { kind: 'setup-required' as const } : { kind: 'ready' as const, projection: selectBillingMonth(values, month) }; },
    async readNativeRenewals(token: string, signal: AbortSignal, now: Date) { const values = await rows(token, signal); return values === null ? { kind: 'setup-required' as const } : { kind: 'ready' as const, groups: selectNativeRenewals(values, now) }; },
  });
}
