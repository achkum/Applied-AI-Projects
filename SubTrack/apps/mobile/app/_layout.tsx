import React from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Platform } from 'react-native';
import {SafeAreaProvider,initialWindowMetrics} from 'react-native-safe-area-context';
import { RootProvider } from '@/providers/RootProvider';
import { EnrollmentProvider } from '@/state/EnrollmentFlow';
import { NativeSessionProvider } from '@/state/NativeSession';
import manropeFont from '../assets/fonts/Manrope-VF.ttf';
import frauncesFont from '../assets/fonts/Fraunces-VF.ttf';

import geist400 from '../assets/fonts/Geist-Regular.ttf';
import geist500 from '../assets/fonts/Geist-Medium.ttf';
import geist600 from '../assets/fonts/Geist-SemiBold.ttf';
import bricolage600 from '../assets/fonts/BricolageGrotesque-SemiBold.ttf';
import bricolage700 from '../assets/fonts/BricolageGrotesque-Bold.ttf';
import bricolage800 from '../assets/fonts/BricolageGrotesque-ExtraBold.ttf';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(Platform.OS === 'android' || Platform.OS === 'ios' ? {Geist400:geist400,Geist500:geist500,Geist600:geist600,Bricolage600:bricolage600,Bricolage700:bricolage700,Bricolage800:bricolage800} : {Manrope:manropeFont,Fraunces:frauncesFont});
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
    <SafeAreaProvider initialMetrics={initialWindowMetrics}><RootProvider
      useSystemFonts={useSystemFonts}
      systemFontFamily={systemFontFamily}
    >
      <NativeSessionProvider><EnrollmentProvider><Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="register" />
        <Stack.Screen name="register-otp" />
        <Stack.Screen name="register-bankid" />
        <Stack.Screen name="personal" />
        <Stack.Screen name="personal-home" />
        <Stack.Screen name="personal-billing-month" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack></EnrollmentProvider></NativeSessionProvider>
    </RootProvider></SafeAreaProvider>
  );
}
