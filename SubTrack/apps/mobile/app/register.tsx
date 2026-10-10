import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RegistrationScreen } from '@/components/onboarding/RegistrationScreen';

export default function RegisterRoute() {
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const mode = params.mode === 'login' ? 'login' : 'register';
  return <RegistrationScreen mode={mode} />;
}
