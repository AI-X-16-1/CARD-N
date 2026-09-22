const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Removes permissions the app does not use from the generated manifest.
 *
 * Declaring a permission you never exercise is not free: Play asks about each one in the
 * Data safety form, and a sensitive permission with no feature behind it is a question
 * with no good answer. These four get in without anyone asking for them — either prebuild
 * injects them, or they were declared in app.json for a capability the code never grew.
 *
 * Only the *app* manifest is filtered, deliberately. A library that declares a permission
 * in its own manifest still merges it in, which is what keeps the debug build working:
 * React Native's debug source set declares SYSTEM_ALERT_WINDOW for the dev-menu overlay,
 * so that one survives in debug and disappears from release, which is exactly the split
 * we want. Using tools:node="remove" instead would strip it from both.
 */
const REMOVED = [
  // Prebuild injects it; nothing in the app draws over other apps. Play treats it as a
  // sensitive permission, so shipping it unused invites a review question.
  'android.permission.SYSTEM_ALERT_WINDOW',
  // expo-contacts is only ever read from - getContactsAsync and requestPermissionsAsync.
  'android.permission.WRITE_CONTACTS',
  // The picker asks for mediaTypes: ['images'] and MediaLibrary for MediaType.audio.
  // No video is ever read.
  'android.permission.READ_MEDIA_VIDEO',
];

// WRITE_EXTERNAL_STORAGE is deliberately NOT in that list, even though nothing in the app
// writes to shared storage. expo-file-system, expo-image-picker and expo-media-library
// each declare it in their own manifests, so filtering the app manifest does not reach it
// — only tools:node="remove" would, and that overrides what three libraries say they need
// on a platform version nobody here is testing on. They cap it at maxSdkVersion="32", so
// it is inert from Android 13 onwards. Not worth the risk for a shorter list.

module.exports = function withTrimmedPermissions(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const declared = manifest['uses-permission'] ?? [];

    manifest['uses-permission'] = declared.filter(
      (entry) => !REMOVED.includes(entry?.$?.['android:name'])
    );

    return modConfig;
  });
};
