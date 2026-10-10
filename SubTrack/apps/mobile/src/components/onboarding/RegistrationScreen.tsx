import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { IdentifierEntry } from './IdentifierEntry';

export type RegistrationMode = 'register' | 'login';

export function RegistrationScreen({ mode = 'register' }: { mode?: RegistrationMode }) {
  const router = useRouter();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const [accepted, setAccepted] = useState(false);
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  return (
    <ScrollView style={{ backgroundColor: color('bg.canvas') }} contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.registration.backLabel')}
        onPress={() => router.back()}
        style={styles.back}
      >
        <Text style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui }}>
          {t('onboarding.registration.backLabel')}
        </Text>
      </Pressable>
      <Text accessibilityRole="header" style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['2xl'] }}>
        {t('onboarding.registration.title')}
      </Text>
      <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md }}>
        {t('onboarding.registration.introduction')}
      </Text>

      {mode === 'login' ? (
        <View accessible accessibilityRole="alert" style={[styles.notice, { backgroundColor: color('bg.raised'), borderRadius: theme.radius.card }]}>
          <Text style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui }}>
            {t('onboarding.registration.loginUnavailable')}
          </Text>
        </View>
      ) : accepted ? (
        <View accessible accessibilityRole="alert" style={[styles.notice, { backgroundColor: color('bg.raised'), borderRadius: theme.radius.card }]}>
          <Text style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui }}>
            {t('onboarding.registration.identifierValid')}
          </Text>
          <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui }}>
            {t('onboarding.registration.bankIdRequired')}
          </Text>
          <Text style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui }}>
            {t('onboarding.registration.unavailable')}
          </Text>
        </View>
      ) : (
        <IdentifierEntry onValidIdentifier={() => setAccepted(true)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 16, padding: 24 },
  back: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  notice: { gap: 12, padding: 16 },
});
