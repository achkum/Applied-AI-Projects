import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { computeOrbitLayout } from './orbitMath';
import { useOrbitRotation } from './useOrbitRotation';
import { OrbitListFallback } from './OrbitListFallback';
import type { OrbitSubscription } from './types';

/** Map category slug → colour hex. Host theme overrides these via a theme provider. */
const CATEGORY_COLORS: Record<string, string> = {
  streaming:    '#7C3AED',
  fitness:      '#10B981',
  productivity: '#3B82F6',
  gaming:       '#F59E0B',
  music:        '#EC4899',
  cloud:        '#6366F1',
  news:         '#F97316',
  other:        '#6B7280',
};

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] ?? CATEGORY_COLORS['other'];
}

export interface OrbitProps {
  subscriptions: OrbitSubscription[];
  onBodyPress?: (id: string) => void;
  activeId?: string;
  /** Force list view regardless of reduced-motion preference. */
  forceList?: boolean;
  style?: ViewStyle;
}

export function Orbit({ subscriptions, onBodyPress, activeId, forceList, style }: OrbitProps) {
  const { animatedStyle, isReducedMotion } = useOrbitRotation();
  const { bodies, size, centre } = computeOrbitLayout(subscriptions);

  const showList = forceList ?? isReducedMotion;

  const handlePress = useCallback(
    (id: string) => {
      onBodyPress?.(id);
    },
    [onBodyPress],
  );

  if (showList) {
    return (
      <OrbitListFallback
        subscriptions={subscriptions}
        onItemPress={handlePress}
        activeId={activeId}
      />
    );
  }

  // Unique rings for track rendering
  const usedRings = [...new Set(bodies.map((b) => b.ring))].sort((a, z) => a - z);
  const ringRadii = [48, 104, 160, 216];

  return (
    <View
      style={[styles.container, { width: size, height: size }, style]}
      accessibilityRole="none"
      accessibilityLabel="Subscription orbit"
    >
      {/* Static ring tracks */}
      {usedRings.map((ring) => {
        const r = ringRadii[Math.min(ring, ringRadii.length - 1)] ?? ringRadii[ringRadii.length - 1];
        const diameter = r * 2;
        return (
          <View
            key={`track-${ring}`}
            style={[
              styles.ringTrack,
              {
                width: diameter,
                height: diameter,
                borderRadius: r,
                top: centre - r,
                left: centre - r,
              },
            ]}
          />
        );
      })}

      {/* Centre "Me" body */}
      <View
        style={[
          styles.centreBody,
          {
            top: centre - 14,
            left: centre - 14,
          },
        ]}
      >
        <Text style={styles.centreMeText}>Me</Text>
      </View>

      {/* Rotating subscription bodies */}
      <Animated.View
        style={[StyleSheet.absoluteFill, animatedStyle]}
        // transform-origin is not directly available in RN; use a workaround:
        // the Animated.View fills the container, so rotation is around centre automatically.
      >
        {bodies.map((body) => {
          const isActive = body.id === activeId;
          const color = categoryColor(body.subscription.category);
          const diameter = body.r * 2;
          return (
            <Pressable
              key={body.id}
              onPress={() => handlePress(body.id)}
              accessibilityRole="button"
              accessibilityLabel={body.subscription.name}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.body,
                {
                  width: diameter,
                  height: diameter,
                  borderRadius: body.r,
                  backgroundColor: color,
                  top: centre + body.dy - body.r,
                  left: centre + body.dx - body.r,
                  borderWidth: isActive ? 2 : 0,
                  borderColor: isActive ? '#fff' : undefined,
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  ringTrack: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'transparent',
  },
  centreBody: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a2e',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  centreMeText: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  body: {
    position: 'absolute',
  },
});
