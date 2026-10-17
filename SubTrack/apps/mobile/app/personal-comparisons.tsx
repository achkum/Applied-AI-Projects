import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { NativeComparisonsScreen } from '@/components/insights/NativeComparisonsScreen';
import { sandboxBuildSelected, useSandboxSession } from '@/state/SandboxSession';
import { privateAnalyticsReader, sandboxAnalyticsReader } from '@/api/nativeAnalyticsAdapters';
export default function ComparisonsRoute() {
  const params = useLocalSearchParams<{ subscriptionId?: string | string[] }>();
  const selected = typeof params.subscriptionId === 'string' ? { initialSubscriptionId: params.subscriptionId } : {};
  return sandboxBuildSelected() ? <NativeComparisonsScreen {...selected} useSession={useSandboxSession} reader={sandboxAnalyticsReader} inactiveContent={<Redirect href="/welcome" />} /> : <NativeComparisonsScreen {...selected} reader={privateAnalyticsReader} />;
}
