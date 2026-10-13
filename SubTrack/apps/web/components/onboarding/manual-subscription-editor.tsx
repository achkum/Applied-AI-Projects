'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, parsePositiveSekInput, formatPositiveSekInputMinor, formatMinorUnits } from '@subtrack/ui';
import type { PrivateOwnerSubscriptionView } from '@subtrack/contracts';
import { catalogs, type Locale } from '@subtrack/i18n';
import { parsePrivateManualCreate } from '@subtrack/contracts/private-onboarding';
import type { ManualSubscriptionBody } from '@/lib/manual-subscription-api';
import styles from './manual-subscription-editor.module.css';

export type ManualState = 'draft' | 'saving' | 'checking' | 'uncertain' | 'reading' | 'read-error' | 'receipt-conflict' | 'invalid' | 'conflict' | 'gone';
const fields = ['name', 'category', 'cadence', 'amount', 'date'] as const;
type Field = typeof fields[number];
const cadences = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;

export function ManualSubscriptionEditor({ locale, state, onSave, onCheck, onRead, onCancel, onReconcile, initial, conflictView, onReview, onStop }: {
  locale: Locale; state: ManualState; onSave: (body: ManualSubscriptionBody) => void;
  onCheck: () => void; onRead: () => void; onCancel: () => void; onReconcile: () => void;
  initial?: PrivateOwnerSubscriptionView; conflictView?: PrivateOwnerSubscriptionView | null; onReview?: () => void;
  onStop?: () => void;
}) {
  const copy = catalogs[locale].onboarding.manualSubscription;
  const ownerCopy = catalogs[locale].onboarding.ownerSubscriptions;
  const editCopy = catalogs[locale].onboarding.manualEdit;
  const nonpositiveInitial = initial?.expectedAmountMinor === '0' || initial?.expectedAmountMinor.startsWith('-');
  const [draft, setDraft] = useState(() => ({ name: initial?.customName ?? '', category: initial?.categoryCode ?? '',
    cadence: initial?.cadence ?? 'MONTHLY', amount: initial && !nonpositiveInitial
      ? formatPositiveSekInputMinor(BigInt(initial.expectedAmountMinor), locale) : '', date: initial?.nextChargeDate ?? '' }));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>(() => nonpositiveInitial ? { amount: copy.invalidAmount } : {});
  const [editedAfterRejection, setEditedAfterRejection] = useState(false);
  const rejectedDraft = useRef<typeof draft | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const editable = state === 'draft' || state === 'invalid';
  const busy = ['saving', 'checking', 'reading'].includes(state);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (state !== 'draft') status.current?.focus(); else if (initial) heading.current?.focus(); }, [state, initial]);
  useEffect(() => { if (state === 'invalid') { rejectedDraft.current = { ...draft }; setEditedAfterRejection(false); } }, [state]);
  function update(field: Field, value: string) {
    if (!editable) return;
    if (state === 'invalid' && rejectedDraft.current) {
      const nextDraft = { ...draft, [field]: value };
      setEditedAfterRejection(fields.some(key => nextDraft[key] !== rejectedDraft.current?.[key]));
    }
    setDraft(prior => ({ ...prior, [field]: value })); setErrors(prior => ({ ...prior, [field]: undefined }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editable || state === 'invalid' && !editedAfterRejection) return;
    const invalid: Partial<Record<Field, string>> = {};
    const name = draft.name.trim();
    if (!name || name.length > 120 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)) invalid.name = copy.invalidName;
    if (!Object.hasOwn(ownerCopy.category, draft.category)) invalid.category = copy.invalidCategory;
    if (!(cadences as readonly string[]).includes(draft.cadence)) invalid.cadence = copy.invalidCadence;
    let amount = '';
    try { amount = parsePositiveSekInput(draft.amount, locale).toString(); } catch { invalid.amount = copy.invalidAmount; }
    const date = draft.date || null;
    if (date && (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || date.startsWith('0000') ||
        Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date))
      invalid.date = copy.invalidDate;
    setErrors(invalid);
    const first = fields.find(field => invalid[field]);
    if (first) { form.current?.querySelector<HTMLElement>(`#manual-${first}`)?.focus(); return; }
    onSave(parsePrivateManualCreate({ customName: name, categoryCode: draft.category, cadence: draft.cadence,
      expectedAmountMinor: amount, nextChargeDate: date }));
  }
  const messages: Partial<Record<ManualState, string>> = { saving: copy.saving, checking: copy.checking,
    uncertain: copy.uncertain, reading: copy.reading, 'read-error': copy.readError, 'receipt-conflict': copy.receiptConflict, invalid: copy.invalid };
  return <section className={styles.root} aria-labelledby="manual-title">
    <h2 ref={heading} id="manual-title" tabIndex={-1} data-step-focus>{initial ? editCopy.title : copy.title}</h2>
    <p>{initial ? editCopy.introduction : copy.introduction}</p>
    {nonpositiveInitial ? <p>{editCopy.positiveRequired}</p> : null}
    <form ref={form} className={styles.form} onSubmit={submit} noValidate>
      {fields.map(field => <div className={styles.field} key={field}>
        <label htmlFor={`manual-${field}`}>{copy[field]}</label>
        {field === 'category' || field === 'cadence' ? <select id={`manual-${field}`} value={draft[field]} disabled={!editable}
          onChange={event => update(field, event.currentTarget.value)} aria-invalid={!!errors[field]}
          aria-describedby={errors[field] ? `manual-${field}-error` : undefined}>
          {field === 'category' ? <><option value="">{copy.placeholder}</option>{Object.entries(ownerCopy.category).map(([code, text]) =>
            <option key={code} value={code}>{text}</option>)}</> : cadences.map(code => <option key={code} value={code}>{ownerCopy.cadence[code]}</option>)}
        </select> : <input id={`manual-${field}`} value={draft[field]} disabled={!editable} autoComplete="off"
          inputMode={field === 'amount' ? 'decimal' : undefined} onChange={event => update(field, event.currentTarget.value)}
          aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `manual-${field}-error` : undefined} />}
        {errors[field] ? <p id={`manual-${field}-error`} role="alert">{errors[field]}</p> : null}
      </div>)}
      <div className={styles.actions}>
        {editable ? <Button type="submit" variant="secondary" disabled={state === 'invalid' && !editedAfterRejection}>{initial ? editCopy.save : copy.save}</Button> : null}
        {editable ? <Button type="button" variant="secondary" onClick={onCancel}>{initial ? editCopy.cancel : copy.cancel}</Button> : null}
        {state === 'uncertain' ? <Button type="button" variant="secondary" onClick={onCheck}>{copy.check}</Button> : null}
        {state === 'read-error' ? <Button type="button" variant="secondary" onClick={onRead}>{copy.retryRead}</Button> : null}
        {state === 'receipt-conflict' ? <Button type="button" variant="secondary" onClick={onReconcile}>{copy.reconcile}</Button> : null}
        {state === 'conflict' && conflictView ? <Button type="button" variant="secondary" onClick={onReview}>{editCopy.review}</Button> : null}
        {state === 'gone' ? <Button type="button" variant="secondary" onClick={onReconcile}>{copy.reconcile}</Button> : null}
        {initial && onStop ? <Button type="button" variant="secondary" onClick={onStop}>{editCopy.stop}</Button> : null}
      </div>
    </form>
    {state === 'conflict' || state === 'gone' ? <p ref={status} tabIndex={-1} role="alert">{state === 'conflict' ? editCopy.conflict : editCopy.gone}</p> :
      messages[state] ? <p ref={status} tabIndex={-1} role={busy ? 'status' : 'alert'}>{messages[state]}</p> : null}
    {state === 'conflict' && conflictView ? <section aria-label={editCopy.current}><h3>{editCopy.current}</h3>
      <p>{conflictView.customName}</p><p>{ownerCopy.category[conflictView.categoryCode as keyof typeof ownerCopy.category]}</p>
      <p>{ownerCopy.cadence[conflictView.cadence]} · {ownerCopy.status[conflictView.status]}</p>
      <p>{formatMinorUnits(BigInt(conflictView.expectedAmountMinor), conflictView.currency, { locale, display: 'code' })} · {conflictView.nextChargeDate ?? copy.placeholder}</p></section> : null}
  </section>;
}
