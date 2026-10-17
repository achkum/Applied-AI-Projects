import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectNativeChangeScope} from './private-runtime-change-scope.mjs';
test('automatically narrows only complete profile-flow dependencies',()=>{
  assert.equal(selectNativeChangeScope(['SubTrack/apps/mobile/src/components/onboarding/WelcomeActions.tsx']),'profile');
  assert.equal(selectNativeChangeScope(['SubTrack/apps/mobile/src/components/onboarding/WelcomeActions.tsx','SubTrack/apps/mobile/src/components/onboarding/NativeSessionExit.test.tsx']),'profile');
});
test('shared/unknown/empty/renamed paths and dependency changes retain full qualification',()=>{
  for(const paths of [[],null,['../WelcomeActions.tsx'],['SubTrack/apps/api/src/sandbox/sandbox-http.ts'],['SubTrack/pnpm-lock.yaml'],['SubTrack/apps/mobile/src/components/onboarding/NativePersonalScreen.tsx'],['.github/workflows/subtrack-native-device-proof.yml'],['SubTrack/apps/mobile/src/components/onboarding/WelcomeActions.tsx','SubTrack/packages/contracts/openapi.yaml']])assert.equal(selectNativeChangeScope(paths),'full');
});
