const test = require('node:test');
const assert = require('node:assert/strict');

test('development follows the current Metro or browser host instead of an old Wi-Fi address', async () => {
  const { resolveServerAddress } = await import('../src/services/serverAddress.ts');
  const development = { development: true, platform: 'android', physicalDevice: true };
  assert.equal(resolveServerAddress({ ...development, metroHost: '10.64.9.109:8081' }), 'http://10.64.9.109:5000');
  assert.equal(resolveServerAddress({ ...development, metroHost: 'exp://192.168.1.20:8081' }), 'http://192.168.1.20:5000');
  assert.equal(resolveServerAddress({ ...development, platform: 'web', metroHost: '10.64.9.109:8081', browserHostname: 'localhost' }), 'http://localhost:5000');
  assert.equal(resolveServerAddress({ ...development, platform: 'web', browserHostname: '192.168.1.20' }), 'http://192.168.1.20:5000');
});

test('explicit deployments, Android emulators, IPv6, and server rendering resolve safely', async () => {
  const { resolveServerAddress } = await import('../src/services/serverAddress.ts');
  const development = { development: true, platform: 'android', physicalDevice: false };
  assert.equal(resolveServerAddress({ ...development, configuredUrl: ' https://api.example.com/ ', metroHost: '10.64.9.109:8081' }), 'https://api.example.com');
  assert.equal(resolveServerAddress({ ...development, metroHost: 'localhost:8081' }), 'http://10.0.2.2:5000');
  assert.equal(resolveServerAddress({ ...development, platform: 'ios', metroHost: '[::1]:8081' }), 'http://[::1]:5000');
  assert.equal(resolveServerAddress({ development: true, platform: 'web' }), 'http://localhost:5000');
  assert.equal(resolveServerAddress({ development: false, platform: 'ios', metroHost: '10.64.9.109:8081' }), '');
});

test('laptop APK addresses are explicit and hosted builds reject private or insecure origins', async () => {
  const { validateBackendAddress, resolveServerAddress } = await import('../src/services/serverAddress.ts');
  assert.equal(validateBackendAddress(' http://192.168.1.25:5000/ ', true), 'http://192.168.1.25:5000');
  assert.equal(validateBackendAddress('https://api.example.com/'), 'https://api.example.com');
  assert.equal(resolveServerAddress({ development: false, platform: 'android', allowLocalBackend: true }), '');
  for (const value of ['http://example.com', 'http://192.168.1.25:5000', 'https://127.0.0.1', 'https://localhost', 'https://api.example.com/api', 'https://user:pass@example.com', 'https://api.example.com/?token=secret', 'javascript:alert(1)']) {
    assert.throws(() => validateBackendAddress(value));
  }
  assert.throws(() => validateBackendAddress('http://public.example.com', true));
});
