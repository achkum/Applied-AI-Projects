import React from 'react';
import {NativePersonalBankScreen} from '@/components/banks/NativePersonalBankScreen';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {bankRequestKey} from '@/api/privateMobileBank';
const api={readNativeBank:sandboxMobileApi.readNativeBank,mutateNativeBank:sandboxMobileApi.mutateNativeBank,bankRequestKey};
export default function PersonalBankRoute(){return sandboxBuildSelected()?
 <NativePersonalBankScreen useSession={useSandboxSession} api={api} sandbox/>:<NativePersonalBankScreen/>;}
