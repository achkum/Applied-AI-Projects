import React from 'react';
import {NativeDetectionInboxScreen} from '@/components/detection/NativeDetectionInboxScreen';
import {sandboxBuildSelected,useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
import {bankRequestKey as detectionRequestKey} from '@/api/privateMobileBank';
import {readAllOwnerSubscriptions} from '@/api/privateMobileSubscriptionList';
const api={readNativeDetections:sandboxMobileApi.readNativeDetections,mutateNativeDetection:sandboxMobileApi.mutateNativeDetection,detectionRequestKey,
 readDetectionOwnerRows:async(token:string,signal:AbortSignal)=>(await readAllOwnerSubscriptions(cursor=>sandboxMobileApi.readNativeSubscriptions(token,signal,cursor),signal)).items};
export default function PersonalDetectionsRoute(){return sandboxBuildSelected()?
 <NativeDetectionInboxScreen useSession={useSandboxSession} api={api}/>:<NativeDetectionInboxScreen/>;}
