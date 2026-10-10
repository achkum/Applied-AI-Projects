import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'expo-router';
import type { IdentifierResult } from '@subtrack/contracts/identifiers';
import {
  EnrollmentRequestError,
  startMobileEnrollment,
  verifyMobileEnrollment,
  type EnrollmentError,
} from '@/api/mobileEnrollmentOtp';

type Identifier = Extract<IdentifierResult, { valid: true }>;
type Flow =
  | { phase: 'identifier'; error?: EnrollmentError }
  | { phase: 'starting'; identifier: Identifier }
  | {
      phase: 'otp';
      identifier: Identifier;
      challengeId: string;
      cooldownUntil: number;
      pending: boolean;
      error?: EnrollmentError;
    }
  | { phase: 'bankid'; proof: string };

interface FlowContext {
  flow: Flow;
  start: (identifier: Identifier) => Promise<void>;
  resend: () => Promise<void>;
  verify: (code: string) => Promise<void>;
  reset: () => void;
}

const Context = createContext<FlowContext | undefined>(undefined);
const initial: Flow = { phase: 'identifier' };
const reason = (error: unknown): EnrollmentError =>
  error instanceof EnrollmentRequestError ? error.reason : 'restart';

export function EnrollmentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [flow, setFlow] = useState<Flow>(initial);
  const current = useRef<Flow>(initial);
  const generation = useRef(0);
  const mounted = useRef(false);
  const previousPath = useRef(pathname);
  const update = (next: Flow) => {
    current.current = next;
    if (mounted.current) setFlow(next);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      current.current = initial;
    };
  }, []);

  const reset = () => {
    generation.current++;
    update(initial);
  };
  useEffect(() => {
    const previous = previousPath.current;
    previousPath.current = pathname;
    if (previous === pathname) return;
    const enrollmentPath =
      pathname === '/register' ||
      pathname === '/register-otp' ||
      pathname === '/register-bankid';
    const backedToEarlierStep =
      (pathname === '/register' &&
        (previous === '/register-otp' || previous === '/register-bankid')) ||
      (pathname === '/register-otp' && previous === '/register-bankid');
    if (!enrollmentPath || backedToEarlierStep) reset();
  }, [pathname]);
  const start = async (identifier: Identifier) => {
    if (current.current.phase !== 'identifier') return;
    const ticket = ++generation.current;
    update({ phase: 'starting', identifier });
    try {
      const result = await startMobileEnrollment(
        identifier.channel,
        identifier.identifier,
      );
      if (ticket === generation.current && mounted.current)
        update({
          phase: 'otp',
          identifier,
          challengeId: result.challengeId,
          cooldownUntil: Date.now() + 30_000,
          pending: false,
        });
    } catch (error) {
      if (ticket === generation.current && mounted.current)
        update({ phase: 'identifier', error: reason(error) });
    }
  };
  const resend = async () => {
    const old = current.current;
    if (old.phase !== 'otp' || old.pending || Date.now() < old.cooldownUntil)
      return;
    const ticket = ++generation.current;
    update({
      phase: 'otp',
      identifier: old.identifier,
      challengeId: old.challengeId,
      cooldownUntil: old.cooldownUntil,
      pending: true,
    });
    try {
      const result = await startMobileEnrollment(
        old.identifier.channel,
        old.identifier.identifier,
      );
      if (ticket === generation.current && mounted.current)
        update({
          phase: 'otp',
          identifier: old.identifier,
          challengeId: result.challengeId,
          cooldownUntil: Date.now() + 30_000,
          pending: false,
        });
    } catch (error) {
      if (ticket === generation.current && mounted.current)
        update({ phase: 'identifier', error: reason(error) });
    }
  };
  const verify = async (code: string) => {
    const old = current.current;
    if (old.phase !== 'otp' || old.pending || !/^\d{6}$/.test(code)) return;
    const ticket = ++generation.current;
    update({
      phase: 'otp',
      identifier: old.identifier,
      challengeId: old.challengeId,
      cooldownUntil: old.cooldownUntil,
      pending: true,
    });
    try {
      const result = await verifyMobileEnrollment(old.challengeId, code);
      if (ticket === generation.current && mounted.current)
        update({ phase: 'bankid', proof: result.proof });
    } catch (error) {
      if (ticket !== generation.current || !mounted.current) return;
      const failure = reason(error);
      if (failure === 'incorrect')
        update({ ...old, pending: false, error: failure });
      else update({ phase: 'identifier', error: failure });
    }
  };
  return (
    <Context.Provider value={{ flow, start, resend, verify, reset }}>
      {children}
    </Context.Provider>
  );
}

export function useEnrollment(): FlowContext {
  const context = useContext(Context);
  if (!context) throw new Error('EnrollmentProvider missing');
  return context;
}
