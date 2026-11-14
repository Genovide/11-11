import assert from 'node:assert/strict';
import { createService, cleanFeedback, telegramText } from './worker.js';
const payload = {
  id: '12345678-abcd-1234-aaaa-123456789012',
  type: 'bug',
  title: 'Кнопка не работает',
  message: 'Нажимаю на кнопку, ничего не происходит.',
  contact: '@test',
  version: '1.2.6',
  platform: 'Windows',
};
const env = {
  TELEGRAM_BOT_TOKEN: 'test-token',
  DB: {
    exec: async () => {},
    prepare: () => ({
      bind() {
        return this;
      },
      run: async () => ({}),
    }),
  },
};
let delivered = 0;
const service = createService(async (url, options) => {
  delivered++;
  const data = JSON.parse(options.body);
  assert.equal(data.chat_id, '123');
  assert.ok(data.text.includes(payload.message));
  assert.ok(!data.parse_mode);
  return Response.json({ ok: true });
});
const req = (p = payload, origin = 'https://soundsync-pocket.carvedbasil3.chatgpt.site') =>
  new Request('https://feedback.test/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(p),
  });
assert.ok(telegramText(cleanFeedback({ ...payload, message: 'я'.repeat(3000) })).length < 4096);
assert.equal((await service.fetch(req(), {})).status, 503);
assert.equal((await service.fetch(req(payload, 'https://evil.test'), env)).status, 403);
assert.equal((await service.fetch(req({ ...payload, message: 'short' }), env)).status, 400);
assert.equal((await service.fetch(req(), env)).status, 200);
assert.equal((await service.fetch(req(), env)).status, 200);
assert.equal(delivered, 0);
assert.equal(
  (await service.fetch(req({ ...payload, id: '12345678-other-1234', website: 'spam' }), env))
    .status,
  200
);
assert.equal(delivered, 0);
const rate = createService(async () => Response.json({ ok: true }));
for (let i = 0; i < 5; i++)
  assert.equal((await rate.fetch(req({ ...payload, id: payload.id + i }), env)).status, 200);
assert.equal((await rate.fetch(req(), env)).status, 429);
console.log(
  'PASS feedback service: validation, silent enqueue, CORS, duplicate suppression, honeypot, rate limits, safe errors, missing secrets'
);
