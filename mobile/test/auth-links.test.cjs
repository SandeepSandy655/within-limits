const test = require('node:test');
const assert = require('node:assert/strict');

test('verification emails return to the web login or the current Expo Go server', async () => {
  const { verificationContinueUrl } = await import('../src/services/authLinks.ts');
  assert.equal(verificationContinueUrl({ webOrigin: 'http://localhost:8081' }), 'http://localhost:8081/sign-in?verification=complete');
  const result = new URL(verificationContinueUrl({ metroHost: '192.168.1.20:8081', appReturnUrl: 'exp://192.168.1.20:8081/--/sign-in' }));
  assert.equal(result.origin, 'http://192.168.1.20:8081');
  assert.equal(result.pathname, '/sign-in');
  assert.equal(result.searchParams.get('appReturn'), 'exp://192.168.1.20:8081/--/sign-in?verification=complete');
});

test('release verification uses the configured hosted page without leaking existing query data', async () => {
  const { verificationContinueUrl } = await import('../src/services/authLinks.ts');
  const result = new URL(verificationContinueUrl({ configuredUrl: 'https://app.example.com/sign-in?oobCode=old#fragment', metroHost: 'localhost:8081', appReturnUrl: 'withinlimits://sign-in' }));
  assert.equal(result.origin, 'https://app.example.com');
  assert.equal(result.searchParams.get('oobCode'), null);
  assert.equal(result.hash, '');
  assert.equal(result.searchParams.get('appReturn'), 'withinlimits://sign-in?verification=complete');
  assert.equal(verificationContinueUrl({}), undefined);
  assert.throws(() => verificationContinueUrl({ configuredUrl: 'exp://localhost:8081' }), /HTTP/);
});

test('app return links cannot redirect to unrelated sites, actions, or credential-bearing URLs', async () => {
  const { verificationAppReturn } = await import('../src/services/authLinks.ts');
  for (const value of ['https://evil.example', 'javascript:alert(1)', 'withinlimits://connect?code=12345678', 'exp://localhost:8081/--/connect', 'withinlimits://user:pass@sign-in', 'withinlimits://sign-in#fragment']) {
    assert.equal(verificationAppReturn(value), null, value);
  }
  assert.equal(verificationAppReturn('withinlimits://sign-in?oobCode=secret&redirect=evil'), 'withinlimits://sign-in?verification=complete');
});
