const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real service with native/Firebase boundaries stubbed. Loading the SDK
// without its native module throws, just as it does in Expo Go.
function loadService({ expoGo = false, nativeModule = true, platform = 'android', clientId = 'test-client', result } = {}) {
  const events = [];
  const sdk = {
    GoogleSignin: {
      configure: options => events.push(['configure', options.webClientId]),
      hasPlayServices: async options => events.push(['play-services', options.showPlayServicesUpdateDialog]),
      signIn: async () => result || { type: 'success', data: { idToken: 'test-token' } },
      signOut: async () => events.push(['sign-out']),
    },
    isSuccessResponse: response => response.type === 'success',
  };
  class GoogleAuthProvider {
    static credential(token) { return `credential:${token}`; }
    setCustomParameters(options) { events.push(['prompt', options.prompt]); }
  }
  const modules = {
    expo: { isRunningInExpoGo: () => expoGo },
    'react-native': {
      Platform: { OS: platform },
      TurboModuleRegistry: { get: name => {
        assert.equal(name, 'RNGoogleSignin');
        return nativeModule ? {} : null;
      } },
    },
    'firebase/auth': {
      GoogleAuthProvider,
      signInWithCredential: async (auth, credential) => events.push(['firebase', auth, credential]),
      signInWithPopup: async auth => events.push(['popup', auth]),
    },
    './firebaseAuth': { getFirebaseAuth: () => 'test-auth' },
  };
  const file = path.join(__dirname, '../src/services', platform === 'web' ? 'googleSignIn.web.ts' : 'googleSignIn.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: clientId } },
    require: name => {
      if (name === '@react-native-google-signin/google-signin') {
        events.push(['load-sdk']);
        if (!nativeModule) throw new Error('RNGoogleSignin could not be found');
        return sdk;
      }
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  }, { filename: file });
  return { service: exports, events };
}

test('Expo Go never loads the native Google SDK for sign-in or sign-out', async () => {
  const { service, events } = loadService({ expoGo: true, nativeModule: false });
  assert.match(service.googleSignInUnavailableReason(), /email sign-in in Expo Go/);
  await assert.rejects(service.signInWithGoogle(), /email sign-in in Expo Go/);
  await service.signOutGoogle();
  assert.deepEqual(events, []);
});

test('missing native modules are safe even when the runtime is not identified as Expo Go', async () => {
  for (const platform of ['android', 'ios']) {
    const { service, events } = loadService({ nativeModule: false, platform });
    assert.match(service.googleSignInUnavailableReason(), /build does not include Google sign-in/);
    await assert.rejects(service.signInWithGoogle(), /build does not include Google sign-in/);
    await service.signOutGoogle();
    assert.deepEqual(events, [], `${platform} must not evaluate the SDK entry point`);
  }
});

test('a missing OAuth client is reported before loading the native SDK', async () => {
  const { service, events } = loadService({ clientId: '  ' });
  await assert.rejects(service.signInWithGoogle(), /Use email sign-in.*credentials are configured/);
  await service.signOutGoogle();
  assert.deepEqual(events, []);
});

test('configured native builds exchange the Google token with Firebase and can sign out', async () => {
  for (const platform of ['android', 'ios']) {
    const { service, events } = loadService({ platform, clientId: ' test-client ' });
    assert.equal(service.googleSignInUnavailableReason(), null);
    await service.signInWithGoogle();
    await service.signOutGoogle();
    assert.deepEqual(events, [
      ['load-sdk'], ['configure', 'test-client'],
      ...(platform === 'android' ? [['play-services', true]] : []),
      ['firebase', 'test-auth', 'credential:test-token'], ['load-sdk'], ['sign-out'],
    ]);
  }
});

test('cancelled or tokenless Google responses never create a Firebase session', async () => {
  for (const [result, message] of [[{ type: 'cancelled' }, /cancelled/], [{ type: 'success', data: {} }, /sign-in token/]]) {
    const { service, events } = loadService({ result });
    await assert.rejects(service.signInWithGoogle(), message);
    assert.equal(events.some(([event]) => event === 'firebase'), false);
  }
});

test('web Google login remains available without native modules or Expo ownership checks', async () => {
  const { service, events } = loadService({ platform: 'web', expoGo: true, nativeModule: false, clientId: '' });
  assert.equal(service.googleSignInUnavailableReason(), null);
  await service.signInWithGoogle();
  await service.signOutGoogle();
  assert.deepEqual(events, [['prompt', 'select_account'], ['popup', 'test-auth']]);
});
