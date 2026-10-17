import React from 'react';
import {NativeBillingMonthScreen} from '@/components/billing/NativeBillingMonthScreen';
import {Redirect} from 'expo-router';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {createSandboxProjections} from '@/api/sandboxMobileProjections';
import {privateAnalyticsReader,sandboxAnalyticsReader} from '@/api/nativeAnalyticsAdapters';
const projections=createSandboxProjections(sandboxMobileApi);
export default function MonthRoute(){return sandboxBuildSelected()?<NativeBillingMonthScreen useSession={useSandboxSession} readProjection={projections.readBillingMonth} overviewReader={sandboxAnalyticsReader} sandbox inactiveContent={<Redirect href="/welcome"/>}/>:<NativeBillingMonthScreen overviewReader={privateAnalyticsReader}/>;}
