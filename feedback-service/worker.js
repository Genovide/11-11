import { enqueue, database, handleBot, initialize } from './queue.js';
const TYPES = { bug: 'Ошибка', idea: 'Предложение', other: 'Отзыв' };
export function cleanFeedback(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Заполни форму обратной связи.');
  const text = (value, min, max, label) => {
    if (typeof value !== 'string') throw Error(label);
    const s = value.trim();
    if (s.length < min || s.length > max) throw Error(label);
    return s;
  };
  const type = Object.hasOwn(TYPES, input.type) ? input.type : 'other';
  const title = text(input.title, 3, 120, 'Тема: от 3 до 120 символов.');
  const message = text(input.message, 10, 3000, 'Сообщение: от 10 до 3000 символов.');
  const contact = text(input.contact ?? '', 0, 160, 'Контакт: максимум 160 символов.');
  const id = text(input.id, 16, 80, 'Не удалось определить номер обращения.');
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error('Некорректный номер обращения.');
  const version = String(input.version || '').slice(0, 30),
    platform = String(input.platform || '').slice(0, 40);
  return {
    id,
    type,
    title,
    message,
    contact,
    version,
    platform,
    website: String(input.website || ''),
  };
}
export function telegramText(p) {
  return `SoundSync · ${TYPES[p.type]}\n№ ${p.id.slice(0, 8)}\n\n${p.title}\n\n${p.message}${p.contact ? '\n\nДля ответа: ' + p.contact : ''}${p.version || p.platform ? '\n\nПриложение: ' + p.version + ' · ' + p.platform : ''}`;
}
export function createService(fetchImpl = fetch) {
  const limits = new Map(),
    sent = new Map(),
    pending = new Map();
  return {
    async fetch(request, env = {}) {
      const route = new URL(request.url).pathname;
      if (route === '/telegram' && request.method === 'POST') {
        try {
          return await handleBot(request, env, telegramText, fetchImpl);
        } catch {
          return new Response('Retry later', { status: 503 });
        }
      }
      if (route === '/initialize' && request.method === 'POST') {
        try {
          return await initialize(request, env, fetchImpl);
        } catch {
          return new Response('Setup failed', { status: 503 });
        }
      }
      const origin = request.headers.get('Origin'),
        allowed = (env.ALLOWED_ORIGINS || 'https://soundsync-pocket.carvedbasil3.chatgpt.site')
          .split(',')
          .map((s) => s.trim());
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Origin',
      };
      if (origin && allowed.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
      }
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
      if (origin && !allowed.includes(origin))
        return json({ error: 'Недопустимый источник запроса.' }, 403);
      const path = new URL(request.url).pathname;
      if (path === '/health' && request.method === 'GET')
        return json({ ready: !!(env.TELEGRAM_BOT_TOKEN && env.DB), mode: 'queue' });
      if (path !== '/feedback') return json({ error: 'Не найдено.' }, 404);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') return json({ error: 'Нужен POST-запрос.' }, 405);
      if (!request.headers.get('Content-Type')?.startsWith('application/json'))
        return json({ error: 'Нужен JSON-запрос.' }, 415);
      if (!env.TELEGRAM_BOT_TOKEN || !env.DB)
        return json({ error: 'Приём обращений ещё настраивается. Попробуй позже.' }, 503);
      const now = Date.now(),
        ip = request.headers.get('CF-Connecting-IP') || 'local';
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
      for (const [k, v] of sent) if (v < now) sent.delete(k);
      const bucket = limits.get(ip) || { count: 0, until: now + 600000 };
      if (bucket.count >= 5)
        return json({ error: 'Слишком много обращений. Попробуй через 10 минут.' }, 429);
      bucket.count++;
      limits.set(ip, bucket);
      if (limits.size > 10000) limits.delete(limits.keys().next().value);
      if (
        env.FEEDBACK_RATE_LIMITER &&
        !(await env.FEEDBACK_RATE_LIMITER.limit({ key: ip })).success
      )
        return json({ error: 'Слишком много обращений. Попробуй позже.' }, 429);
      let input;
      try {
        if (Number(request.headers.get('Content-Length')) > 16000)
          return json({ error: 'Сообщение слишком большое.' }, 413);
        const reader = request.body?.getReader();
        if (!reader) throw Error();
        const chunks = [];
        let length = 0;
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          length += r.value.length;
          if (length > 16000) {
            await reader.cancel();
            return json({ error: 'Сообщение слишком большое.' }, 413);
          }
          chunks.push(r.value);
        }
        const bytes = new Uint8Array(length);
        let pos = 0;
        for (const c of chunks) {
          bytes.set(c, pos);
          pos += c.length;
        }
        input = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return json({ error: 'Некорректный запрос.' }, 400);
      }
      let p;
      try {
        p = cleanFeedback(input);
      } catch (e) {
        return json({ error: e.message }, 400);
      }
      if (p.website) return json({ ok: true, id: p.id });
      if (sent.has(p.id)) return json({ ok: true, id: p.id });
      if (pending.has(p.id))
        return pending.get(p.id).then(
          () => json({ ok: true, id: p.id }),
          () => json({ error: 'Не удалось сохранить обращение. Попробуй ещё раз.' }, 502)
        );
      const job = enqueue(env.DB, p).then(() => {
        sent.set(p.id, Date.now() + 600000);
      });
      pending.set(p.id, job);
      try {
        await job;
        return json({ ok: true, id: p.id });
      } catch {
        return json(
          { error: 'Не удалось сохранить обращение. Текст сохранён в форме — попробуй ещё раз.' },
          502
        );
      } finally {
        pending.delete(p.id);
      }
    },
  };
}
export default createService();
