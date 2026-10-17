import React from 'react';
import { Redirect } from 'expo-router';
import {useOnboarding} from '@/state/OnboardingAdapter';
export default function IndexRoute(){const session=useOnboarding();return <Redirect href={session.sessionPhase==='active'?{pathname:'/personal',params:{setup:'1'}}:'/welcome'}/>;}
