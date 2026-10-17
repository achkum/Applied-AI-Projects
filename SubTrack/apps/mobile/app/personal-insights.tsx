import React from 'react';
import { Redirect } from 'expo-router';
import { NativeInsightsScreen } from '@/components/insights/NativeInsightsScreen';
import { sandboxBuildSelected, useSandboxSession } from '@/state/SandboxSession';
import { privateAnalyticsReader, sandboxAnalyticsReader } from '@/api/nativeAnalyticsAdapters';
export default function InsightsRoute() {
  return sandboxBuildSelected() ? <NativeInsightsScreen useSession={useSandboxSession} reader={sandboxAnalyticsReader} inactiveContent={<Redirect href="/welcome" />} /> : <NativeInsightsScreen reader={privateAnalyticsReader} />;
}
