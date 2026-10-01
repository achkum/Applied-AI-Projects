import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
  cancelAnimation,
} from 'react-native-reanimated';

const REVOLUTION_MS = 240_000; // 1 revolution per 4 minutes

/**
 * Returns an Animated style object that rotates the view through 360° over 4 minutes.
 * Rotation is paused when the system reduced-motion preference is on.
 */
export function useOrbitRotation() {
  const rotation = useSharedValue(0);
  const isReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isReducedMotion) {
      cancelAnimation(rotation);
      rotation.value = 0;
    } else {
      rotation.value = withRepeat(
        withTiming(360, { duration: REVOLUTION_MS, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => {
      cancelAnimation(rotation);
    };
  }, [isReducedMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return { animatedStyle, isReducedMotion };
}
