'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';
import type { ProfilePatch, ProfileView } from '@subtrack/contracts';
import { IdentifierEntry, type IdentifierEntryValue } from './identifier-entry';
import { ProfileEditor } from './profile-editor';
import { RegistrationApiError, startRegistration, verifyRegistration, admitPendingRegistration, verifySimulatorRegistration, completeRegistration, type RegistrationIdentifier } from '@/lib/registration-api';
import { readProfile, patchProfile, ProfileApiError } from '@/lib/profile-api';
import styles from './registration-flow.module.css';

type Step = 'identifier' | 'otp' | 'pending-admission' | 'simulator-verification' | 'terminal-completion' |
  'profile-loading' | 'profile-editing' | 'profile-saving' | 'profile-confirming' | 'profile-saved' |
  'restart-required' | 'verified-login-required' | 'unavailable';

export function RegistrationFlow({ locale }: { locale: Locale }) {
  const copy = catalogs[locale].onboarding.registration;
  const [step, setStep] = useState<Step>('identifier');
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [nonce, setNonce] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState<RegistrationIdentifier | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const requestPending = useRef(false);
  const continuation = useRef('');
  const rotatedNonce = useRef('');
  const csrf = useRef('');

  useEffect(() => {
    if (performance.getEntriesByType('navigation').some((entry) => (entry as PerformanceNavigationTiming).type === 'reload')) {
      setStep('verified-login-required');
    }
    return () => { generation.current += 1; controller.current?.abort(); clearPrivate(); };
  }, []);

  function clearPrivate() { continuation.current = ''; rotatedNonce.current = ''; csrf.current = ''; }
  function beginRequest() {
    requestPending.current = true;
    controller.current?.abort();
    controller.current = new AbortController();
    generation.current += 1;
    setBusy(true);
    return { signal: controller.current.signal, generation: generation.current };
  }
  function current(request: { signal: AbortSignal; generation: number }) {
    return generation.current === request.generation && !request.signal.aborted;
  }
  function finish() { requestPending.current = false; setBusy(false); }
  function stop(next: Step, message = '') {
    clearPrivate(); setChallengeId(''); setNonce(''); setCode(''); setProfile(null);
    setStep(next); setError(message); finish();
  }
  function fail(caught: unknown, request: { signal: AbortSignal; generation: number }, terminal = false) {
    if (!current(request)) return;
    if (terminal || caught instanceof RegistrationApiError && caught.code === 'login-required' ||
        caught instanceof ProfileApiError && caught.code === 'login-required') stop('verified-login-required');
    else if (caught instanceof RegistrationApiError && caught.code === 'restart-required') stop('restart-required', copy.restartRequired);
    else stop('unavailable', copy.unavailable);
  }

  async function submitIdentifier(value: IdentifierEntryValue) {
    if (requestPending.current) return;
    const requestValue = { channel: value.channel === 'phone' ? 'sms' as const : 'email' as const, identifier: value.identifier };
    const request = beginRequest(); setError(''); setIdentifier(requestValue);
    try {
      const result = await startRegistration(requestValue, request.signal);
      if (!current(request)) return;
      setChallengeId(result.challengeId); setNonce(result.nextBrowserNonce); setStep('otp'); finish();
    } catch (caught) { fail(caught, request); }
  }
  async function restart() {
    if (!identifier || requestPending.current) return;
    const request = beginRequest(); setError(''); setCode('');
    try {
      const result = await startRegistration(identifier, request.signal);
      if (!current(request)) return;
      setChallengeId(result.challengeId); setNonce(result.nextBrowserNonce); setStep('otp'); finish();
    } catch (caught) { fail(caught, request); }
  }
  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current || !/^[0-9]{6}$/.test(code)) return;
    const request = beginRequest();
    const sentCode = code; const sentNonce = nonce; const sentChallenge = challengeId;
    setCode(''); setNonce(''); setChallengeId(''); setError('');
    try {
      const verified = await verifyRegistration(sentChallenge, sentCode, sentNonce, request.signal);
      if (!current(request)) return;
      setStep('pending-admission');
      const pending = await admitPendingRegistration(verified.proof, verified.nextBrowserNonce, request.signal);
      if (!current(request)) return;
      continuation.current = pending.continuation; rotatedNonce.current = pending.nextBrowserNonce;
      setStep('simulator-verification'); finish();
    } catch (caught) { fail(caught, request); }
  }
  async function runSimulator() {
    if (requestPending.current || !continuation.current || !rotatedNonce.current) return;
    const request = beginRequest(); setError('');
    const sentContinuation = continuation.current; const sentNonce = rotatedNonce.current;
    continuation.current = ''; rotatedNonce.current = '';
    try {
      const verified = await verifySimulatorRegistration(sentContinuation, sentNonce, request.signal);
      if (!current(request)) return;
      setStep('terminal-completion');
      const completed = await completeRegistration(verified.verifiedEnrollment, verified.nextBrowserNonce, request.signal);
      if (!current(request)) return;
      csrf.current = completed.csrfToken;
      setStep('profile-loading');
      const persisted = await readProfile(csrf.current, request.signal);
      if (!current(request)) return;
      setProfile(persisted); setStep('profile-editing'); finish();
    } catch (caught) { fail(caught, request, true); }
  }
  async function saveProfile(patch: ProfilePatch) {
    if (requestPending.current || !csrf.current) return;
    const request = beginRequest(); setStep('profile-saving'); setUncertain(false);
    try {
      await patchProfile(patch, csrf.current, request.signal);
      if (!current(request)) return;
      setStep('profile-confirming');
      const persisted = await readProfile(csrf.current, request.signal);
      if (!current(request)) return;
      setProfile(persisted); setStep('profile-saved'); finish();
    } catch (caught) {
      if (!current(request)) return;
      if (caught instanceof ProfileApiError && caught.code === 'login-required') { stop('verified-login-required'); return; }
      try {
        const persisted = await readProfile(csrf.current, request.signal);
        if (!current(request)) return;
        setProfile(persisted); setUncertain(true); setStep('profile-editing'); finish();
      } catch { if (current(request)) stop('verified-login-required'); }
    }
  }
  function goBack() {
    generation.current += 1; controller.current?.abort(); clearPrivate(); requestPending.current = false;
    setBusy(false); setCode(''); setNonce(''); setChallengeId(''); setProfile(null); setError('');
    setIdentifier(null); setUncertain(false);
    setStep(step === 'otp' || step === 'restart-required' ? 'identifier' : 'verified-login-required');
  }

  return <main className={styles.frame} lang={locale} aria-busy={busy}>
    <section className={styles.panel} aria-labelledby="registration-title">
      <h1 id="registration-title">{copy.title}</h1>
      {step === 'identifier' ? <><p>{copy.introduction}</p><IdentifierEntry locale={locale} onContinue={submitIdentifier} /></> : null}
      {step === 'otp' ? <form className={styles.form} onSubmit={submitOtp}>
        <label htmlFor="registration-otp">{copy.otpLabel}</label>
        <input id="registration-otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
          value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 6))} />
        <Button type="submit" disabled={busy || code.length !== 6}>{busy ? copy.loading : copy.verifyLabel}</Button>
      </form> : null}
      {step === 'simulator-verification' ? <section aria-labelledby="simulator-title">
        <h2 id="simulator-title">{copy.simulatorTitle}</h2><p>{copy.simulatorIntroduction}</p>
        <Button type="button" disabled={busy} onClick={runSimulator}>{copy.simulatorAction}</Button>
      </section> : null}
      {step === 'restart-required' ? <Button type="button" disabled={busy} onClick={restart}>{copy.restartRequired}</Button> : null}
      {step === 'pending-admission' || step === 'terminal-completion' ? <p role="status">{copy.enrollmentProgress}</p> : null}
      {step === 'profile-loading' ? <p role="status">{copy.profileLoading}</p> : null}
      {step === 'profile-confirming' ? <p role="status">{copy.profileConfirming}</p> : null}
      {profile && ['profile-editing', 'profile-saving', 'profile-confirming', 'profile-saved'].includes(step) ?
        <ProfileEditor key={profile.displayName ?? 'new'} locale={locale} view={profile} busy={busy} saved={step === 'profile-saved'}
          uncertain={uncertain} onSave={saveProfile} /> : null}
      {step === 'verified-login-required' ? <p role="alert">{copy.verifiedLoginRequired}</p> : null}
      {error && step !== 'restart-required' ? <p role="alert">{error}</p> : null}
      <div className={styles.actions}>
        {step !== 'identifier' && step !== 'verified-login-required' && step !== 'profile-saved' ?
          <Button variant="secondary" type="button" onClick={goBack}>{copy.backLabel}</Button> : null}
        {step === 'identifier' ? <p className={styles.unavailable}>{copy.loginUnavailable}</p> : null}
      </div>
    </section>
  </main>;
}
