const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const eas = require('../eas.json');
const args = process.argv.slice(2);
const profileName = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : (process.env.EAS_BUILD_PROFILE || 'preview-local');
function profile(name, seen = new Set()) {
  if (!eas.build[name] || seen.has(name)) throw new Error(`Invalid build profile: ${name}`);
  seen.add(name);
  const current = eas.build[name];
  const base = current.extends ? profile(current.extends, seen) : {};
  return { ...base, ...current, env: { ...base.env, ...current.env }, android: { ...base.android, ...current.android } };
}
try {
  const build = profile(profileName);
  Object.assign(process.env, build.env, { EAS_BUILD_PROFILE: profileName });
  const config = require('../app.config.js')({ config: require('../app.json').expo });
  const google = require('../src/google-services.json');
  if (!google.client.some((client) => client.client_info?.android_client_info?.package_name === config.android.package)) throw new Error('Android package does not match src/google-services.json.');
  for (const asset of [config.icon, config.android.googleServicesFile, config.android.adaptiveIcon.foregroundImage]) {
    if (!fs.existsSync(path.resolve(root, asset))) throw new Error(`Missing Android build asset: ${asset}`);
  }
  for (const dependency of ['expo-build-properties', 'react-native-keyboard-controller']) require.resolve(dependency, { paths: [root] });
  console.log(`Build configuration passed: ${profileName} (${build.android.buildType || 'development client'}).`);
  console.log(`Android package: ${config.android.package}`);
  console.log(process.env.EXPO_PUBLIC_LOCAL_BACKEND === 'true' ? 'Enter the laptop backend address in the installed app; no fixed IP is baked in.' : 'The build uses the configured public HTTPS backend.');
  if (!config.extra?.eas?.projectId) console.log('Before the first cloud build, run npx eas-cli@latest init to link your Expo project.');
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) console.log('Email sign-in is available. Configure the Google Web client ID and Android signing SHA fingerprints before enabling Google sign-in.');
} catch (error) { console.error(`Build setup needs attention: ${error.message}`); process.exitCode = 1; }
