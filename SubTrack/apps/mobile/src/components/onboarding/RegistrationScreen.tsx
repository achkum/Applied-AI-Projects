import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { IdentifierEntry } from './IdentifierEntry';
import { useOnboarding } from '@/state/OnboardingAdapter';
import {calibrateEnrollmentDiagnostic} from '@/utils/privateRuntimeEnrollmentDiagnostic';
import { NativeProductButton, NativeProductCard, NativeProductHeading } from '@/components/billing/NativeProductUI';

export type RegistrationMode = 'register' | 'login';

export function RegistrationScreen({
  mode = 'register',
}: {
  mode?: RegistrationMode;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { theme, isDark } = useTheme();
  const onboarding = useOnboarding();
  const {flow, start, reset, provider} = onboarding;
  const generation = useRef(0); const pending = useRef(false);
  const currentProvider = useRef(provider); currentProvider.current = provider;
  const currentLogout = useRef(onboarding.logout); currentLogout.current = onboarding.logout;
  const [loginError, setLoginError] = useState(false);
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  useEffect(()=>mode==='register'?calibrateEnrollmentDiagnostic():undefined,[mode]);
  useEffect(() => {
    if (mode === 'login') {
      if (provider === 'production' && flow.phase !== 'identifier') reset();
    }
    if (flow.phase === 'otp') router.replace('/register-otp');
    else if (flow.phase === 'bankid') router.replace('/register-bankid');
  }, [flow.phase, mode, provider, router]);
  useEffect(() => () => { generation.current++; if (pending.current && currentProvider.current === 'production') void currentLogout.current().catch(() => undefined); }, []);

  return (
    <ScrollView
      style={{ backgroundColor: color('bg.canvas') }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.registration.backLabel')}
        onPress={() => {
          generation.current++; pending.current = false; if (mode === 'login' && provider === 'production') void onboarding.logout().catch(() => undefined);
          reset();
          router.back();
        }}
        style={styles.back}
      >
        <Text
          style={{
            color: color('ink.primary'),
            fontFamily: theme.typography.fontFamily.ui,
          }}
        >
          {t('onboarding.registration.backLabel')}
        </Text>
      </Pressable>
      <NativeProductHeading title={t(mode==='login'?'onboarding.nativePersonal.loginTitle':'onboarding.registration.title')} />

      {mode!=='login'&&loginError?<Text accessibilityRole="alert" style={{color:color('ink.primary')}}>{t('onboarding.nativePersonal.unavailable')}</Text>:null}
      {mode === 'login' ? (
        <NativeProductCard>
          {loginError ? <Text accessibilityRole="alert" style={{ color: color('ink.primary') }}>{t('onboarding.nativePersonal.unavailable')}</Text> : null}
          <NativeProductButton label={t('onboarding.nativePersonal.verify')} variant="primary" disabled={onboarding.sessionPhase === 'busy' || pending.current}
            onPress={async () => {
              if (pending.current) return;
              const ticket = ++generation.current; pending.current = true; setLoginError(false);
              try { await onboarding.login(locale); if (ticket !== generation.current) return; pending.current = false; router.replace('/personal'); }
              catch { if (ticket === generation.current) { pending.current = false; setLoginError(true); } }
            }} />
        </NativeProductCard>
      ) : (
        <>
          {flow.phase === 'identifier' && flow.error && (
            <Text
              accessibilityRole="alert"
              style={{
                color: color('ink.primary'),
                fontFamily: theme.typography.fontFamily.ui,
              }}
            >
              {t('onboarding.registration.requestUnavailable')}
            </Text>
          )}
          {flow.phase === 'starting' && (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: color('ink.secondary'),
                fontFamily: theme.typography.fontFamily.ui,
              }}
            >
              {t('onboarding.registration.loading')}
            </Text>
          )}
          {flow.phase === 'identifier' && (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: color('bg.raised'),
                  borderRadius: theme.radius.card,
                },
              ]}
            >
              <IdentifierEntry
                onValidIdentifier={(identifier) => {
                  const ticket=++generation.current;setLoginError(false);
                  void (provider==='sandbox'?start(identifier,locale):start(identifier)).then(()=>{if(provider==='sandbox'&&ticket===generation.current)router.replace('/personal');}).catch(()=>{if(ticket===generation.current)setLoginError(true);});
                }}
              />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 16, padding: 24 },
  back: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  card: { padding: 24 },
});
