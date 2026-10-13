'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, parsePositiveSekInput } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';
import { parsePrivateManualCreate } from '@subtrack/contracts/private-onboarding';
import type { ManualSubscriptionBody } from '@/lib/manual-subscription-api';
import styles from './manual-subscription-editor.module.css';

export type ManualState = 'draft' | 'saving' | 'checking' | 'uncertain' | 'reading' | 'read-error' | 'receipt-conflict' | 'invalid';
const fields = ['name', 'category', 'cadence', 'amount', 'date'] as const;
type Field = typeof fields[number];
const cadences = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;

export function ManualSubscriptionEditor({ locale, state, onSave, onCheck, onRead, onCancel, onReconcile }: {
  locale: Locale; state: ManualState; onSave: (body: ManualSubscriptionBody) => void;
  onCheck: () => void; onRead: () => void; onCancel: () => void; onReconcile: () => void;
}) {
  const copy = catalogs[locale].onboarding.manualSubscription;
  const ownerCopy = catalogs[locale].onboarding.ownerSubscriptions;
  const [draft, setDraft] = useState({ name: '', category: '', cadence: 'MONTHLY', amount: '', date: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [editedAfterRejection, setEditedAfterRejection] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const editable = state === 'draft' || state === 'invalid';
  const busy = ['saving', 'checking', 'reading'].includes(state);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (state !== 'draft') status.current?.focus(); }, [state]);
  useEffect(() => { if (state === 'invalid') setEditedAfterRejection(false); }, [state]);
  function update(field: Field, value: string) {
    if (!editable) return;
    if (state === 'invalid' && value !== draft[field]) setEditedAfterRejection(true);
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
    <h2 ref={heading} id="manual-title" tabIndex={-1} data-step-focus>{copy.title}</h2>
    <p>{copy.introduction}</p>
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
        {editable ? <Button type="submit" variant="secondary" disabled={state === 'invalid' && !editedAfterRejection}>{copy.save}</Button> : null}
        {editable ? <Button type="button" variant="secondary" onClick={onCancel}>{copy.cancel}</Button> : null}
        {state === 'uncertain' ? <Button type="button" variant="secondary" onClick={onCheck}>{copy.check}</Button> : null}
        {state === 'read-error' ? <Button type="button" variant="secondary" onClick={onRead}>{copy.retryRead}</Button> : null}
        {state === 'receipt-conflict' ? <Button type="button" variant="secondary" onClick={onReconcile}>{copy.reconcile}</Button> : null}
      </div>
    </form>
    {messages[state] ? <p ref={status} tabIndex={-1} role={busy ? 'status' : 'alert'}>{messages[state]}</p> : null}
  </section>;
}
