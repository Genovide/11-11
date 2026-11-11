const editLyrics = node('button', 'alignment-button', 'Вставить текст');
alignmentTools.insertBefore(editLyrics, alignButton);
const lyricsEditor = node('dialog', 'lyrics-editor'),
  editorTitle = node('h2', '', 'Текст песни'),
  editorTrack = node('p', 'editor-track'),
  editorHint = node(
    'p',
    'editor-hint',
    'Вставь текст через Ctrl+V. Таймкоды не нужны — при сохранении текст автоматически запишется в файл трека. Затем можно синхронизировать его с вокалом.'
  ),
  editorInput = node('textarea', 'editor-input'),
  editorError = node('p', 'editor-error'),
  editorActions = node('div', 'editor-actions'),
  editorReset = node('button', 'quiet', 'Вернуть исходный'),
  editorCancel = node('button', 'outline', 'Отмена'),
  editorSave = node('button', 'primary', 'Сохранить текст');
editorInput.placeholder = 'Вставь сюда текст песни…';
editorInput.maxLength = 200000;
editorInput.setAttribute('aria-label', 'Текст песни');
lyricsEditor.setAttribute('aria-label', 'Редактор текста песни');
editorActions.append(editorReset, editorCancel, editorSave);
lyricsEditor.append(editorTitle, editorTrack, editorHint, editorInput, editorError, editorActions);
document.body.append(lyricsEditor);
let editingTrack = null;
editLyrics.onclick = () => {
  if (!current) {
    toast('Сначала выбери трек');
    return;
  }
  editingTrack = current;
  editorTrack.textContent = current.artist + ' — ' + current.title;
  editorInput.value = current.lyrics || '';
  editorReset.classList.toggle('hidden', !current.customLyrics);
  editorError.textContent = '';
  lyricsEditor.showModal();
  editorInput.focus();
};
editorCancel.onclick = () => lyricsEditor.close();
lyricsEditor.addEventListener('keydown', (e) => e.stopPropagation());
function applyEditedLyrics(response) {
  for (const t of [editingTrack, current, ...library.tracks.filter((x) => x.id === response.id)]) {
    if (t?.id !== response.id) continue;
    t.lyrics = response.lyrics;
    delete t.alignment;
    if (response.customLyrics) {
      t.customLyrics = true;
      t.sourceLyrics = response.sourceLyrics;
    } else {
      delete t.customLyrics;
      delete t.sourceLyrics;
    }
  }
  if (current?.id === response.id) setLyrics(current);
  refreshAlignmentUI();
}
async function saveEditor(reset) {
  if (!editingTrack) return;
  editorSave.disabled = editorReset.disabled = editorCancel.disabled = true;
  editorError.textContent = '';
  let resume = null;
  try {
    if (current?.id === editingTrack.id && audio.getAttribute('src')) {
      resume = { id: current.id, time: audio.currentTime, playing: !audio.paused };
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      await new Promise((r) => setTimeout(r, 100));
    }
    const response = await (reset
      ? window.lumen.resetLyrics(editingTrack.id)
      : window.lumen.saveLyrics(editingTrack.id, editorInput.value));
    applyEditedLyrics(response);
    lyricsEditor.close();
    toast(reset ? 'Исходный текст восстановлен' : 'Текст записан в файл трека.');
  } catch (e) {
    editorError.textContent = e.message.replace(
      /^Error invoking remote method '[^']+': Error: /,
      ''
    );
  } finally {
    editorSave.disabled = editorReset.disabled = editorCancel.disabled = false;
    if (resume && current?.id === resume.id) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (current?.id === resume.id) {
            audio.currentTime = Math.min(
              resume.time,
              Number.isFinite(audio.duration) ? audio.duration : resume.time
            );
            if (resume.playing) start();
          }
        },
        { once: true }
      );
      audio.src = media(current);
      audio.load();
    }
  }
}
editorSave.onclick = () => saveEditor(false);
editorReset.onclick = () => saveEditor(true);
window.runLyricsEditorTest = () => {
  editLyrics.click();
  const checks = {
    opens: lyricsEditor.open,
    existingText: editorInput.value === (current?.lyrics || '').replace(/\r\n?/g, '\n'),
    pasteField: editorInput.tagName === 'TEXTAREA',
    correctTrack: editingTrack?.id === current?.id,
  };
  editorCancel.click();
  checks.cancels = !lyricsEditor.open;
  return { ok: Object.values(checks).every(Boolean), checks };
};
