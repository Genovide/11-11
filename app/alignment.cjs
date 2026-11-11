const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawn } = require('node:child_process');
module.exports = function setup({ app, ipcMain, getLibrary, save, send }) {
  let active = null;
  const directory = () => path.join(app.getPath('userData'), 'alignment');
  async function fingerprint(t, recordedPath = t.path) {
    const stat = await fs.stat(t.path);
    return crypto
      .createHash('sha256')
      .update(JSON.stringify([recordedPath, stat.size, stat.mtimeMs, t.lyrics]))
      .digest('hex');
  }
  const { TimingEdit } = require('./timing-edit.js'),
    { parseLumenLyrics } = require('./lyrics-timing.js');
  async function editorState(id) {
    const t = getLibrary().tracks.find((t) => t.id === id);
    if (!t) throw Error('Трек не найден');
    if (active?.id === id) throw Error('Сначала дождись окончания синхронизации');
    if (!t.lyrics?.trim()) throw Error('Сначала добавь текст песни');
    let duration = t.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      const { parseFile } = await import('music-metadata');
      duration = (await parseFile(t.path, { duration: true })).format.duration;
    }
    if (!duration) throw Error('Не удалось определить длительность песни');
    const lines =
      t.alignment?.lines ||
      parseLumenLyrics(t.lyrics).map((line, i, all) => {
        const time = Number.isFinite(line.time) ? line.time : 0,
          end = Number.isFinite(line.end)
            ? line.end
            : Number.isFinite(all[i + 1]?.time)
              ? all[i + 1].time
              : time
                ? Math.min(duration, time + 6)
                : 0;
        return {
          ...line,
          time,
          end,
          words: (line.words || []).map((w, j, words) => ({
            ...w,
            end: Number.isFinite(w.end) ? w.end : (words[j + 1]?.time ?? end),
            matched: true,
          })),
        };
      });
    const revision = crypto
      .createHash('sha256')
      .update((await fingerprint(t)) + JSON.stringify(t.alignment || null))
      .digest('hex');
    return { t, duration, lines: TimingEdit.clone(lines), revision };
  }
  ipcMain.handle('alignment-editor', async (_, id) => {
    const state = await editorState(id);
    return {
      lines: state.lines,
      duration: state.duration,
      revision: state.revision,
      manual: !!state.t.alignment?.manual,
    };
  });
  ipcMain.handle('alignment-manual-save', async (_, id, payload) => {
    const state = await editorState(id);
    if (payload?.revision !== state.revision)
      throw Error('Текст или синхронизация изменились. Открой редактор заново');
    if (JSON.stringify(payload.lines).length > 4000000) throw Error('Слишком большая разметка');
    TimingEdit.validate(payload.lines, state.lines, state.duration);
    const lines = TimingEdit.clone(payload.lines).map((line) => TimingEdit.bounds(line)),
      words = lines.flatMap((l) => l.words || []),
      result = {
        ...state.t.alignment,
        version: 2,
        method: 'manual',
        manual: true,
        duration: state.duration,
        lines,
        words: words.length,
        unmatched: words.filter((w) => w.matched === false || w.end <= w.time).length,
      };
    const dir = directory();
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, id + '.json'),
      backup = path.join(dir, id + '.before-manual.json');
    if (!state.t.alignment?.manual) {
      await fs.writeFile(
        backup,
        JSON.stringify({
          fingerprint: await fingerprint(state.t),
          result: state.t.alignment || null,
        })
      );
    } else {
      try {
        await fs.access(backup);
      } catch {
        await fs.writeFile(
          backup,
          JSON.stringify({ fingerprint: await fingerprint(state.t), result: null })
        );
      }
    }
    const tmp = file + '.manual.tmp';
    await fs.writeFile(tmp, JSON.stringify({ fingerprint: await fingerprint(state.t), result }));
    await fs.rename(tmp, file);
    state.t.alignment = result;
    await save();
    return { id, alignment: result };
  });
  ipcMain.handle('alignment-manual-restore', async (_, id, revision) => {
    const state = await editorState(id);
    if (revision !== state.revision) throw Error('Разметка изменилась. Открой редактор заново');
    let backup;
    try {
      backup = JSON.parse(
        await fs.readFile(path.join(directory(), id + '.before-manual.json'), 'utf8')
      );
    } catch {
      throw Error('Нет сохранённой разметки до ручных правок');
    }
    if (backup.fingerprint !== (await fingerprint(state.t)))
      throw Error('Исходный файл или текст уже изменились');
    const file = path.join(directory(), id + '.json');
    if (backup.result) {
      const tmp = file + '.restore.tmp';
      await fs.writeFile(tmp, JSON.stringify(backup));
      await fs.rename(tmp, file);
      state.t.alignment = backup.result;
    } else {
      await fs.unlink(file).catch(() => {});
      delete state.t.alignment;
    }
    await save();
    return { id, alignment: state.t.alignment || null };
  });
  async function restore(tracks) {
    await Promise.all(
      tracks.map(async (t) => {
        try {
          const file = path.join(directory(), t.id + '.json');
          const cache = JSON.parse(await fs.readFile(file, 'utf8'));
          if (cache.fingerprint === (await fingerprint(t))) t.alignment = cache.result;
          else if (t.movedFrom && cache.fingerprint === (await fingerprint(t, t.movedFrom))) {
            // Файл перенесли без изменений: переносим тайминги на новый путь.
            t.alignment = cache.result;
            cache.fingerprint = await fingerprint(t);
            await fs.writeFile(file + '.tmp', JSON.stringify(cache));
            await fs.rename(file + '.tmp', file);
          } else delete t.alignment;
        } catch {
          delete t.alignment;
        }
      })
    );
  }
  ipcMain.handle('alignment-start', async (_, id) => {
    if (active) throw Error('Уже обрабатывается другая песня');
    const t = getLibrary().tracks.find((t) => t.id === id);
    if (!t) throw Error('Трек не найден');
    if (!t.lyrics?.trim()) throw Error('Для синхронизации нужен текст этой песни');
    const dir = directory();
    await fs.mkdir(dir, { recursive: true });
    const nonce = crypto.randomBytes(5).toString('hex'),
      jobPath = path.join(dir, `${id}-${nonce}.job.json`),
      output = path.join(dir, `${id}-${nonce}.result.json`),
      hash = await fingerprint(t);
    const runtime = require('./runtime-paths.cjs'),
      python = runtime.python,
      script = runtime.script('align.py');
    await fs.access(python);
    await fs.writeFile(jobPath, JSON.stringify({ audio: t.path, lyrics: t.lyrics, output }));
    return await new Promise((resolve, reject) => {
      const child = spawn(python, [script, jobPath], {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONUNBUFFERED: '1',
          SOUNDSYNC_CACHE_DIR: path.join(dir, 'engine-cache'),
          TEMP: dir,
          TMP: dir,
        },
      });
      active = { id, child };
      let buffer = '',
        details = '',
        message = '',
        cancelled = false;
      active.cancel = () => {
        cancelled = true;
        child.kill();
      };
      const timer = setTimeout(
        () => {
          message = 'Превышено время обработки';
          child.kill();
        },
        25 * 60 * 1000
      );
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (s) => {
        details = (details + s).slice(-6000);
      });
      child.stdout.on('data', (s) => {
        buffer += s;
        const rows = buffer.split(/\r?\n/);
        buffer = rows.pop();
        for (const row of rows) {
          try {
            const event = JSON.parse(row);
            if (event.stage === 'error') message = event.message;
            send('alignment-progress', { id, ...event });
          } catch {}
        }
      });
      child.on('error', (e) => {
        message = e.message;
      });
      child.on('close', async (code) => {
        clearTimeout(timer);
        active = null;
        try {
          if (cancelled) throw Error('Синхронизация отменена');
          if (code !== 0)
            throw Error(message || 'Ошибка движка синхронизации: ' + details.slice(-500));
          const result = JSON.parse(await fs.readFile(output, 'utf8'));
          if (!Array.isArray(result.lines) || !result.lines.length) throw Error('Пустая разметка');
          if (hash !== (await fingerprint(t)))
            throw Error('Песня или текст изменились во время обработки');
          await fs.writeFile(
            path.join(dir, id + '.json'),
            JSON.stringify({ fingerprint: hash, result })
          );
          t.alignment = result;
          await save();
          resolve({ id, alignment: result });
        } catch (e) {
          reject(e);
        } finally {
          await Promise.allSettled([fs.unlink(jobPath), fs.unlink(output)]);
        }
      });
    });
  });
  ipcMain.handle('alignment-cancel', () => {
    active?.cancel();
    return true;
  });
  ipcMain.handle('alignment-remove', async (_, id) => {
    if (active?.id === id) throw Error('Сначала останови обработку');
    const t = getLibrary().tracks.find((t) => t.id === id);
    if (t) delete t.alignment;
    await fs.unlink(path.join(directory(), id + '.json')).catch(() => {});
    await save();
    return true;
  });
  app.on('before-quit', () => active?.child.kill());
  return { restore, isAligning: (id) => active?.id === id };
};
