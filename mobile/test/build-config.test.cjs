const test = require('node:test');
const assert = require('node:assert/strict');
const { backendBuildSettings } = require('../config/build-backend.cjs');

test('only local builds opt into laptop HTTP and hosted builds require a usable HTTPS origin', () => {
  assert.equal(backendBuildSettings({ EAS_BUILD_PROFILE: 'preview-local', EXPO_PUBLIC_LOCAL_BACKEND: 'true' }).cleartext, true);
  assert.equal(backendBuildSettings({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_API_URL: 'https://api.example.com' }).cleartext, false);
  for (const url of ['', 'http://192.168.1.1:5000', 'http://public.example.com', 'https://127.0.0.1', 'https://192.168.1.1', 'https://api.example.com/api']) {
    assert.throws(() => backendBuildSettings({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_API_URL: url }));
  }
  assert.throws(() => backendBuildSettings({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_LOCAL_BACKEND: 'true' }));
});
