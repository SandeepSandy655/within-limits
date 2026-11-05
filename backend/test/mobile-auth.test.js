const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const firebase = require('../src/config/firebaseAdmin');
let result;
firebase.getFirebaseAdminAuth = () => ({ verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (result instanceof Error) throw result; return result; } });
const { verifyMobileToken } = require('../src/middleware/mobileAuth');
const { normalizeCode, MAX_GROUP_DEVICES, MAX_LINKED_DEVICES_PER_HOST } = require('../src/services/connectionService');

test('mobile identity rejects missing, unverified, revoked and invalid tokens', async () => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
  await assert.rejects(verifyMobileToken(), { status: 401 });
  result = { uid: 'u', email: 'person@gmail.com', email_verified: false };
  await assert.rejects(verifyMobileToken('fixture'), { status: 403 });
  result = { uid: 'u', email_verified: true };
  await assert.rejects(verifyMobileToken('fixture'), { status: 403 });
  result = Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
  await assert.rejects(verifyMobileToken('fixture'), { status: 401 });
  result = new Error('unavailable');
  await assert.rejects(verifyMobileToken('fixture'), { status: 503 });
  result = { uid: 'u', email: 'person@gmail.com', email_verified: true, exp: 2000 };
  assert.deepEqual(await verifyMobileToken('fixture'), { uid: 'u', email: 'person@gmail.com', expiresAt: 2000000 });
});

test('verification opt-out still requires a valid email identity and revocation checks', async () => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  try {
    result = { uid: 'u', email: 'person@example.test', email_verified: false, exp: 2000 };
    assert.deepEqual(await verifyMobileToken('fixture'), { uid: 'u', email: 'person@example.test', expiresAt: 2000000 });
    await assert.rejects(verifyMobileToken(), { status: 401 });
    result = { uid: 'u', exp: 2000 };
    await assert.rejects(verifyMobileToken('fixture'), { status: 403 });
    result = Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
    await assert.rejects(verifyMobileToken('fixture'), { status: 401 });
    for (const value of ['true', '0', 'invalid', '']) {
      process.env.REQUIRE_EMAIL_VERIFICATION = value;
      result = { uid: 'u', email: 'person@example.test', email_verified: false, exp: 2000 };
      await assert.rejects(verifyMobileToken('fixture'), { status: 403 });
    }
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    await assert.rejects(verifyMobileToken('fixture'), { status: 403 });
  } finally { process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; }
});
test('pairing only accepts full codes, and the host consumes one of four spaces', () => {
  assert.equal(MAX_GROUP_DEVICES, 4); assert.equal(MAX_LINKED_DEVICES_PER_HOST, 3);
  assert.equal(normalizeCode('1234 5678'), '12345678');
  assert.equal(normalizeCode('1234-5678'), '12345678');
  for (const value of ['1234567', '123456789', 'host=12345678', 'https://x/12345678', null, 12345678]) assert.throws(() => normalizeCode(value));
});
