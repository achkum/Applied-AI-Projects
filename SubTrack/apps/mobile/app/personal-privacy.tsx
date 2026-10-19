import React from 'react';
import {NativePrivacyScreen} from '@/components/onboarding/NativeProfileTools';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
const api={readNativeBank:sandboxMobileApi.readNativeBank};
export default function PersonalPrivacyRoute(){return sandboxBuildSelected()?<NativePrivacyScreen useSession={useSandboxSession} api={api}/>:<NativePrivacyScreen/>;}
