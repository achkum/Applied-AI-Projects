'use client';

import type { SubscriptionLifecycleTarget, SubscriptionOwnerView } from '@subtrack/contracts';
import { catalogs, type Locale } from '@subtrack/i18n';
import { Button, formatMinorUnits } from '@subtrack/ui';
import styles from './private-subscriptions.module.css';

const targets: Record<string, SubscriptionLifecycleTarget[]> = {
  ACTIVE: ['PAUSED', 'CANCELLED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
};

function label(view: SubscriptionOwnerView, fallback: string) {
  return view.customName || view.merchantName || fallback;
}
function amount(view: SubscriptionOwnerView, locale: Locale) {
  return formatMinorUnits(BigInt(view.expectedAmountMinor), view.currency, { locale, display: 'code' });
}

export function PrivateSubscriptions({ locale, items, nextCursor, selected, busy, confirmed, onMore, onSelect, onBack, onTransition }: {
  locale: Locale;
  items: SubscriptionOwnerView[];
  nextCursor: string | null;
  selected: SubscriptionOwnerView | null;
  busy: boolean;
  confirmed: boolean;
  onMore: () => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onTransition: (status: SubscriptionLifecycleTarget) => void;
}) {
  const copy = catalogs[locale].onboarding.ownerSubscriptions;
  const category = (code: string) => Object.hasOwn(copy.category, code)
    ? copy.category[code as keyof typeof copy.category] : copy.categoryFallback;
  if (selected) return <section className={styles.root} aria-labelledby="owner-detail-title">
    <h2 id="owner-detail-title" data-step-focus tabIndex={-1}>{copy.detail}</h2>
    <h3>{label(selected, copy.categoryFallback)}</h3>
    <p>{category(selected.categoryCode)}</p>
    <p>{copy.status[selected.status]} · {copy.cadence[selected.cadence]}</p>
    <p>{amount(selected, locale)}</p>
    {confirmed ? <p role="status">{copy.confirmed}</p> : null}
    <div className={styles.actions}>
      {(targets[selected.status] ?? []).map((target) =>
        <Button key={target} type="button" disabled={busy} onClick={() => onTransition(target)}>{copy.actions[target]}</Button>)}
      <Button type="button" variant="secondary" disabled={busy} onClick={onBack}>{copy.back}</Button>
    </div>
  </section>;

  return <section className={styles.root} aria-labelledby="owner-list-title">
    <h2 id="owner-list-title" data-step-focus tabIndex={-1}>{copy.title}</h2>
    {items.length === 0 && !busy ? <p role="status">{copy.empty}</p> : null}
    <ul className={styles.list}>{items.map((item) => <li key={item.id}>
      <button className={styles.row} type="button" disabled={busy} onClick={() => onSelect(item.id)}
        aria-label={`${label(item, copy.categoryFallback)}, ${copy.status[item.status]}, ${amount(item, locale)}`}>
        <strong>{label(item, copy.categoryFallback)}</strong>
        <span>{category(item.categoryCode)}</span>
        <span>{copy.status[item.status]} · {copy.cadence[item.cadence]}</span>
        <span>{amount(item, locale)}</span>
      </button>
    </li>)}</ul>
    {nextCursor ? <Button type="button" disabled={busy} onClick={onMore}>{copy.loadMore}</Button> : null}
  </section>;
}
