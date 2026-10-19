import React from 'react';
import {NativeHelpScreen} from '@/components/onboarding/NativeProfileTools';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
export default function PersonalHelpRoute(){return sandboxBuildSelected()?<NativeHelpScreen useSession={useSandboxSession}/>:<NativeHelpScreen/>;}
