import React from 'react';
import { Stack } from 'expo-router';
import { useI18n } from '@/context/I18nContext';

export default function TabsLayout() {
  const { locale } = useI18n();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name={locale}
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
