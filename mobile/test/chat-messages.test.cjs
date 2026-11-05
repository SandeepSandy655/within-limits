const test = require('node:test');
const assert = require('node:assert/strict');

test('chat merges retries, live events and pages without duplicate or rounded IDs', async () => {
  const { mergeChatMessages } = await import('../src/services/chatMessages.ts');
  const current = [{ id: '9007199254740993', body: 'last' }, { id: '10', body: 'old' }];
  const incoming = [{ id: '9', body: 'earlier' }, { id: '10', body: 'confirmed' }, { id: '9007199254740992', body: 'middle' }];
  const merged = mergeChatMessages(current, incoming);
  assert.deepEqual(merged.map((message) => message.id), ['9', '10', '9007199254740992', '9007199254740993']);
  assert.equal(merged[1].body, 'confirmed'); assert.equal(current[1].body, 'old');
});
