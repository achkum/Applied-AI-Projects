import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { useEnrollment } from '@/state/EnrollmentFlow';

export default function RegisterBankIdRoute() {
  const router = useRouter();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { flow, reset } = useEnrollment();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  useEffect(() => {
    if (flow.phase !== 'bankid') router.replace('/register');
  }, [flow.phase, router]);
  if (flow.phase !== 'bankid') return null;
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
          {t('onboarding.registration.bankIdUnavailable')}
        </Text>
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
