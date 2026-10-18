import React,{useCallback} from 'react';
import {useRouter,useLocalSearchParams,Redirect} from 'expo-router';
import {NativePersonalScreen} from '@/components/onboarding/NativePersonalScreen';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {sandboxAnalyticsReader} from '@/api/nativeAnalyticsAdapters';
export default function PersonalRoute(){const router=useRouter(),params=useLocalSearchParams<{setup?:string}>();const complete=useCallback((reason:'load'|'mutation')=>{if(reason==='mutation'||params.setup==='1')router.replace('/personal-billing-month');},[router,params.setup]);return sandboxBuildSelected()?<NativePersonalScreen useSession={useSandboxSession} api={sandboxMobileApi} detailReader={sandboxAnalyticsReader} sandbox inactiveContent={<Redirect href='/welcome'/>} onSetupComplete={complete}/>:<NativePersonalScreen onSetupComplete={complete}/>;}
