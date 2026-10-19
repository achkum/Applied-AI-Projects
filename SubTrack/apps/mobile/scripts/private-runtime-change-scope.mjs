import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import process from 'node:process';

// Only components fully exercised by signup/profile/restart/logout qualify.
// Shared controls, contracts, API, state, money, dependency and workflow edits
// deliberately fall through to full. Final delivery always selects full.
const PROFILE_PATHS = new Set([
  'SubTrack/apps/mobile/src/components/onboarding/WelcomeActions.tsx',
  'SubTrack/apps/mobile/src/components/onboarding/WelcomeActions.test.tsx',
  'SubTrack/apps/mobile/src/components/onboarding/IdentifierEntry.tsx',
  'SubTrack/apps/mobile/src/components/onboarding/IdentifierEntry.test.tsx',
  'SubTrack/apps/mobile/src/components/onboarding/NativeSessionExit.tsx',
  'SubTrack/apps/mobile/src/components/onboarding/NativeSessionExit.test.tsx',
]);
export function selectNativeChangeScope(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.some(path => typeof path !== 'string' || path.includes('..') || path.includes('\\') || !PROFILE_PATHS.has(path))) return 'full';
  return 'profile';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {ST_PROOF_BASE:base, ST_PROOF_HEAD:head, GITHUB_OUTPUT:output}=process.env;
  if (!/^[a-f0-9]{40}$/.test(base??'') || !/^[a-f0-9]{40}$/.test(head??'') || !output) throw new Error('Exact native scope revisions required');
  const paths=execFileSync('git',['diff','--name-only','--no-renames',base,head],{encoding:'utf8',maxBuffer:1048576}).trim().split('\n').filter(Boolean);
  const scope=selectNativeChangeScope(paths);
  appendFileSync(output,`scope=${scope}\nselection=profile-allowlist-v1\n`);
  process.stdout.write(`Native proof: ${scope}; ${paths.length} changed paths; exact base/head selection.\n`);
}
