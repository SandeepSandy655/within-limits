// Run against Metro with: node --test test/browser/*.test.cjs
// Requires Playwright (or PLAYWRIGHT_MODULE pointing to an existing installation).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let origin = process.env.TEST_APP_URL || 'http://localhost:8085';
let browser, server;
before(async () => {
  if (process.env.TEST_WEB_EXPORT) {
    const root = path.resolve(process.env.TEST_WEB_EXPORT);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    server = http.createServer((req, res) => {
      const requested = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (requested !== root && !requested.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const file = [requested, requested + '.html', path.join(requested, 'index.html')].find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
      if (!file) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  } else {
    const deadline = Date.now() + 120000;
    while (true) {
      try { if ((await fetch(`${origin}/status`, { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* Metro is still starting. */ }
      if (Date.now() >= deadline) throw new Error(`Metro is not ready at ${origin}. Start the development server before running browser checks.`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
});
after(async () => { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

async function captureScreen(page, name) {
  if (!process.env.TEST_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.TEST_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR, `${name}.png`) });
}

async function session(t, verified = true, fixtures = {}) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, geolocation: { latitude: 12.97, longitude: 77.59, accuracy: 10 } });
  t.after(() => context.close());
  const state = { verified, requireEmailVerification: true, lookups: 0, sends: [], applied: 0, refreshes: 0, deviceRequests: 0, signInAttempts: 0, errors: [],
    device: null, connections: [], notifications: [], approvals: [], sharingChanges: [], ...fixtures };
  const connections = () => typeof state.connections === 'function' ? state.connections(state.device) : state.connections;
  const email = 'navigation-test@example.test';
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'none' })}.${encode({ sub: 'test-user', user_id: 'test-user', email, email_verified: state.verified, auth_time: now, iat: now, exp: now + 3600, aud: 'demo-within-limits', iss: 'https://securetoken.google.com/demo-within-limits', firebase: { sign_in_provider: 'password' } })}.test`;
  };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (request.method() === 'OPTIONS') return json({});
    if (url.pathname === '/api/auth/config') return json({ success: true, requireEmailVerification: state.requireEmailVerification, firebase: { apiKey: 'test-api-key', authDomain: 'demo-within-limits.firebaseapp.com', projectId: 'demo-within-limits', appId: 'test-app' } });
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      const body = request.postDataJSON() || {};
      if (url.pathname.endsWith('accounts:lookup')) { state.lookups++; return json({ users: [{ localId: 'test-user', email, emailVerified: state.verified, providerUserInfo: [{ providerId: 'password', email, rawId: email }], createdAt: '1700000000000', lastLoginAt: '1700000000000' }] }); }
      if (url.pathname.endsWith('accounts:signInWithPassword')) {
        state.signInAttempts++;
        if (state.signInError) return json({ error: { message: state.signInError } }, 400);
        return json({ localId: 'test-user', email, idToken: token(), refreshToken: 'test-refresh', expiresIn: '3600' });
      }
      if (url.pathname.endsWith('accounts:signUp')) return json({ localId: 'test-user', email, idToken: token(), refreshToken: 'test-refresh', expiresIn: '3600' });
      if (url.pathname.endsWith('accounts:sendOobCode')) { state.sends.push(body); return json({ email }); }
      if (url.pathname.endsWith('accounts:resetPassword')) return body.oobCode === 'valid-verification' ? json({ email, requestType: 'VERIFY_EMAIL' }) : json({ error: { message: 'INVALID_OOB_CODE' } }, 400);
      if (url.pathname.endsWith('accounts:update')) { state.verified = true; state.applied++; return json({ email, localId: 'test-user', emailVerified: true }); }
      if (url.pathname.endsWith('/projects')) return json({ authorizedDomains: ['localhost', '127.0.0.1'] });
      throw new Error(`Unexpected Firebase request: ${url.pathname}`);
    }
    if (url.hostname === 'securetoken.googleapis.com') { state.refreshes++; return json({ access_token: token(), id_token: token(), token_type: 'Bearer', refresh_token: 'test-refresh', expires_in: '3600', user_id: 'test-user', project_id: 'demo-within-limits' }); }
    if (url.pathname.startsWith('/api/')) {
      state.deviceRequests++;
      if (url.pathname === '/api/devices/register') {
        state.device = { ...request.postDataJSON(), connectionCode: '12345678', sharingEnabled: false };
        return json({ success: true, device: state.device });
      }
      if (url.pathname === `/api/devices/${state.device?.deviceId}`) return json({ success: true, device: state.device });
      if (url.pathname === '/api/devices/sharing') {
        const body = request.postDataJSON(); state.sharingChanges.push(body.sharingEnabled);
        state.device.sharingEnabled = body.sharingEnabled;
        return json({ success: true });
      }
      if (url.pathname.startsWith('/api/connections/device/')) return json({ success: true, connections: connections() });
      if (url.pathname === '/api/connections/accept') {
        const body = request.postDataJSON(); state.approvals.push(body);
        state.connections = connections().map((connection) => connection._id === body.connectionId ? { ...connection, status: 'accepted', rangeMeters: body.rangeMeters } : connection);
        return json({ success: true, connection: connections().find((connection) => connection._id === body.connectionId) });
      }
      if (url.pathname.startsWith('/api/notifications/device/')) return json({ success: true,
        notifications: state.notifications.map((notification) => ({ ...notification, deviceId: state.device.deviceId })),
        unreadCount: state.notifications.filter((notification) => !notification.readAt).length });
      if (url.pathname === '/api/notifications/read') {
        const body = request.postDataJSON();
        state.notifications = state.notifications.map((notification) => body.ids.includes(notification.id) ? { ...notification, readAt: new Date().toISOString() } : notification);
        return json({ success: true });
      }
      return json({ success: true, connections: [], devices: [] });
    }
    if (url.pathname.startsWith('/socket.io/')) return json({}, 503);
    // Never use a real Firebase project, backend account, mail service, or map service in these checks.
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => state.errors.push(error.message));
  page.on('console', (message) => {
    // Socket/map requests are deliberately blocked by the fixture; React errors must still fail the check.
    if (message.type() === 'error' && !/^(Failed to load resource:|WebSocket connection to )/.test(message.text())) state.errors.push(message.text());
  });
  page.setDefaultTimeout(60000);
  const open = (path) => page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const login = async () => {
    await open('/sign-in');
    await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill(email);
    await page.getByLabel('PASSWORD', { exact: true }).fill('Example-password-123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (state.verified || !state.requireEmailVerification) await page.getByRole('tab', { name: 'Home', exact: true }).waitFor();
    else await page.getByRole('button', { name: 'I’ve verified my email', exact: true }).waitFor();
  };
  return { page, state, open, login };
}

test('web login finishes loading and remains stable while idle', async (t) => {
  const { page, state, open } = await session(t);
  const pendingBundles = new Set();
  let bundleRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.bundle')) { bundleRequests++; pendingBundles.add(request); }
  });
  page.on('requestfinished', (request) => pendingBundles.delete(request));
  page.on('requestfailed', (request) => pendingBundles.delete(request));
  const coldStart = Date.now();
  await open('/sign-in');
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).waitFor();
  t.diagnostic(`Initial login load: ${Date.now() - coldStart} ms`);
  const loadedBundleRequests = bundleRequests;
  await page.waitForTimeout(process.env.TEST_DEV_PERFORMANCE ? 30000 : 5000);
  assert.equal(new URL(page.url()).pathname, '/sign-in');
  assert.equal(pendingBundles.size, 0);
  assert.equal(bundleRequests, loadedBundleRequests, 'An idle login page must not keep requesting bundles');
  if (process.env.TEST_DEV_PERFORMANCE) {
    assert.equal(loadedBundleRequests, 1, 'Development should load one web entry bundle');
    const warmStart = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('EMAIL ADDRESS', { exact: true }).waitFor();
    const warmDuration = Date.now() - warmStart;
    t.diagnostic(`Warm login reload: ${warmDuration} ms; no extra bundles during 30 seconds idle`);
    assert.ok(warmDuration < 15000, 'A warm reload must not rebuild the full application');
  }
  assert.deepEqual(state.errors, []);
});

test('all bottom tabs, join/group sections and drawer destinations remain on the requested screen', async (t) => {
  const { page, state, open, login } = await session(t);
  await login();
  const checkPath = async (path) => {
    await page.waitForURL(`${origin}${path}`);
    // Hidden SDK 58 screens redirect after rendering; assert after effects have run as well.
    await page.waitForTimeout(400);
    assert.equal(new URL(page.url()).pathname, path);
    for (const label of ['Home', 'Map', 'Pair', 'Group', 'Account']) assert.equal(await page.getByRole('tab', { name: label, exact: true }).count(), 1);
  };
  await page.getByRole('tab', { name: 'Pair', exact: true }).click(); await checkPath('/invite');
  await page.getByRole('tab', { name: 'Join a group', exact: true }).click(); await checkPath('/connect');
  await page.getByRole('tab', { name: 'Group', exact: true }).click(); await checkPath('/connections');
  await page.getByRole('tab', { name: 'Requests', exact: true }).click(); await checkPath('/requests');
  await page.getByRole('tab', { name: 'Members', exact: true }).click(); await checkPath('/connections');
  for (const [name, path] of [['Nearby members', '/nearby'], ['Notifications', '/notifications'], ['Getting started', '/guide']]) {
    await page.getByRole('button', { name: 'Open dashboard menu' }).click();
    await page.getByRole('button', { name, exact: true }).filter({ hasText: name }).click(); await checkPath(path);
  }
  for (const [name, path] of [['Home', '/'], ['Map', '/locations'], ['Account', '/account'], ['Group', '/connections']]) {
    await page.getByRole('tab', { name, exact: true }).click(); await checkPath(path);
  }
  await open('/connect?code=87654321');
  await page.getByRole('tab', { name: 'Join a group', exact: true }).waitFor();
  assert.equal(await page.locator('input').evaluateAll((inputs) => inputs.some((input) => input.value === '87654321')), true);
  assert.deepEqual(state.errors, []);
});

test('the dashboard call to action pairs devices and the bell opens a persistent notifications inbox', async (t) => {
  const { page, state, login } = await session(t, true, { notifications: [{ id: 'host-search', kind: 'host-searching',
    title: 'Your host is searching for you', body: 'Your host is trying to reach you. Please contact them.', createdAt: new Date().toISOString(), readAt: null }] });
  await login();
  await page.getByRole('button', { name: 'Connect to each other', exact: true }).click();
  await page.waitForURL(`${origin}/invite`);
  await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
  await page.waitForURL(`${origin}/notifications`);
  await page.getByText('Updates from your circle.', { exact: true }).waitFor();
  await page.getByText('Your host is searching for you', { exact: true }).waitFor();
  await captureScreen(page, 'notifications');
  await page.getByRole('button', { name: 'Mark as read', exact: true }).click();
  const topBell = page.getByRole('button', { name: 'Notifications', exact: true }).and(page.locator('[aria-label="Notifications"]'));
  await topBell.waitFor();
  assert.ok(state.notifications[0].readAt);
  await page.getByRole('tab', { name: 'Account', exact: true }).click();
  await page.waitForURL(`${origin}/account`);
  const accountHeader = page.getByText('Your account', { exact: true }).locator('..').locator('..');
  await accountHeader.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByText('Your host is searching for you', { exact: true }).waitFor();
  assert.deepEqual(state.errors, []);
});

test('members with pending or accepted connections cannot reveal invitations, and full hosts cannot invite', async (t) => {
  for (const role of ['pending', 'accepted', 'full']) {
    await t.test(role, async (t) => {
      const { page, state, login } = await session(t, true, { connections: (device) => {
        const link = (id) => ({ _id: id, requesterId: role === 'full' ? id : device.deviceId, receiverId: role === 'full' ? device.deviceId : 'host',
          requesterName: 'Companion', receiverName: 'Host', status: role === 'pending' ? 'pending' : 'accepted',
          createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), rangeMeters: 1000 });
        return role === 'full' ? ['a', 'b', 'c'].map(link) : [link('member')];
      } });
      await login(); await page.getByRole('tab', { name: 'Pair', exact: true }).click();
      await page.getByText(role === 'full' ? 'Your group is full' : 'Only your host can invite devices', { exact: true }).waitFor();
      assert.equal(await page.getByText('1234 5678', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Copy', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Share', exact: true }).count(), 0);
      assert.deepEqual(state.errors, []);
    });
  }
});

test('hosts must select a range before approving a member', async (t) => {
  const { page, state, login } = await session(t, true, { connections: (device) => [{ _id: 'join-a', requesterId: 'member-a', receiverId: device.deviceId,
    requesterName: 'Companion', status: 'pending', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), rangeMeters: 1000 }] });
  await login(); await page.getByRole('tab', { name: 'Group', exact: true }).click();
  await page.getByRole('tab', { name: 'Requests', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(), true);
  await page.getByRole('radio', { name: '2 km range', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByText('Member added with a 2 km range. You’ll be alerted if they go out of reach.', { exact: true }).waitFor();
  assert.equal(state.approvals.length, 1); assert.equal(state.approvals[0].rangeMeters, 2000);
  assert.deepEqual(state.errors, []);
});

test('account shows the coming-soon subscription and prompts for location only while sharing is unavailable', async (t) => {
  const { page, state, login } = await session(t);
  await login(); await page.getByRole('tab', { name: 'Account', exact: true }).click();
  await page.getByText('Up to 4 devices, including the host.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Upgrade · Coming soon', exact: true }).isDisabled(), true);
  await captureScreen(page, 'account');
  await page.getByRole('button', { name: 'Manage location sharing', exact: true }).click();
  await page.getByText('Turn on location sharing?', { exact: true }).waitFor();
  await captureScreen(page, 'location-prompt');
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/account');
  await page.context().grantPermissions(['geolocation'], { origin });
  await page.getByRole('button', { name: 'Manage location sharing', exact: true }).click();
  await page.getByRole('button', { name: 'Turn on location sharing', exact: true }).click();
  await page.getByText('Enabled', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Manage location sharing', exact: true }).count(), 0);
  assert.ok(state.sharingChanges.includes(true));
  await page.context().clearPermissions();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Manage location sharing', exact: true }).waitFor();
  await page.getByText('Location is off', { exact: true }).waitFor();
  assert.deepEqual(state.errors, []);
});

test('verification return reloads the user and refreshes the token before opening the group app', async (t) => {
  const { page, state, open, login } = await session(t, false);
  await login();
  assert.equal(state.deviceRequests, 0);
  await open('/sign-in?verification=complete');
  await page.getByText('Your email is not verified yet. Complete verification in your email, then try again.', { exact: true }).waitFor();
  assert.equal(state.deviceRequests, 0);
  state.verified = true;
  await open('/sign-in?verification=complete');
  try { await page.getByRole('tab', { name: 'Home', exact: true }).waitFor({ timeout: 15000 }); }
  catch (error) { console.error({ url: page.url(), state, screen: await page.locator('body').innerText() }); throw error; }
  assert.ok(state.refreshes > 0);
  assert.deepEqual(state.errors, []);
});

test('email action callbacks accept valid codes, reject invalid codes, and provide a safe Expo Go return', async (t) => {
  const { page, state, open } = await session(t, false);
  await open('/sign-in?mode=verifyEmail&oobCode=expired');
  await page.getByText(/This verification link is invalid or has already been used/).waitFor();
  assert.equal(state.applied, 0);
  await open('/sign-in?mode=verifyEmail&oobCode=valid-verification');
  await page.getByText('Email verified. You can now sign in or return to the app.', { exact: true }).waitFor();
  assert.equal(state.applied, 1);
  await open('/sign-in?verification=complete&appReturn=' + encodeURIComponent('exp://192.168.1.20:8081/--/sign-in'));
  await page.getByRole('button', { name: 'Return to the app', exact: true }).waitFor();
  assert.equal(state.deviceRequests, 0);
  assert.deepEqual(state.errors, []);
});

test('disabling verification lets a waiting account enter after reload and stops verification polling', async (t) => {
  const { page, state, login } = await session(t, false);
  await login();
  await page.getByRole('button', { name: 'I’ve verified my email', exact: true }).waitFor();
  state.requireEmailVerification = false;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Home', exact: true }).waitFor();
  assert.ok(state.deviceRequests > 0);
  assert.equal(state.verified, false, 'Access must not falsely mark the email as verified');
  const lookups = state.lookups;
  await page.waitForTimeout(6500);
  assert.equal(state.lookups, lookups, 'The five-second verification poll must be disabled');
  assert.equal(state.sends.length, 0);
  await page.getByRole('tab', { name: 'Group', exact: true }).click();
  await page.waitForURL(`${origin}/connections`);
  assert.deepEqual(state.errors, []);
});

test('registration without verification opens Home without sending an email and still protects signed-out routes', async (t) => {
  const { page, state, open } = await session(t, false, { requireEmailVerification: false });
  await open('/connections');
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).waitFor();
  assert.equal(state.deviceRequests, 0);
  await page.getByRole('tab', { name: 'Create account', exact: true }).click();
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('navigation-test@example.test');
  await page.getByLabel('PASSWORD', { exact: true }).fill('Example-password-123!');
  await page.getByLabel('CONFIRM PASSWORD', { exact: true }).fill('Example-password-123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('tab', { name: 'Home', exact: true }).waitFor();
  assert.equal(state.sends.length, 0);
  assert.equal(state.verified, false);
  assert.ok(state.deviceRequests > 0);
  assert.deepEqual(state.errors, []);
});

test('password sign-in pauses after throttling, blocks keyboard retries, and keeps password recovery available', async (t) => {
  const { page, state, open } = await session(t, true, { signInError: 'TOO_MANY_ATTEMPTS_TRY_LATER' });
  await page.clock.install();
  await open('/sign-in');
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('navigation-test@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Enter your Within Limits password. Use Forgot password if you need to reset it.', { exact: true }).waitFor();
  assert.equal(state.signInAttempts, 0, 'Empty passwords must not be sent to Firebase');
  await page.getByLabel('PASSWORD', { exact: true }).fill('Example-password-123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText(/Firebase has temporarily limited requests/).waitFor();
  assert.equal(await page.getByRole('button', { name: /Try sign-in again in/ }).isDisabled(), true);
  await page.getByLabel('PASSWORD', { exact: true }).press('Enter');
  await page.getByLabel('PASSWORD', { exact: true }).press('Enter');
  await page.getByRole('tab', { name: 'Create account', exact: true }).click();
  await page.getByRole('tab', { name: 'Sign in', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /Try sign-in again in/ }).isDisabled(), true);
  assert.equal(state.signInAttempts, 1, 'Retrying or switching forms must not submit another password attempt');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByText('If this email has an account, you’ll receive a password reset link.', { exact: true }).waitFor();
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].requestType, 'PASSWORD_RESET');
  assert.equal(await page.getByRole('button', { name: /Request another reset in/ }).isDisabled(), true);
  for (let i = 0; i < 65; i++) await page.clock.runFor(1000);
  assert.equal(state.signInAttempts, 1, 'Cooldown expiry must never retry sign-in automatically');
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  state.signInError = null;
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('tab', { name: 'Home', exact: true }).waitFor();
  assert.equal(state.signInAttempts, 2);
  assert.deepEqual(state.errors, []);
});

test('registration keeps its verification notice and adds the login callback to the email', async (t) => {
  const { page, state, open } = await session(t, false);
  await open('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Create account', exact: true }).click();
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('navigation-test@example.test');
  await page.getByLabel('PASSWORD', { exact: true }).fill('Example-password-123!');
  await page.getByLabel('CONFIRM PASSWORD', { exact: true }).fill('Example-password-123!');
  await page.getByRole('button', { name: 'Create account & verify email', exact: true }).click();
  await page.getByText('Verification email sent. Check your inbox and spam folder, open the link, then return to the app.', { exact: true }).waitFor();
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].continueUrl, `${origin}/sign-in?verification=complete`);
  assert.equal(state.deviceRequests, 0);
  state.verified = true;
  await page.getByRole('tab', { name: 'Home', exact: true }).waitFor();
  assert.ok(state.refreshes > 0);
  assert.deepEqual(state.errors, []);
});
