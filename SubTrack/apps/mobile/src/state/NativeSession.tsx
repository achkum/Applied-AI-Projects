import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NativeSessionCore, type NativePhase } from './NativeSessionCore';
import { secureSessionBundle, type NativeBundleStore } from '@/utils/secureSessionBundle';
import { completeNativeEnrollment, verifiedNativeLogin, rotateNativeSession, revokeNativeSession } from '@/api/privateMobileApi';

interface SessionContext {
  phase: NativePhase;
  complete(proof: string, locale: 'sv' | 'en'): Promise<void>;
  login(): Promise<void>;
  refresh(): Promise<void>;
  logout(): Promise<boolean>;
  run<T>(operation: (accessToken: string, signal: AbortSignal) => Promise<T>): Promise<T>;
}
const Context = createContext<SessionContext | undefined>(undefined);
export function NativeSessionProvider({ children, store = secureSessionBundle }: { children: React.ReactNode; store?: NativeBundleStore }) {
  const mounted = useRef(false); const [phase, setPhase] = useState<NativePhase>('verification-required');
  const core = useRef<NativeSessionCore | undefined>(undefined);
  if (!core.current) core.current = new NativeSessionCore(store, next => { if (mounted.current) setPhase(next); });
  const session = core.current;
  useEffect(() => {
    mounted.current = true; void session.initialize().catch(() => undefined);
    return () => { mounted.current = false; session.dispose(); };
  }, [session]);
  const value: SessionContext = { phase,
    complete: (proof, locale) => session.establish(signal => completeNativeEnrollment(proof, locale, signal)),
    login: () => session.establish(verifiedNativeLogin), refresh: () => session.rotate(rotateNativeSession),
    logout: () => session.logout(revokeNativeSession), run: operation => session.run(operation) };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNativeSession() {
  const value = useContext(Context); if (!value) throw new Error('NativeSessionProvider required'); return value;
}
