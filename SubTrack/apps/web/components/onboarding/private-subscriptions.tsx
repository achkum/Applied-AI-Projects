'use client';

import type { SubscriptionLifecycleTarget, PrivateOwnerSubscriptionView } from '@subtrack/contracts';
import { catalogs, type Locale } from '@subtrack/i18n';
import { Button, formatMinorUnits } from '@subtrack/ui';
import styles from './private-subscriptions.module.css';

const targets: Record<string, SubscriptionLifecycleTarget[]> = {
  ACTIVE: ['PAUSED', 'CANCELLED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
};

function label(view: PrivateOwnerSubscriptionView, fallback: string) {
  return view.customName || view.merchantName || fallback;
}
function amount(view: PrivateOwnerSubscriptionView, locale: Locale) {
  return formatMinorUnits(BigInt(view.expectedAmountMinor), view.currency, { locale, display: 'code' });
}

export function PrivateSubscriptions({ locale, items, nextCursor, selected, busy, confirmed, onMore, onSelect, onBack, onTransition, onAdd, manualConfirmed = false }: {
  locale: Locale;
  items: PrivateOwnerSubscriptionView[];
  nextCursor: string | null;
  selected: PrivateOwnerSubscriptionView | null;
  busy: boolean;
  confirmed: boolean;
  onAdd: () => void;
  manualConfirmed?: boolean;
  onMore: () => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onTransition: (status: SubscriptionLifecycleTarget) => void;
}) {
  const manual = catalogs[locale].onboarding.manualSubscription;
  const copy = catalogs[locale].onboarding.ownerSubscriptions;
  const category = (code: string) => Object.hasOwn(copy.category, code)
    ? copy.category[code as keyof typeof copy.category] : copy.categoryFallback;
  if (selected) return <section className={styles.root} aria-labelledby="owner-detail-title">
    <h2 id="owner-detail-title" data-step-focus tabIndex={-1}>{copy.detail}</h2>
    <h3>{label(selected, copy.categoryFallback)}</h3>
    <p>{category(selected.categoryCode)}</p>
    <p>{copy.status[selected.status]} · {copy.cadence[selected.cadence]}</p>
    <p>{selected.source === 'MANUAL' ? manual.sourceManual : manual.sourceDetected}</p>
    <p>{manual.expectedAmount}: {amount(selected, locale)}</p>
    {selected.nextChargeDate ? <p>{manual.expectedDate}: {selected.nextChargeDate}</p> : null}
    {manualConfirmed ? <p role="status">{manual.confirmed}</p> : null}
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
    <div data-manual-add><Button type="button" variant="secondary" disabled={busy} onClick={onAdd}>{manual.title}</Button></div>
    <ul className={styles.list}>{items.map((item) => <li key={item.id}>
      <button className={styles.row} type="button" disabled={busy} onClick={() => onSelect(item.id)}
        aria-label={`${label(item, copy.categoryFallback)}, ${copy.status[item.status]}, ${amount(item, locale)}`}>
        <strong>{label(item, copy.categoryFallback)}</strong>
        <span>{category(item.categoryCode)}</span>
        <span>{copy.status[item.status]} · {copy.cadence[item.cadence]}</span>
        <span>{item.source === 'MANUAL' ? manual.sourceManual : manual.sourceDetected}</span>
        <span>{manual.expectedAmount}: {amount(item, locale)}</span>
      </button>
    </li>)}</ul>
    {nextCursor ? <Button type="button" disabled={busy} onClick={onMore}>{copy.loadMore}</Button> : null}
  </section>;
}
