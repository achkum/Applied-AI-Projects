export function initialIdentifierFlow(platform) {
  if (platform === 'android') return 'private-runtime-identifier-android.yaml';
  if (platform === 'ios') return 'private-runtime-identifier.yaml';
  throw new Error('Unrecognized native platform');
}
