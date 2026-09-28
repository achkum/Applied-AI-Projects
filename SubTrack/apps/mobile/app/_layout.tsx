import React from 'react';
import { Stack } from 'expo-router';
import SplashScreen from 'expo-splash-screen';
import { RootProvider } from '@/providers/RootProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  React.useEffect(() => {
    const hideSplash = async () => {
      await SplashScreen.hideAsync();
    };
    hideSplash();
  }, []);

  return (
    <RootProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </RootProvider>
  );
}
