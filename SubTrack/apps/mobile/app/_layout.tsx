import React from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Platform } from 'react-native';
import { RootProvider } from '@/providers/RootProvider';
import { EnrollmentProvider } from '@/state/EnrollmentFlow';
import manropeFont from '../assets/fonts/Manrope-VF.ttf';
import frauncesFont from '../assets/fonts/Fraunces-VF.ttf';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope: manropeFont,
    Fraunces: frauncesFont,
  });
  const ready = fontsLoaded || fontError != null;

  React.useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  const useSystemFonts = fontError != null;
  const systemFontFamily = Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'system-ui',
  });

  return (
    <RootProvider
      useSystemFonts={useSystemFonts}
      systemFontFamily={systemFontFamily}
    >
      <EnrollmentProvider><Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="register" />
        <Stack.Screen name="register-otp" />
        <Stack.Screen name="register-bankid" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack></EnrollmentProvider>
    </RootProvider>
  );
}
