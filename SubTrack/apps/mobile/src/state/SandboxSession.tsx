import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { sandboxConfigurationSelected, readSandboxMarker, resolveSandboxRuntime } from '@/config/sandboxRuntime';
import { sandboxMobileApi, type SandboxMobileApi } from '@/api/sandboxMobileApi';
import { secureSandboxBundle, type SandboxBundleStore } from '@/utils/secureSandboxBundle';
import { SandboxSessionCore, type SandboxPhase } from './SandboxSessionCore';

export interface SandboxSessionFacade {
  phase: SandboxPhase; resumable: boolean; available: boolean;
  bootstrap(locale: 'sv' | 'en'): Promise<void>; login(): Promise<void>; refresh(): Promise<void>; logout(): Promise<boolean>;
  run<T>(work: (token: string, signal: AbortSignal) => Promise<T>): Promise<T>;
}
const Context = createContext<SandboxSessionFacade | undefined>(undefined);
// Presence selects the isolated branch even for malformed markers: never fall back privately.
export function sandboxBuildSelected(config: unknown = Constants.expoConfig): boolean { return sandboxConfigurationSelected(config); }
export function sandboxSessionAvailable(config: unknown = Constants.expoConfig, platform = Platform.OS): boolean {
  return resolveSandboxRuntime({ marker: readSandboxMarker(config), platform }) !== null;
}
export function SandboxSessionProvider({ children, store = secureSandboxBundle, api = sandboxMobileApi, available = false }: {
  children: React.ReactNode; store?: SandboxBundleStore; api?: SandboxMobileApi; available?: boolean;
}) {
  const mounted = useRef(false), [state, setState] = useState<{ phase: SandboxPhase; resumable: boolean }>({ phase: 'verification-required', resumable: false });
  const core = useRef<SandboxSessionCore | undefined>(undefined);
  if (!core.current) core.current = new SandboxSessionCore(store, api, (phase, resumable) => { if (mounted.current) setState({ phase, resumable }); });
  const session = core.current;
  useEffect(() => { mounted.current = true; if (available) void session.initialize().catch(() => undefined);
    return () => { mounted.current = false; session.dispose(); }; }, [session, available]);
  const intent = <T,>(work: () => Promise<T>): Promise<T> => available ? work() : Promise.reject(new Error('Sandbox unavailable'));
  const value: SandboxSessionFacade = { ...state, available, bootstrap: locale => intent(() => session.bootstrap(locale)),
    login: () => intent(() => session.resume()), refresh: () => intent(() => session.refresh()), logout: () => session.logout(),
    run: work => intent(() => session.run(work)) };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSandboxSession(): SandboxSessionFacade { const value = useContext(Context); if (!value) throw new Error('SandboxSessionProvider required'); return value; }
