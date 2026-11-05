const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'reports');
fs.mkdirSync(directory, { recursive: true });
const suites = [
  { name: 'Backend and PostgreSQL', cwd: 'backend', args: ['src/scripts/testLocal.js', '--test-reporter=tap'] },
  { name: 'Admin dashboard logic', cwd: 'backend/admin-web', args: ['--test', '--test-reporter=tap', 'test/*.test.js'] },
  { name: 'Expo mobile logic', cwd: 'mobile', args: ['--test', '--test-reporter=tap', 'test/*.test.cjs'] },
];
const results = [];
for (const suite of suites) {
  console.log(`Running ${suite.name}…`);
  const start = performance.now();
  const result = spawnSync(process.execPath, suite.args, { cwd: path.join(root, suite.cwd), encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '') + (result.error ? `\n${result.error.message}` : '');
  fs.writeFileSync(path.join(directory, `${suite.cwd.replaceAll('/', '-')}.tap.log`), output);
  const cases = [...output.matchAll(/^\s*(ok|not ok) \d+ - (.+)$/gm)].map(match => ({ name: match[2].replace(/ # SKIP.*$/, ''), status: /# SKIP/.test(match[2]) ? 'SKIP' : match[1] === 'ok' ? 'PASS' : 'FAIL' }));
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'skipped'].map(key => [key, Number(output.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] || 0)]));
  results.push({ name: suite.name, ...counts, exitCode: result.status, durationSeconds: Number(((performance.now() - start) / 1000).toFixed(2)), cases });
  console.log(`${suite.name}: ${counts.pass} passed, ${counts.fail} failed, ${counts.skipped} skipped.`);
}
const selected = [
  ['TC-01', 'Automatic card registration', 'Scan an unassigned card at the college entrance.', 'One active Person assignment is created; retrying the scan does not duplicate it.', /only entrance can register/],
  ['TC-02', 'College route cleanup', 'Archive the old two-stop route, then scan its released card at the college entrance.', 'Only the college route remains visible; the card registers and its name can be edited by its owner.', /college demo:/],
  ['TC-03', 'Ordered trip completion', 'Scan entrance and exit while skipping an intermediate checkpoint.', 'The card stays active until all checkpoints have been visited in order.', /exit without the intermediate visit/],
  ['TC-04', 'Reusable cards and history', 'Finish a trip, retry an old scan, and start a new trip.', 'The old retry stays with its original trip; a fresh entrance scan starts a separate assignment.', /old retries stay attached/],
  ['TC-05', 'Group capacity', 'Try to connect a fifth device to a four-device group.', 'The extra device cannot join; the host counts toward the limit.', /four total devices fill the host/],
  ['TC-06', 'Private group chat', 'Approved host and members exchange messages; an outsider attempts access.', 'Group members receive messages without GPS; outsiders cannot read the conversation.', /members talk to the whole group/],
  ['TC-07', 'Chat pagination and rate limit', 'Load more than 50 messages and send requests above the rate limit.', 'Pages use numeric ID order without overlap; excess sends return HTTP 429.', /history pagination, message validation/],
  ['TC-08', 'Map range filtering', 'Place a simulated connected device 10 km away with a 1 km or 2 km range.', 'The device is hidden from Nearby and Map.', /host-selected radius hides a device 10 km/],
  ['TC-09', 'Proximity alert timing', 'Simulate an uninterrupted far/lost episode for two minutes.', 'An alert appears only after the required duration; recovery resets it.', /continuous far\/lost episode alerts/],
  ['TC-10', 'Authentication and isolation', 'Call protected endpoints with missing, invalid or unverified credentials.', 'Requests are rejected; a different admin cannot see or rename another owner’s records.', /mobile identity rejects missing/],
];
const all = results.flatMap(suite => suite.cases);
const cases = selected.map(([id, feature, action, expected, pattern]) => ({ id, feature, action, expected, status: all.find(item => pattern.test(item.name))?.status || 'NOT RUN' }));
const report = { generatedAt: new Date().toISOString(), timezone: 'Asia/Calcutta', environment: `Windows; Node ${process.version}; local PostgreSQL; isolated test schemas`, evidence: 'Automated tests use simulated cards, phone identities and proximity observations. They do not certify a physical reader, buzzer, GPS reception or installed APK.', suites: results, presentationCases: cases };
fs.writeFileSync(path.join(directory, 'demo-test-results.json'), JSON.stringify(report, null, 2));
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const total = results.reduce((sum, suite) => sum + suite.tests, 0), passed = results.reduce((sum, suite) => sum + suite.pass, 0);
fs.writeFileSync(path.join(directory, 'demo-test-report.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Within Limits — demo test evidence</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#172b3a;background:#f6f8fb;margin:0}main{max-width:1180px;margin:auto;padding:40px}h1{font-size:38px;letter-spacing:-1px}small,p{color:#526576}.summary{display:flex;gap:20px;flex-wrap:wrap}.summary article{background:white;border:1px solid #dfe7eb;border-radius:14px;padding:20px;flex:1}.summary strong{font-size:30px;color:#147d64;display:block}table{border-collapse:collapse;width:100%;background:white;font-size:14px}th,td{text-align:left;vertical-align:top;padding:14px;border:1px solid #dfe7eb}th{background:#e4f4ed}.PASS{color:#147d64;font-weight:750}.FAIL{color:#b43f4c;font-weight:750}.notice{padding:18px;background:#fff2d7;border-radius:12px;margin:24px 0}@media print{main{padding:0}table{font-size:11px}tr{break-inside:avoid}}</style><main><p>WITHIN LIMITS · DEMO EVIDENCE</p><h1>Test results for your presentation</h1><p>${esc(new Date(report.generatedAt).toLocaleString('en-IN', { timeZone: report.timezone }))} IST · ${esc(report.environment)}</p><div class="summary"><article><strong>${passed}/${total}</strong>Automated tests passed</article><article><strong>${cases.filter(item => item.status === 'PASS').length}/10</strong>Selected presentation scenarios</article><article><strong>3</strong>Application test suites</article></div><p class="notice">${esc(report.evidence)} Test duration is execution time, not a measurement of hardware latency.</p><h2>Slide-ready test cases</h2><table><thead><tr><th>ID / feature</th><th>Action</th><th>Expected and checked result</th><th>Result</th></tr></thead><tbody>${cases.map(item => `<tr><td>${esc(item.id)}<br><b>${esc(item.feature)}</b></td><td>${esc(item.action)}</td><td>${esc(item.expected)}</td><td class="${item.status}">${item.status}</td></tr>`).join('')}</tbody></table><h2>Suite totals</h2><table><tr><th>Suite</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Execution time</th></tr>${results.map(item => `<tr><td>${esc(item.name)}</td><td>${item.pass}</td><td>${item.fail}</td><td>${item.skipped}</td><td>${item.durationSeconds}s</td></tr>`).join('')}</table><h2>Physical demo checks to record separately</h2><p>Scan a real card at each of the four college stops; verify the actual buzzer when a tag leaves proximity; install the signed APK and test two phones, keyboard visibility and Google sign-in. Screenshots from UI fixtures are labelled sample data.</p></main></html>`);
fs.writeFileSync(path.join(directory, 'ppt-test-cases.txt'), `Within Limits — ${passed}/${total} automated tests passed\nRun: ${report.generatedAt}\n${report.evidence}\n\n` + cases.map(item => `${item.id} | ${item.feature} | ${item.status}\nAction: ${item.action}\nExpected: ${item.expected}`).join('\n\n'));
console.log(`Saved ${path.join(directory, 'demo-test-report.html')}`);
if (results.some(suite => suite.exitCode !== 0 || suite.skipped || !suite.tests) || cases.some(item => item.status !== 'PASS')) process.exitCode = 1;
