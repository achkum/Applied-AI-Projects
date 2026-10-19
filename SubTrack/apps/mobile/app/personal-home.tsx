import React from 'react';
import {NativePersonalRenewalsScreen} from '@/components/home/NativePersonalRenewalsScreen';
import {Redirect} from 'expo-router';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {createSandboxProjections} from '@/api/sandboxMobileProjections';
const projections=createSandboxProjections(sandboxMobileApi);
export default function RenewalsRoute(){return sandboxBuildSelected()?<NativePersonalRenewalsScreen useSession={useSandboxSession} readProjection={projections.readNativeRenewals} sandbox inactiveContent={<Redirect href="/welcome"/>}/>:<NativePersonalRenewalsScreen/>;}
