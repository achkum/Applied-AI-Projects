import React from 'react';
import {Redirect} from 'expo-router';
import {NativePersonalScreen} from '@/components/onboarding/NativePersonalScreen';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {sandboxHouseholdApi} from '@/api/sandboxHouseholdApi';
export default function PersonalProfileRoute(){return sandboxBuildSelected()?<NativePersonalScreen page="profile" useSession={useSandboxSession} api={sandboxMobileApi} readHousehold={sandboxHouseholdApi.read} sandbox inactiveContent={<Redirect href="/welcome"/>}/>:<NativePersonalScreen page="profile"/>;}
