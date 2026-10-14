import { Redirect } from 'expo-router';
import {sandboxBuildSelected} from '@/state/SandboxSession';

export default function IndexRoute() {
  return <Redirect href={sandboxBuildSelected()?'/personal':'/welcome'} />;
}
