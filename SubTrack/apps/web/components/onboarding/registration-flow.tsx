'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';
import { IdentifierEntry, type IdentifierEntryValue } from './identifier-entry';
import { RegistrationApiError, startRegistration, verifyRegistration, type RegistrationIdentifier } from '@/lib/registration-api';
import styles from './registration-flow.module.css';

type Step = 'identifier' | 'otp' | 'accepted' | 'restart';

export function RegistrationFlow({ locale }: { locale: Locale }) {
  const copy = catalogs[locale].onboarding.registration;
  const [step, setStep] = useState<Step>('identifier');
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [nonce, setNonce] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState<RegistrationIdentifier | null>(null);
  const [accepted, setAccepted] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const requestPending = useRef(false);

  useEffect(() => () => {
    generation.current += 1;
    controller.current?.abort();
  }, []);

  function beginRequest(): { signal: AbortSignal; generation: number } {
    requestPending.current = true;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    generation.current += 1;
    return { signal: requestController.signal, generation: generation.current };
  }

  function isCurrent(requestGeneration: number, signal: AbortSignal): boolean {
    return generation.current === requestGeneration && !signal.aborted;
  }

  function showError(caught: unknown, requestGeneration: number, signal: AbortSignal, verification = false) {
    if (!isCurrent(requestGeneration, signal)) return;
    setBusy(false);
    requestPending.current = false;
    if (verification || (caught instanceof RegistrationApiError && caught.code === 'restart-required')) {
      setCode('');
      setNonce('');
      setChallengeId('');
      setStep('restart');
      setError(verification ? copy.unavailable : copy.restartRequired);
      return;
    }
    setError(copy.unavailable);
  }

  async function submitIdentifier(value: IdentifierEntryValue) {
    if (requestPending.current) return;
    const requestValue = { channel: value.channel === 'phone' ? 'sms' as const : 'email' as const, identifier: value.identifier };
    const request = beginRequest();
    setBusy(true);
    setError('');
    setIdentifier(requestValue);
    try {
      const result = await startRegistration(requestValue, request.signal);
      if (!isCurrent(request.generation, request.signal)) return;
      setChallengeId(result.challengeId);
      setNonce(result.nextBrowserNonce);
      setStep('otp');
      setBusy(false);
      requestPending.current = false;
    } catch (caught) {
      showError(caught, request.generation, request.signal);
    }
  }

  async function restart() {
    if (!identifier || requestPending.current) return;
    const request = beginRequest();
    setBusy(true);
    setError('');
    setCode('');
    setAccepted(false);
    try {
      const result = await startRegistration(identifier, request.signal);
      if (!isCurrent(request.generation, request.signal)) return;
      setChallengeId(result.challengeId);
      setNonce(result.nextBrowserNonce);
      setStep('otp');
      setBusy(false);
      requestPending.current = false;
    } catch (caught) {
      showError(caught, request.generation, request.signal);
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current || !/^[0-9]{6}$/.test(code)) return;
    const request = beginRequest();
    setBusy(true);
    setError('');
    setCode('');
    setNonce('');
    setChallengeId('');
    try {
      await verifyRegistration(challengeId, code, nonce, request.signal);
      if (!isCurrent(request.generation, request.signal)) return;
      setNonce('');
      setChallengeId('');
      setIdentifier(null);
      setCode('');
      setAccepted(true);
      setBusy(false);
      requestPending.current = false;
      setStep('accepted');
    } catch (caught) {
      showError(caught, request.generation, request.signal, true);
    }
  }

  function goBack() {
    generation.current += 1;
    controller.current?.abort();
    requestPending.current = false;
    setBusy(false);
    setCode('');
    setNonce('');
    setChallengeId('');
    setAccepted(false);
    setIdentifier(null);
    setError('');
    setStep('identifier');
  }

  return (
    <main className={styles.frame} lang={locale} aria-busy={busy}>
      <section className={styles.panel} aria-labelledby="registration-title">
        <h1 id="registration-title">{copy.title}</h1>
        <p>{copy.introduction}</p>
        {step === 'identifier' ? <IdentifierEntry locale={locale} onContinue={submitIdentifier} /> : null}
        {step === 'otp' ? (
          <form className={styles.form} onSubmit={submitOtp}>
            <label htmlFor="registration-otp">{copy.otpLabel}</label>
            <input
              id="registration-otp"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 6))}
              aria-describedby={error ? 'registration-error' : undefined}
              aria-invalid={Boolean(error)}
            />
            <Button type="submit" disabled={busy || code.length !== 6}>{busy ? copy.loading : copy.verifyLabel}</Button>
          </form>
        ) : null}
        {step === 'restart' ? <Button type="button" disabled={busy} onClick={restart}>{busy ? copy.loading : copy.restartRequired}</Button> : null}
        {step === 'accepted' && accepted ? <p role="status">{copy.acceptedMessage} {copy.bankIdRequired}</p> : null}
        {error ? <p id="registration-error" role="alert">{error}</p> : null}
        <div className={styles.actions}>
          {step !== 'identifier' ? <Button variant="secondary" type="button" onClick={goBack}>{copy.backLabel}</Button> : null}
          {step === 'identifier' ? <p className={styles.unavailable}>{copy.loginUnavailable}</p> : null}
        </div>
      </section>
    </main>
  );
}
