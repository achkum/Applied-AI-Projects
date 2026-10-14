import React from 'react';
import {NativeBillingMonthScreen} from '@/components/billing/NativeBillingMonthScreen';
import {SandboxEntry} from '@/components/onboarding/SandboxEntry';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {createSandboxProjections} from '@/api/sandboxMobileProjections';
const projections=createSandboxProjections(sandboxMobileApi);
export default function MonthRoute(){return sandboxBuildSelected()?<NativeBillingMonthScreen useSession={useSandboxSession} readProjection={projections.readBillingMonth} sandbox inactiveContent={<SandboxEntry notice={false}/>}/>:<NativeBillingMonthScreen/>;}
