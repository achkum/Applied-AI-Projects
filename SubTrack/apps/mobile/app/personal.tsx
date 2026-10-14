import React from 'react';
import {NativePersonalScreen} from '@/components/onboarding/NativePersonalScreen';
import {SandboxEntry} from '@/components/onboarding/SandboxEntry';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
export default function PersonalRoute(){return sandboxBuildSelected()?<NativePersonalScreen useSession={useSandboxSession} api={sandboxMobileApi} sandbox inactiveContent={<SandboxEntry notice={false}/>}/>:<NativePersonalScreen/>;}
