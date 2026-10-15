import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSandboxSession } from '@/state/SandboxSession';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import { NativeProductBadge } from '@/components/billing/NativeProductUI';

export function SandboxNotice() {
  const { t } = useI18n();
  return <NativeProductBadge label={t('onboarding.sandbox.noticeShort')} />;
}
export function SandboxEntry({notice=true}:{notice?:boolean}={}) {
  const session = useSandboxSession(), { t, locale } = useI18n(), { theme, isDark } = useTheme();
  const [failed, setFailed] = useState(false), generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const text = { color: getColorByTheme(theme, isDark, 'ink.primary'), fontFamily: theme.typography.fontFamily.ui, fontSize: theme.typography.fontSize.md };
  const disabled = !session.available || session.phase === 'busy' || session.phase === 'storage-error';
  function enter() { const ticket = ++generation.current; setFailed(false);
    void (session.resumable ? session.login() : session.bootstrap(locale)).catch(() => { if (ticket === generation.current) setFailed(true); }); }
  return <View style={{ gap: 12 }}>{notice?<SandboxNotice />:null}
    {!session.available || failed ? <Text accessibilityRole="alert" style={text}>{t('onboarding.sandbox.unavailable')}</Text> : null}
    {session.phase === 'storage-error' ? <Text accessibilityRole="alert" style={text}>{t('onboarding.nativePersonal.storageError')}</Text> : null}
    <Text style={text}>{t('onboarding.sandbox.recovery')}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={enter}
      style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: getColorByTheme(theme, isDark, 'line.hairline'), borderRadius: theme.radius.card }}>
      <Text style={text}>{t(session.resumable ? 'onboarding.sandbox.resume' : 'onboarding.sandbox.enter')}</Text>
    </Pressable>
  </View>;
}
