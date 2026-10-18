import React from 'react';
import {Redirect} from 'expo-router';
import {NativeHouseholdScreen} from '@/components/household/NativeHouseholdScreen';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {useNativeSession} from '@/state/NativeSession';
import type {SandboxHouseholdApi} from '@/api/sandboxHouseholdApi';
import {sandboxAnalyticsReader} from '@/api/nativeAnalyticsAdapters';

const unavailable=async():Promise<never>=>{throw new Error('Household unavailable');};
const privateHouseholdApi:SandboxHouseholdApi={read:unavailable,mutate:unavailable};

export default function HouseholdRoute(){return sandboxBuildSelected()?<NativeHouseholdScreen useSession={useSandboxSession} detailReader={sandboxAnalyticsReader} inactiveContent={<Redirect href="/welcome"/>}/>:<NativeHouseholdScreen useSession={useNativeSession} api={privateHouseholdApi} readSubscriptions={unavailable}/>;}
