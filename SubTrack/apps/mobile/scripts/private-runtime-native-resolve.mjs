const bare = "require.resolve('@react-native/gradle-plugin/package.json')";
const scoped =
  "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })";

/** Recognize qualified SDK51 and SDK54 templates; never rewrite unknown native settings. */
export function scopeGradlePluginResolution(contents) {
  if (
    typeof contents !== 'string' ||
    !contents.includes('com.facebook.react.settings')
  )
    throw new Error('Unrecognized native settings template');
  const bareCount = contents.split(bare).length - 1;
  const scopedCount = contents.split(scoped).length - 1;
  if (contents.includes('expoAutolinking') || contents.includes('expo-autolinking-settings')) {
    if (bareCount === 0 && scopedCount === 1 &&
        contents.includes('id("expo-autolinking-settings")') &&
        contents.includes('expoAutolinking.useExpoModules()') &&
        contents.includes('includeBuild(expoAutolinking.reactNativeGradlePlugin)')) return contents;
    throw new Error('Unrecognized native SDK54 plugin resolution');
  }
  if (bareCount === 0 && scopedCount === 2) return contents;
  if (bareCount !== 1 || scopedCount !== 1)
    throw new Error('Unrecognized native plugin resolution');
  return contents.replace(bare, scoped);
}
