import React from 'react';
import {Redirect} from 'expo-router';
import {NativePersonalBankScreen} from '@/components/banks/NativePersonalBankScreen';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
export default function BankRoute(){return sandboxBuildSelected()?<NativePersonalBankScreen useSession={useSandboxSession} api={sandboxMobileApi} requestKey={sandboxMobileApi.bankRequestKey} sandbox inactiveContent={<Redirect href="/welcome"/>}/>:<NativePersonalBankScreen/>;}
