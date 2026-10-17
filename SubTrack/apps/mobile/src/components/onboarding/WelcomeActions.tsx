import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { useI18n } from '@/context/I18nContext';
import { SubTrackBrand } from '@/components/branding/SubTrackBrand';
import { NativeProductButton } from '@/components/billing/NativeProductUI';

export interface WelcomeActionsProps {
  onCreateAccount: () => void;
  onLogIn: () => void;
  onExploreDemo?: () => void;
  busy?: boolean;
  environment?: 'production' | 'sandbox';
}

export function WelcomeActions({
  onCreateAccount,
  onLogIn,
  onExploreDemo,
  busy = false,
}: WelcomeActionsProps) {
  const { t } = useI18n();
  const {theme,isDark}=useTheme();
  const actions = [
    { key: 'createAccount', label: t('onboarding.welcome.createAccount'), onPress: onCreateAccount, primary: true },
    { key: 'logIn', label: t('onboarding.welcome.logIn'), onPress: onLogIn, primary: false },
    ...(onExploreDemo ? [{ key: 'exploreDemo', label: t('onboarding.welcome.exploreDemo'), onPress: onExploreDemo, primary: false }] : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.identity}><SubTrackBrand size={48} wordmark={false} /><Text accessibilityRole="header" style={{color:getColorByTheme(theme,isDark,'ink.primary'),fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize['2xl']}}>SubTrack</Text></View>
      <Text accessibilityRole="header" style={{textAlign:'center',color:getColorByTheme(theme,isDark,'ink.primary'),fontFamily:theme.typography.fontFamily.display,fontSize:theme.typography.fontSize.xl}}>{t('onboarding.welcome.tagline')}</Text>
      <View style={styles.actions}>
        {actions.map(({ key, label, onPress, primary }) => <NativeProductButton key={key} label={label}
          variant={primary ? 'primary' : 'secondary'} disabled={busy} onPress={() => { if (!busy) onPress(); }} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ identity: { alignItems: 'center', gap: 12 }, container: { width: '100%', gap: 20 }, actions: { gap: 10, marginTop: 8 } });
