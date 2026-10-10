import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { IdentifierEntry } from './IdentifierEntry';
import { useEnrollment } from '@/state/EnrollmentFlow';

export type RegistrationMode = 'register' | 'login';

export function RegistrationScreen({
  mode = 'register',
}: {
  mode?: RegistrationMode;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { flow, start, reset } = useEnrollment();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  useEffect(() => {
    if (mode === 'login') {
      if (flow.phase !== 'identifier') reset();
    } else if (flow.phase === 'otp') router.replace('/register-otp');
    else if (flow.phase === 'bankid') router.replace('/register-bankid');
  }, [flow.phase, mode, router]);

  return (
    <ScrollView
      style={{ backgroundColor: color('bg.canvas') }}
      contentContainerStyle={styles.content}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.registration.backLabel')}
        onPress={() => {
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
      <Text
        accessibilityRole="header"
        style={{
          color: color('ink.primary'),
          fontFamily: theme.typography.fontFamily.display,
          fontSize: theme.typography.fontSize['2xl'],
        }}
      >
        {t('onboarding.registration.title')}
      </Text>
      <Text
        style={{
          color: color('ink.secondary'),
          fontFamily: theme.typography.fontFamily.ui,
          fontSize: theme.typography.fontSize.md,
        }}
      >
        {t('onboarding.registration.introduction')}
      </Text>

      {mode === 'login' ? (
        <View
          accessible
          accessibilityRole="alert"
          style={[
            styles.notice,
            {
              backgroundColor: color('bg.raised'),
              borderRadius: theme.radius.card,
            },
          ]}
        >
          <Text
            style={{
              color: color('ink.primary'),
              fontFamily: theme.typography.fontFamily.ui,
            }}
          >
            {t('onboarding.registration.loginUnavailable')}
          </Text>
        </View>
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
                  void start(identifier);
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
  notice: { gap: 12, padding: 16 },
  card: { padding: 24 },
});
