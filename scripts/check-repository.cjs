const { execFileSync } = require('node:child_process');
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const prohibited = files.filter(file => /(^|\/)(node_modules|\.private|\.vercel)\//.test(file) || /\.md$/i.test(file) || /(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example') || /\.(pem|key|jks|keystore|apk|aab)$/i.test(file) || /^firmware\/.*\/config\.h$/.test(file) || /^backend\/public\/admin\//.test(file));
if (prohibited.length) { console.error('Remove these local-only files from the Git index:\n' + prohibited.join('\n')); process.exitCode = 1; }
else console.log('Repository check passed: notes, generated bundles, local configuration and signing files are not tracked.');
