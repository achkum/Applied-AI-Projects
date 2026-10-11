'use client';

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@subtrack/ui';
import { catalogs, type Locale } from '@subtrack/i18n';
import type { ProfilePatch, ProfileView, SubscriptionLifecycleTarget, SubscriptionOwnerView } from '@subtrack/contracts';
import { IdentifierEntry, type IdentifierEntryValue } from './identifier-entry';
import { ProfileEditor } from './profile-editor';
import { PrivateSubscriptions } from './private-subscriptions';
import { RegistrationApiError, startRegistration, verifyRegistration, admitPendingRegistration, verifySimulatorRegistration, completeRegistration, type RegistrationIdentifier } from '@/lib/registration-api';
import { readProfile, patchProfile, ProfileApiError } from '@/lib/profile-api';
import { chooseJustMe, readMode, readOwnerSubscriptions, readOwnerSubscription, patchOwnerSubscription, PrivateOnboardingApiError } from '@/lib/private-onboarding-api';
import styles from './registration-flow.module.css';

type Step = 'identifier' | 'otp' | 'pending-admission' | 'simulator-verification' | 'terminal-completion' |
  'profile-loading' | 'profile-editing' | 'profile-saving' | 'profile-confirming' | 'profile-saved' |
  'mode-saving' | 'mode-confirming' | 'subscriptions-loading' | 'subscriptions-list' | 'subscriptions-detail' |
  'restart-required' | 'verified-login-required' | 'unavailable';

