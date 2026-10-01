import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';
import { useI18n } from '@/context/I18nContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getColorByTheme } from '@/utils/colors';
import { formatMoney } from '@/utils/formatMoney';
import { RollingNumberProps } from './types';

const SPRING_CONFIG = { damping: 18, stiffness: 180 };

/**
 * Hero recurring-cost amount for the selected scope, with a monthly/annual
 * toggle. See docs/design/components/rolling-total.md.
 */
export function RollingNumber({
  amountMinorUnits,
  currencyCode,
  period,
  onPeriodChange,
  isUnavailable = false,
}: RollingNumberProps) {
  const { theme, isDark } = useTheme();
  const { t, locale } = useI18n();
  const reducedMotion = useReducedMotion();
  const color = (key: string) => getColorByTheme(theme, isDark, key);

  const rollProgress = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      rollProgress.value = 1;
      return;
    }
    rollProgress.value = 0;
    rollProgress.value = withSpring(1, SPRING_CONFIG);
  }, [amountMinorUnits, period, reducedMotion, rollProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: rollProgress.value,
    transform: [{ translateY: (1 - rollProgress.value) * 12 }],
  }));

  const periodLabel = t(`rollingNumber.period.${period}`);
  const displayValue =
    isUnavailable || amountMinorUnits === null
      ? null
      : formatMoney(amountMinorUnits, currencyCode, locale);

  const accessibleAmount = isUnavailable
    ? t('rollingNumber.unavailable')
    : displayValue === null
      ? t('rollingNumber.loading')
      : `${displayValue}, ${periodLabel}`;

  return (
    <View style={styles.container}>
      <Animated.View
        style={reducedMotion ? undefined : animatedStyle}
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibleAmount}
      >
        <Text
          style={[
            styles.hero,
            {
              color: color('ink.primary'),
              fontFamily: theme.typography.fontFamily.display,
              fontSize: theme.typography.fontSize.hero,
            },
          ]}
          allowFontScaling
        >
          {displayValue ?? (isUnavailable ? t('rollingNumber.unavailable') : t('rollingNumber.loading'))}
        </Text>
      </Animated.View>
      <View style={styles.toggleRow}>
        {(['monthly', 'annual'] as const).map((candidate) => {
          const selected = candidate === period;
          return (
            <Pressable
              key={candidate}
              onPress={() => onPeriodChange(candidate)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`rollingNumber.period.${candidate}`)}
              style={[
                styles.toggleOption,
                {
                  backgroundColor: selected
                    ? color('aurora.violet')
                    : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: selected ? color('bg.canvas') : color('ink.secondary'),
                  fontFamily: theme.typography.fontFamily.ui,
                }}
              >
                {t(`rollingNumber.period.${candidate}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  hero: {
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  toggleOption: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
});
