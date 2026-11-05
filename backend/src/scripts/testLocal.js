// Use local Compose credentials without printing them or modifying the application schema.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const config = require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true }).parsed || {};
const url = new URL('postgresql://127.0.0.1:5433/');
url.username = config.POSTGRES_USER || 'within_limits_app'; url.password = config.POSTGRES_PASSWORD || ''; url.pathname = config.POSTGRES_DB || 'within_limits';
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), 'test/*.test.js'], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, TEST_DATABASE_URL: url.toString() }, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
