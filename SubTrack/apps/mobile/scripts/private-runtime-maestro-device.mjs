// Maestro cli-2.11.0 App.kt defines these as global options. PrintHierarchyCommand
// consumes the parent deviceId, so keep them before both `test` and `hierarchy`.
// https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-cli/src/main/java/maestro/cli/App.kt
export function maestroDevicePrefix(platform, environment) {
  if (platform === 'android') return Object.freeze([]);
  if (platform !== 'ios') throw new Error('Unsupported owned device platform');
  const udid = environment?.SUBTRACK_SIMULATOR_UDID;
  if (typeof udid !== 'string' || !/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(udid)) {
    throw new Error('Owned iOS simulator identifier required');
  }
  return Object.freeze(['--device', udid, '--platform', 'ios']);
}
