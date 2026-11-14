const initialized = new WeakMap();
export async function database(db) {
  if (!db) throw Error('Очередь ещё настраивается.');
  if (!initialized.has(db)) {
    const job = db
      .exec(
        'CREATE TABLE IF NOT EXISTS feedback (seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,created INTEGER NOT NULL,body TEXT NOT NULL,reviewed INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS pending_feedback ON feedback(reviewed,seq); CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY,value TEXT NOT NULL);'
      )
      .catch((e) => {
        initialized.delete(db);
        throw e;
      });
    initialized.set(db, job);
  }
  await initialized.get(db);
  return db;
}
export async function enqueue(db, p) {
  await database(db);
  await db
    .prepare('INSERT OR IGNORE INTO feedback(id,created,body) VALUES(?,?,?)')
    .bind(p.id, Date.now(), JSON.stringify(p))
    .run();
}
export async function webhookSecret(token) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode('soundsync-webhook:' + token))
    ),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
}
const keyboard = {
  keyboard: [[{ text: 'Рассмотреть обращения' }]],
  resize_keyboard: true,
  is_persistent: true,
};
async function telegram(env, method, body, fetchImpl) {
  const r = await fetchImpl(
    'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    }
  );
  const data = await r.json();
  if (!r.ok || !data.ok) throw Error('Telegram временно недоступен.');
  return data.result;
}
export async function initialize(request, env, fetchImpl = fetch) {
  if (!env.PAIRING_CODE || request.headers.get('X-Setup-Code') !== env.PAIRING_CODE)
    return new Response('Forbidden', { status: 403 });
  await database(env.DB);
  await telegram(
    env,
    'setWebhook',
    {
      url: new URL('/telegram', request.url).href,
      secret_token: await webhookSecret(env.TELEGRAM_BOT_TOKEN),
      allowed_updates: ['message', 'callback_query'],
    },
    fetchImpl
  );
  return Response.json({ ok: true });
}
export async function handleBot(request, env, format, fetchImpl = fetch) {
  if (
    !env.TELEGRAM_BOT_TOKEN ||
    request.headers.get('X-Telegram-Bot-Api-Secret-Token') !==
      (await webhookSecret(env.TELEGRAM_BOT_TOKEN))
  )
    return new Response('Forbidden', { status: 403 });
  let update;
  try {
    const text = await request.text();
    if (text.length > 20000) return new Response('Too large', { status: 413 });
    update = JSON.parse(text);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const message = update.message || update.callback_query?.message,
    from = update.message?.from || update.callback_query?.from,
    chat = message?.chat;
  if (!chat || chat.type !== 'private' || String(chat.id) !== String(from?.id))
    return Response.json({ ok: true });
  const db = await database(env.DB),
    text = String(update.message?.text || update.callback_query?.data || '');
  let owner = await db.prepare("SELECT value FROM config WHERE key='owner'").first('value');
  if (!owner && env.PAIRING_CODE && text === '/start ' + env.PAIRING_CODE) {
    await db
      .prepare("INSERT OR IGNORE INTO config(key,value) VALUES('owner',?)")
      .bind(String(chat.id))
      .run();
    owner = await db.prepare("SELECT value FROM config WHERE key='owner'").first('value');
  }
  if (String(owner) !== String(chat.id)) return Response.json({ ok: true });
  const send = (text) =>
    telegram(
      env,
      'sendMessage',
      {
        chat_id: chat.id,
        text,
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      },
      fetchImpl
    );
  if (update.callback_query)
    await telegram(
      env,
      'answerCallbackQuery',
      { callback_query_id: update.callback_query.id },
      fetchImpl
    ).catch(() => {});
  if (text.startsWith('/start')) {
    await send(
      'Доступ подключён. Новые обращения сохраняются без уведомлений. Нажми «Рассмотреть обращения», когда захочешь их прочитать.'
    );
    return Response.json({ ok: true });
  }
  if (!['Рассмотреть обращения', '/review', 'review'].includes(text))
    return Response.json({ ok: true });
  await db.prepare("INSERT OR IGNORE INTO config(key,value) VALUES('review-lock','0')").run();
  const lock = await db
    .prepare(
      "UPDATE config SET value=? WHERE key='review-lock' AND CAST(value AS INTEGER)<? RETURNING value"
    )
    .bind(String(Date.now() + 120000), Date.now())
    .first();
  if (!lock) return Response.json({ ok: true });
  try {
    const cutoff = await db.prepare('SELECT MAX(seq) AS cutoff FROM feedback').first('cutoff');
    const { results: rows } = await db
      .prepare('SELECT seq,body,created FROM feedback WHERE reviewed=0 AND seq<=? ORDER BY seq')
      .bind(cutoff || 0)
      .all();
    if (!rows.length) {
      await send('Новых обращений пока нет.');
      return Response.json({ ok: true });
    }
    if (rows.length <= 3) {
      for (const row of rows) {
        await send(format(JSON.parse(row.body)));
        await db
          .prepare('UPDATE feedback SET reviewed=? WHERE seq=?')
          .bind(Date.now(), row.seq)
          .run();
      }
    } else {
      const content = rows
          .map(
            (r, i) =>
              i + 1 + '. ' + new Date(r.created).toISOString() + '\n' + format(JSON.parse(r.body))
          )
          .join('\n\n────────────────────\n\n'),
        form = new FormData();
      form.set('chat_id', String(chat.id));
      form.set(
        'caption',
        'Обращения SoundSync: ' + rows.length + '. Включены только обращения из этой пачки.'
      );
      form.set(
        'document',
        new Blob([content], { type: 'text/plain;charset=utf-8' }),
        'SoundSync-feedback.txt'
      );
      const r = await fetchImpl(
        'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendDocument',
        { method: 'POST', body: form, signal: AbortSignal.timeout(25000) }
      );
      const result = await r.json();
      if (!r.ok || !result.ok) throw Error('Не удалось выдать пачку.');
      await db
        .prepare('UPDATE feedback SET reviewed=? WHERE reviewed=0 AND seq<=?')
        .bind(Date.now(), cutoff)
        .run();
    }
    await send(
      'Выдано обращений: ' + rows.length + '. Более поздние останутся до следующего нажатия.'
    );
    return Response.json({ ok: true });
  } finally {
    await db.prepare("UPDATE config SET value='0' WHERE key='review-lock'").run();
  }
}
