import React, { useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  normalizeIdentifier,
  type IdentifierChannel,
  type IdentifierResult,
  type IdentifierValidationCode,
} from '@subtrack/contracts/identifiers';
import { useI18n } from '@/context/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';

export interface IdentifierEntryProps {
  onValidIdentifier: (result: Extract<IdentifierResult, { valid: true }>) => void;
}

export function IdentifierEntry({ onValidIdentifier }: IdentifierEntryProps) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const [channel, setChannel] = useState<IdentifierChannel>('email');
  const [value, setValue] = useState('');
  const [error, setError] = useState<IdentifierValidationCode | null>(null);
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  const label = t(`onboarding.identifier.${channel}Label`);
  const canContinue = normalizeIdentifier(channel, value).valid;

  const submit = () => {
    const result = normalizeIdentifier(channel, value);
    if (!result.valid) {
      setError(result.code);
      return;
    }
    setError(null);
    onValidIdentifier(result);
  };

  const selectChannel = (next: IdentifierChannel) => {
    if (next === channel) return;
    setChannel(next);
    setValue('');
    setError(null);
  };

  return (
    <View style={styles.container}>
      <Text accessibilityRole="text" style={[styles.label, { color: color('ink.primary'), fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.ui }]}>
        {t('onboarding.identifier.channelLabel')}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.channels}>
        {(['email', 'phone'] as const).map((option) => {
          const selected = channel === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={t(`onboarding.identifier.${option}Channel`)}
              accessibilityState={{ selected }}
              onPress={() => selectChannel(option)}
              style={[styles.channel, {
                backgroundColor: selected ? color('bg.raised') : color('bg.sunken'),
                borderColor: selected ? color('ink.primary') : color('ink.secondary'),
                borderRadius: theme.radius.pill,
              }]}
            >
              <Text style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.ui }}>
                {t(`onboarding.identifier.${option}Channel`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text nativeID="identifier-entry-label" style={[styles.label, { color: color('ink.primary'), fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.ui }]}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ? t(`onboarding.identifier.errors.${error}`) : undefined}
        value={value}
        onChangeText={(next) => { setValue(next); setError(null); }}
        onBlur={() => {
          if (value.trim()) {
            const result = normalizeIdentifier(channel, value);
            setError(result.valid ? null : result.code);
          }
        }}
        keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={channel === 'email' ? 'emailAddress' : 'telephoneNumber'}
        returnKeyType="done"
        onSubmitEditing={() => { submit(); Keyboard.dismiss(); }}
        style={[styles.input, {
          color: color('ink.primary'),
          backgroundColor: color('bg.raised'),
          borderColor: error ? color('ember.amber') : color('ink.secondary'),
          borderRadius: theme.radius.card,
          fontFamily: theme.typography.fontFamily.ui,
          fontSize: theme.typography.fontSize.md,
        }]}
      />
      {error && (
        <Text accessibilityRole="alert" style={[styles.error, { color: color('ink.primary'), fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.ui }]}>
          {t(`onboarding.identifier.errors.${error}`)}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.identifier.continueLabel')}
        accessibilityState={{ disabled: !canContinue }}
        disabled={!canContinue}
        onPress={submit}
        style={[styles.continue, {
          backgroundColor: color(canContinue ? 'ink.primary' : 'bg.raised'),
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: color('ink.secondary'),
        }]}
      >
        <Text style={{ color: color(canContinue ? 'bg.raised' : 'ink.secondary'), fontFamily: theme.typography.fontFamily.ui }}>
          {t('onboarding.identifier.continueLabel')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  channels: { flexDirection: 'row', gap: 8 },
  channel: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  label: { fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 1, paddingHorizontal: 16 },
  error: {},
  continue: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
});
