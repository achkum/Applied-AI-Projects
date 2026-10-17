import React from 'react';
import type {NativePhase} from '@/state/NativeSessionCore';
import {useI18n} from '@/context/I18nContext';
import {NativeProductButton} from '@/components/billing/NativeProductUI';

export function sessionExitFeedback(phase: NativePhase, confirmed: boolean): string {
  if (phase === 'active') return confirmed ? 'logoutConfirmed' : 'logoutLocal';
  if (phase === 'busy') return 'verificationCancelled';
  return phase === 'storage-error' ? 'sessionCleared' : '';
}

export function NativeSessionExit({phase,onExit}:{phase:NativePhase;onExit:()=>void}) {
  const {t}=useI18n();
  const action=phase==='active'?'logout':phase==='busy'?'cancelVerification':phase==='storage-error'?'clearSession':null;
  return action ? <NativeProductButton label={t(`onboarding.nativePersonal.${action}`)} onPress={onExit}/> : null;
}
