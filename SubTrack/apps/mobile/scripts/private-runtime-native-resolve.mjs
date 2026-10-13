const bare = "require.resolve('@react-native/gradle-plugin/package.json')";
const scoped =
  "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })";

/** SDK51's first pluginManagement resolver must use RN's declared dependency. */
export function scopeGradlePluginResolution(contents) {
  if (
    typeof contents !== 'string' ||
    !contents.includes('com.facebook.react.settings')
  )
    throw new Error('Unrecognized native settings template');
  const bareCount = contents.split(bare).length - 1;
  const scopedCount = contents.split(scoped).length - 1;
  if (bareCount === 0 && scopedCount === 2) return contents;
  if (bareCount !== 1 || scopedCount !== 1)
    throw new Error('Unrecognized native plugin resolution');
  return contents.replace(bare, scoped);
}