export function RegistrationFlow({ locale }: { locale: Locale }) {
  const copy = catalogs[locale].onboarding.registration;
  const [step, setStep] = useState<Step>('identifier');
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [nonce, setNonce] = useState('');
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState<RegistrationIdentifier | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [items, setItems] = useState<SubscriptionOwnerView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubscriptionOwnerView | null>(null);
  const [statusConfirmed, setStatusConfirmed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const requestPending = useRef(false);
  const continuation = useRef('');
  const rotatedNonce = useRef('');
  const csrf = useRef('');
  const panel = useRef<HTMLElement>(null);
  const previousStep = useRef<Step>('identifier');
  const otpInput = useRef<HTMLInputElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    if (step === 'profile-saved' || step === 'profile-editing' && uncertain) return;
    const selector = step === 'identifier' ? '#registration-title' : step === 'restart-required' ? 'button' :
      step === 'profile-editing' || step === 'profile-saving' ? '#profile-title' : '[data-step-focus]';
    panel.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [step, uncertain]);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);

  useEffect(() => {
    if (performance.getEntriesByType('navigation').some((entry) => (entry as PerformanceNavigationTiming).type === 'reload')) {
      setStep('verified-login-required');
    }
    return () => { generation.current += 1; controller.current?.abort(); clearPrivate(); };
  }, []);

  function clearPrivate() {
    continuation.current = ''; rotatedNonce.current = ''; csrf.current = '';
    setItems([]); setNextCursor(null); setSelected(null); setStatusConfirmed(false);
  }
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
    clearPrivate(); setChallengeId(''); setNonce(''); setCode(''); setOtpError(''); setProfile(null);
    setStep(next); setError(message); finish();
  }
  function fail(caught: unknown, request: { signal: AbortSignal; generation: number }, terminal = false) {
    if (!current(request)) return;
    if (terminal || caught instanceof RegistrationApiError && caught.code === 'login-required' ||
        caught instanceof ProfileApiError && caught.code === 'login-required' ||
        caught instanceof PrivateOnboardingApiError && caught.code === 'login-required') stop('verified-login-required');
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
    const request = beginRequest(); setError(''); setCode(''); setOtpError('');
    try {
      const result = await startRegistration(identifier, request.signal);
      if (!current(request)) return;
      setChallengeId(result.challengeId); setNonce(result.nextBrowserNonce); setStep('otp'); finish();
    } catch (caught) { fail(caught, request); }
  }
  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestPending.current) return;
    if (!/^[0-9]{6}$/.test(code)) { setOtpError(copy.invalidOtp); otpInput.current?.focus(); return; }
    const request = beginRequest();
    const sentCode = code; const sentNonce = nonce; const sentChallenge = challengeId;
    setCode(''); setNonce(''); setChallengeId(''); setError(''); setOtpError('');
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
  async function chooseMode() {
    if (requestPending.current || !csrf.current || !profile?.profileComplete || step !== 'profile-saved') return;
    const request = beginRequest(); setError(''); setStep('mode-saving');
    try {
      await chooseJustMe(csrf.current, request.signal);
      if (!current(request)) return;
    } catch (caught) {
      if (!current(request)) return;
      if (caught instanceof PrivateOnboardingApiError && caught.code !== 'conflict' && caught.code !== 'unavailable' && caught.code !== 'login-required') {
        stop('verified-login-required'); return;
      }
    }
    try {
      setStep('mode-confirming');
      const mode = await readMode(csrf.current, request.signal);
      if (!current(request)) return;
      if (mode !== 'just-me') { stop('verified-login-required'); return; }
      setStep('subscriptions-loading');
      const page = await readOwnerSubscriptions(csrf.current, request.signal);
      if (!current(request)) return;
      setItems(page.items); setNextCursor(page.nextCursor); setStep('subscriptions-list'); finish();
    } catch { if (current(request)) stop('verified-login-required'); }
  }
  async function loadMore() {
    if (requestPending.current || !csrf.current || !nextCursor || step !== 'subscriptions-list') return;
    const request = beginRequest(); setError('');
    try {
      const page = await readOwnerSubscriptions(csrf.current, request.signal, nextCursor);
      if (!current(request)) return;
      const ids = new Set(items.map((item) => item.id));
      if (page.items.some((item) => ids.has(item.id)) || page.nextCursor === nextCursor) throw new PrivateOnboardingApiError('unavailable');
      setItems([...items, ...page.items]); setNextCursor(page.nextCursor); finish();
    } catch { if (current(request)) stop('verified-login-required'); }
  }
  async function selectSubscription(id: string) {
    if (requestPending.current || !csrf.current || step !== 'subscriptions-list' || !items.some((item) => item.id === id)) return;
    const request = beginRequest(); setError(''); setStatusConfirmed(false);
    try {
      const detail = await readOwnerSubscription(id, csrf.current, request.signal);
      if (!current(request)) return;
      setSelected(detail); setStep('subscriptions-detail'); finish();
    } catch { if (current(request)) stop('verified-login-required'); }
  }
  async function transition(status: SubscriptionLifecycleTarget) {
    if (requestPending.current || !csrf.current || !selected || step !== 'subscriptions-detail') return;
    const allowed: Record<string, SubscriptionLifecycleTarget[]> = {
      ACTIVE: ['PAUSED', 'CANCELLED', 'ARCHIVED'], PAUSED: ['ACTIVE', 'CANCELLED', 'ARCHIVED'], CANCELLED: ['ARCHIVED'],
    };
    if (!(allowed[selected.status] ?? []).includes(status)) return;
    const request = beginRequest(); setError(''); setStatusConfirmed(false);
    let knownCommitted = false;
    try {
      await patchOwnerSubscription(selected.id, status, csrf.current, request.signal);
      if (!current(request)) return;
      knownCommitted = true;
    } catch (caught) {
      if (!current(request)) return;
      if (!(caught instanceof PrivateOnboardingApiError)) { stop('verified-login-required'); return; }
    }
    try {
      const detail = await readOwnerSubscription(selected.id, csrf.current, request.signal);
      if (!current(request)) return;
      setSelected(detail);
      setItems((prior) => prior.map((item) => item.id === detail.id ? detail : item));
      setStatusConfirmed(detail.status === status && knownCommitted);
      if (!knownCommitted) setError(catalogs[locale].onboarding.ownerSubscriptions.rechecked);
      else if (detail.status !== status) setError(catalogs[locale].onboarding.ownerSubscriptions.conflict);
      finish();
    } catch { if (current(request)) stop('verified-login-required'); }
  }
  function goBack() {
    generation.current += 1; controller.current?.abort(); clearPrivate(); requestPending.current = false;
    setBusy(false); setCode(''); setOtpError(''); setNonce(''); setChallengeId(''); setProfile(null); setError('');
    setIdentifier(null); setUncertain(false);
    setStep(step === 'otp' || step === 'restart-required' ? 'identifier' : 'verified-login-required');
  }

  return <main className={styles.frame} lang={locale} aria-busy={busy}>
    <section ref={panel} className={styles.panel} aria-labelledby="registration-title">
      <h1 id="registration-title" tabIndex={-1}>{copy.title}</h1>
      {step === 'identifier' ? <><p>{copy.introduction}</p><IdentifierEntry locale={locale} onContinue={submitIdentifier} /></> : null}
      {step === 'otp' ? <form className={styles.form} onSubmit={submitOtp}>
        <h2 data-step-focus tabIndex={-1}>{copy.otpTitle}</h2>
        <label htmlFor="registration-otp">{copy.otpLabel}</label>
        <input ref={otpInput} id="registration-otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
          aria-invalid={otpError ? 'true' : undefined} aria-describedby={otpError ? 'registration-otp-error' : undefined}
          value={code} onChange={(event) => { setCode(event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 6)); setOtpError(''); }} />
        {otpError ? <p id="registration-otp-error" role="alert">{otpError}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? copy.loading : copy.verifyLabel}</Button>
      </form> : null}
      {step === 'simulator-verification' ? <section aria-labelledby="simulator-title">
        <h2 id="simulator-title" data-step-focus tabIndex={-1}>{copy.simulatorTitle}</h2><p>{copy.simulatorIntroduction}</p>
        <Button type="button" disabled={busy} onClick={runSimulator}>{copy.simulatorAction}</Button>
      </section> : null}
      {step === 'restart-required' ? <Button type="button" disabled={busy} onClick={restart}>{copy.restartRequired}</Button> : null}
      {step === 'pending-admission' || step === 'terminal-completion' ? <p data-step-focus tabIndex={-1} role="status">{copy.enrollmentProgress}</p> : null}
      {step === 'profile-loading' ? <p data-step-focus tabIndex={-1} role="status">{copy.profileLoading}</p> : null}
      {step === 'profile-confirming' ? <p data-step-focus tabIndex={-1} role="status">{copy.profileConfirming}</p> : null}
      {profile && ['profile-editing', 'profile-saving', 'profile-confirming', 'profile-saved'].includes(step) ?
        <ProfileEditor key={profile.displayName ?? 'new'} locale={locale} view={profile} busy={busy} saved={step === 'profile-saved'}
          uncertain={uncertain} onSave={saveProfile} /> : null}
      {step === 'profile-saved' && profile ? <section aria-labelledby="mode-title">
        <h2 id="mode-title">{catalogs[locale].onboarding.mode.title}</h2>
        <p>{profile.profileComplete ? catalogs[locale].onboarding.mode.description : catalogs[locale].onboarding.mode.incomplete}</p>
        {profile.profileComplete ? <Button type="button" disabled={busy} onClick={chooseMode}>{catalogs[locale].onboarding.mode.choose}</Button> : null}
      </section> : null}
      {step === 'mode-saving' || step === 'mode-confirming' ? <p data-step-focus tabIndex={-1} role="status">
        {step === 'mode-saving' ? catalogs[locale].onboarding.mode.saving : catalogs[locale].onboarding.mode.confirming}</p> : null}
      {step === 'subscriptions-loading' ? <p data-step-focus tabIndex={-1} role="status">{catalogs[locale].onboarding.ownerSubscriptions.loading}</p> : null}
      {step === 'subscriptions-list' || step === 'subscriptions-detail' ? <PrivateSubscriptions locale={locale} items={items} nextCursor={nextCursor}
        selected={step === 'subscriptions-detail' ? selected : null} busy={busy} confirmed={statusConfirmed} onMore={loadMore}
        onSelect={selectSubscription} onBack={() => { setSelected(null); setStatusConfirmed(false); setStep('subscriptions-list'); }} onTransition={transition} /> : null}
      {step === 'verified-login-required' ? <p data-step-focus tabIndex={-1} role="alert">{copy.verifiedLoginRequired}</p> : null}
      {error && step !== 'restart-required' ? <p ref={errorMessage} tabIndex={-1} role="alert">{error}</p> : null}
      <div className={styles.actions}>
        {step !== 'identifier' && step !== 'verified-login-required' && step !== 'profile-saved' &&
          !step.startsWith('subscriptions-') && !step.startsWith('mode-') ?
          <Button variant="secondary" type="button" onClick={goBack}>{copy.backLabel}</Button> : null}
        {step === 'identifier' ? <p className={styles.unavailable}>{copy.loginUnavailable}</p> : null}
      </div>
    </section>
  </main>;
}
