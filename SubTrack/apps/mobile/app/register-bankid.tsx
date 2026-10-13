import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { useEnrollment } from '@/state/EnrollmentFlow';
import { useNativeSession } from '@/state/NativeSession';

export default function RegisterBankIdRoute() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { theme, isDark } = useTheme();
  const { flow, reset } = useEnrollment();
  const session = useNativeSession();
  const generation = useRef(0); const completed = useRef(false); const pending = useRef(false);
  const [error, setError] = useState(false);
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  useEffect(() => {
    if (flow.phase !== 'bankid' && !completed.current) router.replace('/register');
  }, [flow.phase, router]);
  useEffect(() => () => { generation.current++; if (pending.current) void session.logout().catch(() => undefined); }, []);
  if (flow.phase !== 'bankid' && !error && !completed.current) return null;
  return (
    <ScrollView
      style={{ backgroundColor: color('bg.canvas') }}
      contentContainerStyle={styles.content}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.registration.backLabel')}
        onPress={() => {
          generation.current++; pending.current = false; void session.logout().catch(() => undefined);
          reset();
          router.replace('/register');
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
      <Text
        accessibilityRole="header"
        style={{
          color: color('ink.primary'),
          fontFamily: theme.typography.fontFamily.display,
          fontSize: theme.typography.fontSize['2xl'],
        }}
      >
        {t('onboarding.registration.bankIdRequired')}
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
          accessibilityRole="alert"
          style={{
            color: color('ink.secondary'),
            fontFamily: theme.typography.fontFamily.ui,
            fontSize: theme.typography.fontSize.md,
          }}
        >
          {t('onboarding.nativePersonal.demo')}
        </Text>
        {error ? <Text accessibilityRole="alert" style={{ color: color('ink.primary') }}>{t('onboarding.nativePersonal.unavailable')}</Text> : null}
        <Pressable accessibilityRole="button" disabled={session.phase === 'busy'}
          onPress={async () => {
            if (pending.current || flow.phase !== 'bankid' && !error) return;
            const ticket = ++generation.current; pending.current = true; setError(false);
            try {
              if (error) await session.login();
              else if (flow.phase === 'bankid') await session.complete(flow.proof, locale);
              if (ticket !== generation.current) return;
              pending.current = false; completed.current = true; reset(); router.replace('/personal');
            } catch { if (ticket === generation.current) { pending.current = false; completed.current = true; reset(); setError(true); } }
          }} style={styles.back}>
          <Text style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui }}>{t('onboarding.nativePersonal.verify')}</Text>
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
  card: { padding: 24 },
});
