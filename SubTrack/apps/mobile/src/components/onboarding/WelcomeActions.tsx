import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';

export interface WelcomeActionsProps {
  onCreateAccount: () => void;
  onLogIn: () => void;
  onExploreDemo: () => void;
  busy?: boolean;
}

export function WelcomeActions({
  onCreateAccount,
  onLogIn,
  onExploreDemo,
  busy = false,
}: WelcomeActionsProps) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  const actions = [
    { key: 'createAccount', label: t('onboarding.welcome.createAccount'), onPress: onCreateAccount, primary: true },
    { key: 'logIn', label: t('onboarding.welcome.logIn'), onPress: onLogIn, primary: false },
    { key: 'exploreDemo', label: t('onboarding.welcome.exploreDemo'), onPress: onExploreDemo, primary: false },
  ] as const;

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text
          accessibilityRole="header"
          style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['3xl'] }}
        >
          SubTrack
        </Text>
        <Text
          style={{ color: color('ink.secondary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md }}
        >
          {t('onboarding.welcome.tagline')}
        </Text>
      </View>
      <View style={styles.actions}>
        {actions.map(({ key, label, onPress, primary }) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => { if (!busy) onPress(); }}
            style={{
              minHeight: 48,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 20,
              backgroundColor: color(busy ? 'bg.raised' : primary ? 'ink.primary' : 'bg.raised'),
              borderColor: color('ink.secondary'),
              borderRadius: theme.radius.pill,
              borderWidth: 1,
            }}
          >
            <Text
              style={{
                color: color(busy ? 'ink.secondary' : primary ? 'bg.canvas' : 'ink.primary'),
                fontFamily: theme.typography.fontFamily.ui,
                fontSize: theme.typography.fontSize.md,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  brand: { alignItems: 'center', gap: 8 },
  actions: { gap: 12, marginTop: 28 },
});
