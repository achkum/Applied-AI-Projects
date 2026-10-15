import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { getColorByTheme } from '@/utils/colors';
import geometry from '../../../assets/brand/geometry.json';

/** Shared product identity; environment variants never replace the brand. */
export function SubTrackBrand({ size = 44, wordmark = true }: { size?: number; wordmark?: boolean }) {
  const { theme, isDark } = useTheme();
  const color = (key: string) => getColorByTheme(theme, isDark, key);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Svg width={size} height={size} viewBox={geometry.viewBox} accessible={false}>
        <Rect width={64} height={64} rx={18} fill={color('action.accent')} />
        <Path d={geometry.track} stroke={color('ink.on-accent')} strokeWidth={geometry.strokeWidth} strokeLinecap="square" fill="none" />
      </Svg>
      {wordmark && <Text accessibilityRole="header" style={{ color: color('ink.primary'), fontFamily: theme.typography.fontFamily.display, fontSize: theme.typography.fontSize['2xl'] }}>SubTrack</Text>}
    </View>
  );
}
