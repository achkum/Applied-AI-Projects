import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { WelcomeActions } from '@/components/onboarding/WelcomeActions';

export default function WelcomeRoute() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={{ backgroundColor: color('bg.canvas') }}
    >
      <View accessibilityLabel={t('onboarding.welcome.tagline')}>
        <WelcomeActions
          onCreateAccount={() => router.push('/register')}
          onLogIn={() => router.push({ pathname: '/register', params: { mode: 'login' } })}
          onExploreDemo={() => router.push(locale === 'sv' ? '/sv/demo' : '/en/demo')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
});
