import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/context/I18nContext';
import { SubTrackBrand } from '@/components/branding/SubTrackBrand';
import { NativeProductBadge, NativeProductButton, NativeProductHeading } from '@/components/billing/NativeProductUI';

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
  environment = 'production',
}: WelcomeActionsProps) {
  const { t } = useI18n();
  const actions = [
    { key: 'createAccount', label: t('onboarding.welcome.createAccount'), onPress: onCreateAccount, primary: true },
    { key: 'logIn', label: t('onboarding.welcome.logIn'), onPress: onLogIn, primary: false },
    ...(onExploreDemo ? [{ key: 'exploreDemo', label: t('onboarding.welcome.exploreDemo'), onPress: onExploreDemo, primary: false }] : []),
  ];

  return (
    <View style={styles.container}>
      <SubTrackBrand size={48} />
      <NativeProductHeading title={t('onboarding.welcome.tagline')} />
      {environment === 'sandbox' ? <NativeProductBadge label={t('onboarding.sandbox.noticeShort')} /> : null}
      <View style={styles.actions}>
        {actions.map(({ key, label, onPress, primary }) => <NativeProductButton key={key} label={label}
          variant={primary ? 'primary' : 'secondary'} disabled={busy} onPress={() => { if (!busy) onPress(); }} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ container: { width: '100%', gap: 20 }, actions: { gap: 10, marginTop: 8 } });
