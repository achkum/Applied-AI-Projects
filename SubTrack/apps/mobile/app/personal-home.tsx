import React from 'react';
import {NativePersonalRenewalsScreen} from '@/components/home/NativePersonalRenewalsScreen';
import {SandboxEntry} from '@/components/onboarding/SandboxEntry';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {createSandboxProjections} from '@/api/sandboxMobileProjections';
const projections=createSandboxProjections(sandboxMobileApi);
export default function RenewalsRoute(){return sandboxBuildSelected()?<NativePersonalRenewalsScreen useSession={useSandboxSession} readProjection={projections.readNativeRenewals} sandbox inactiveContent={<SandboxEntry notice={false}/>}/>:<NativePersonalRenewalsScreen/>;}
