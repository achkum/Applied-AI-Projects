export type BillingPeriod = 'monthly' | 'annual';

export interface RollingNumberProps {
  /** Integer minor-unit amount (öre/cents), or null while loading/unavailable. */
  amountMinorUnits: number | null;
  currencyCode: string;
  period: BillingPeriod;
  onPeriodChange: (period: BillingPeriod) => void;
  /** True when the amount fetch failed rather than being merely absent. */
  isUnavailable?: boolean;
}

export type ScopeKind = 'me' | 'household' | 'member';

export interface ScopeOption {
  kind: ScopeKind;
  /** Stable, opaque identifier. Required (and used for accent selection) when kind === 'member'. */
  memberId?: string;
  /** Display name for a member scope; ignored for 'me' / 'household'. */
  displayName?: string;
}

export interface ScopeSwitcherProps {
  options: ScopeOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export interface PriceHistoryPoint {
  /** Integer minor-unit amount (öre/cents) at this point. */
  amountMinorUnits: number;
  /** ISO 8601 date string. */
  date: string;
}

export interface ReceiptCardProps {
  subscriptionName: string;
  categoryCode: string;
  currentPriceMinorUnits: number | null;
  currencyCode: string;
  cadence: BillingPeriod;
  priceHistory: PriceHistoryPoint[];
  isUnavailable?: boolean;
}
