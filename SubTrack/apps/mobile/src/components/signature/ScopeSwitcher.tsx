import React, { useCallback } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { memberAccentForId } from '@subtrack/ui-tokens/member-accent';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { getColorByTheme } from '@/utils/colors';
import { Theme } from '@/types';
import { ScopeOption, ScopeSwitcherProps } from './types';

function accentFor(
  option: ScopeOption,
  color: (key: string) => string,
  theme: Theme,
  isDark: boolean,
): string {
  if (option.kind === 'me') return color('aurora.violet');
  if (option.kind === 'household') return color('aurora.green');
  const slot = memberAccentForId(option.memberId as string);
  const value = theme.memberAccent.slots[slot];
  if (!value) return color('ink.secondary');
  return isDark ? value.dark : value.light;
}

function labelFor(
  option: ScopeOption,
  t: (key: string) => string,
): string {
  if (option.kind === 'me') return t('scope.personal');
  if (option.kind === 'household') return t('navigation.household');
  return option.displayName ?? '';
}

/**
 * Segmented pill for switching the active Me/Household/member scope.
 * See docs/design/components/scope-switcher.md.
 */
export function ScopeSwitcher({
  options,
  selectedIndex,
  onSelect,
}: ScopeSwitcherProps) {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  const handleSelect = useCallback(
    (index: number) => {
      if (index === selectedIndex) return;
      const option = options[index];
      if (!option) return;
      onSelect(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        // Haptics are unavailable on some devices/platforms; selection still applies.
      });
      const label = labelFor(option, t);
      AccessibilityInfo.announceForAccessibility(
        t('scopeSwitcher.selectedAnnouncement', { scope: label }),
      );
    },
    [onSelect, options, selectedIndex, t],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[
        styles.container,
        {
          backgroundColor: color('bg.sunken'),
          borderRadius: theme.radius.pill,
        },
      ]}
      contentContainerStyle={styles.content}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const accent = accentFor(option, color, theme, isDark);
        const label = labelFor(option, t);
        return (
          <Pressable
            key={option.kind === 'member' ? option.memberId : option.kind}
            onPress={() => handleSelect(index)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              {
                backgroundColor: selected ? color('bg.raised') : 'transparent',
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <View
              style={[
                styles.avatarDot,
                { backgroundColor: accent, opacity: selected ? 1 : 0.5 },
              ]}
            />
            <Text
              style={{
                color: color('ink.primary'),
                fontFamily: theme.typography.fontFamily.ui,
                fontWeight: selected ? '600' : '400',
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  avatarDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
