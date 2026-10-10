import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { useEnrollment } from '@/state/EnrollmentFlow';

export default function RegisterOtpRoute() {
  const router = useRouter();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { flow, verify, resend, reset } = useEnrollment();
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(0);
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  useEffect(() => {
    if (flow.phase === 'bankid') router.replace('/register-bankid');
    else if (flow.phase !== 'otp') router.replace('/register');
  }, [flow.phase, router]);
  useEffect(() => {
    if (flow.phase !== 'otp') return;
    const tick = () =>
      setSeconds(
        Math.max(0, Math.ceil((flow.cooldownUntil - Date.now()) / 1000)),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [flow.phase === 'otp' ? flow.cooldownUntil : 0]);
  if (flow.phase !== 'otp') return null;
  const busy = flow.pending;
  const back = () => {
    reset();
    router.replace('/register');
  };
  return (
    <ScrollView
      style={{ backgroundColor: color('bg.canvas') }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.registration.backLabel')}
        onPress={back}
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
      <Text
        accessibilityRole="header"
        style={{
          color: color('ink.primary'),
          fontFamily: theme.typography.fontFamily.display,
          fontSize: theme.typography.fontSize['2xl'],
        }}
      >
        {t('onboarding.registration.otpTitle')}
      </Text>
      <Text
        style={{
          color: color('ink.secondary'),
          fontFamily: theme.typography.fontFamily.ui,
          fontSize: theme.typography.fontSize.md,
        }}
      >
        {t('onboarding.registration.otpIntroduction')}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: color('bg.raised'),
            borderRadius: theme.radius.card,
          },
        ]}
      >
        <Text
          nativeID="otp-label"
          style={{
            color: color('ink.primary'),
            fontFamily: theme.typography.fontFamily.ui,
            fontSize: theme.typography.fontSize.md,
          }}
        >
          {t('onboarding.registration.otpLabel')}
        </Text>
        <TextInput
          autoFocus
          accessibilityLabel={t('onboarding.registration.otpLabel')}
          accessibilityHint={t('onboarding.registration.otpHint')}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChangeText={(value) =>
            setCode(value.replace(/\D/g, '').slice(0, 6))
          }
          style={[
            styles.input,
            {
              color: color('ink.primary'),
              backgroundColor: color('bg.canvas'),
              borderColor: color(flow.error ? 'ember.amber' : 'ink.secondary'),
              borderRadius: theme.radius.card,
              fontFamily: theme.typography.fontFamily.mono,
              fontSize: theme.typography.fontSize['2xl'],
            },
          ]}
        />
        {flow.error && (
          <Text
            accessibilityRole="alert"
            style={{
              color: color('ink.primary'),
              fontFamily: theme.typography.fontFamily.ui,
            }}
          >
            {t(
              flow.error === 'incorrect'
                ? 'onboarding.registration.wrongCode'
                : 'onboarding.registration.restartRequired',
            )}
          </Text>
        )}
        {busy && (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              color: color('ink.secondary'),
              fontFamily: theme.typography.fontFamily.ui,
            }}
          >
            {t('onboarding.registration.verifyPending')}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.registration.verifyLabel')}
          accessibilityState={{ disabled: busy || code.length !== 6 }}
          disabled={busy || code.length !== 6}
          onPress={() => {
            const submitted = code;
            setCode('');
            void verify(submitted);
          }}
          style={[
            styles.action,
            {
              backgroundColor: color(
                busy || code.length !== 6 ? 'bg.sunken' : 'ink.primary',
              ),
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Text
            style={{
              color: color(
                busy || code.length !== 6 ? 'ink.secondary' : 'bg.raised',
              ),
              fontFamily: theme.typography.fontFamily.ui,
            }}
          >
            {t('onboarding.registration.verifyLabel')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            seconds > 0
              ? t('onboarding.registration.resendCountdown', { seconds })
              : t('onboarding.registration.requestCode')
          }
          accessibilityState={{ disabled: busy || seconds > 0 }}
          disabled={busy || seconds > 0}
          onPress={() => {
            setCode('');
            void resend();
          }}
          style={styles.action}
        >
          <Text
            style={{
              color: color(
                busy || seconds > 0 ? 'ink.secondary' : 'ink.primary',
              ),
              fontFamily: theme.typography.fontFamily.ui,
            }}
          >
            {seconds > 0
              ? t('onboarding.registration.resendCountdown', { seconds })
              : t('onboarding.registration.requestCode')}
          </Text>
        </Pressable>
      </View>
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
  card: { gap: 12, padding: 24 },
  input: {
    minHeight: 56,
    borderWidth: 1,
    paddingHorizontal: 16,
    letterSpacing: 6,
  },
  action: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
});
