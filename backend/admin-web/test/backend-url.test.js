import test from 'node:test';
import assert from 'node:assert/strict';
import { backendUrl } from '../src/backendUrl.js';

test('admin uses the hosted API origin and preserves local same-origin requests', () => {
  assert.equal(backendUrl('/api/admin/overview', ''), '/api/admin/overview');
  assert.equal(backendUrl('/api/admin/overview', 'https://demo.example.com'), 'https://demo.example.com/api/admin/overview');
  for (const value of ['https://user:secret@demo.example.com', 'https://demo.example.com/api', 'ftp://demo.example.com', 'https://demo.example.com/?key=private']) assert.throws(() => backendUrl('/api/auth/config', value));
});
