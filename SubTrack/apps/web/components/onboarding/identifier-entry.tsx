'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';
import { normalizeIdentifier, type IdentifierChannel, type IdentifierValidationCode } from '@/lib/onboarding-identifier';
import styles from './identifier-entry.module.css';

export interface IdentifierEntryValue {
  channel: IdentifierChannel;
  identifier: string;
}
interface IdentifierEntryProps { locale: Locale; onContinue: (value: IdentifierEntryValue) => void; }

export function IdentifierEntry({ locale, onContinue }: IdentifierEntryProps) {
  const copy = catalogs[locale].onboarding.identifier;
  const inputId = useId();
  const errorId = useId();
  const [channel, setChannel] = useState<IdentifierChannel>('email');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const result = normalizeIdentifier(channel, value);
  const errorCode: IdentifierValidationCode | undefined = !result.valid ? result.code : undefined;
  const showError = Boolean(errorCode && (touched || submitAttempted));

  function changeChannel(next: IdentifierChannel) {
    if (next === channel) return;
    setChannel(next);
    setValue('');
    setTouched(false);
    setSubmitAttempted(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    const current = normalizeIdentifier(channel, value);
    if (current.valid) onContinue({ channel: current.channel, identifier: current.identifier });
  }

  const errorMessage = errorCode ? copy.errors[errorCode] : undefined;
  return (
    <section className={styles.root}>
      <div className={styles.channels} role="group" aria-label={copy.channelLabel}>
        <button type="button" aria-pressed={channel === 'email'} onClick={() => changeChannel('email')}>{copy.emailChannel}</button>
        <button type="button" aria-pressed={channel === 'phone'} onClick={() => changeChannel('phone')}>{copy.phoneChannel}</button>
      </div>
      <form className={styles.form} noValidate onSubmit={submit}>
        <label htmlFor={inputId}>{channel === 'email' ? copy.emailLabel : copy.phoneLabel}</label>
        <input
          id={inputId}
          type={channel === 'email' ? 'email' : 'tel'}
          autoComplete={channel === 'email' ? 'email' : 'tel'}
          inputMode={channel === 'email' ? 'email' : 'tel'}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError ? 'true' : undefined}
          aria-describedby={showError ? errorId : undefined}
        />
        {showError && errorMessage ? <p className={styles.error} id={errorId}>{errorMessage}</p> : null}
        <Button variant="secondary" type="submit" disabled={!result.valid}>{copy.continueLabel}</Button>
      </form>
    </section>
  );
}
