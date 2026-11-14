const ENDPOINT = 'https://soundsync-feedback.ryslanborisow.workers.dev/feedback';
export function installFeedback(toast) {
  const d = document.createElement('dialog');
  d.className = 'sheet mobile-feedback';
  d.id = 'feedback-dialog';
  d.innerHTML =
    '<form><div class="sheet-heading"><h2>Обратная связь</h2><button type="button" class="icon-button feedback-close" aria-label="Закрыть">×</button></div><p class="field-help">Ошибка, идея или отзыв о SoundSync. Сообщение сохранится в очереди для автора. Регистрация не нужна.</p><label class="field-label" for="feedback-kind">Тип обращения</label><select id="feedback-kind"><option value="bug">Ошибка</option><option value="idea">Предложение</option><option value="other">Отзыв</option></select><label class="field-label" for="feedback-title">Тема</label><input id="feedback-title" required minlength="3" maxlength="120" placeholder="Коротко о главном"><label class="field-label" for="feedback-message">Сообщение</label><textarea id="feedback-message" rows="5" required minlength="10" maxlength="3000" placeholder="Что произошло или что хочется улучшить?"></textarea><label class="field-label" for="feedback-contact">Контакт для ответа — необязательно</label><input id="feedback-contact" maxlength="160" placeholder="Telegram @имя или почта"><label class="feedback-consent"><input type="checkbox" id="feedback-info" checked> Добавить версию приложения и название системы</label><p class="field-help">Музыка, любимое и история не передаются. Без контакта автор не сможет ответить.</p><input class="feedback-trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><p class="form-error" id="feedback-error" hidden role="alert"></p><button type="submit" class="primary full">Отправить</button></form>';
  document.body.append(d);
  const button = document.createElement('button');
  button.className = 'secondary full';
  button.textContent = 'Обратная связь';
  document.querySelector('#settings-dialog .version').before(button);
  button.onclick = () => d.showModal();
  d.querySelector('.feedback-close').onclick = () => d.close();
  let id = crypto.randomUUID();
  d.querySelector('form').addEventListener('input', () => {
    id = crypto.randomUUID();
  });
  d.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const submit = d.querySelector('[type=submit]'),
      error = d.querySelector('#feedback-error'),
      q = (id) => d.querySelector('#' + id);
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Отправляем…';
    try {
      if (!navigator.onLine) throw Error('Нет интернета. Текст сохранён в форме — отправь позже.');
      const body = {
        id,
        type: q('feedback-kind').value,
        title: q('feedback-title').value,
        message: q('feedback-message').value,
        contact: q('feedback-contact').value,
        website: d.querySelector('[name=website]').value,
      };
      if (q('feedback-info').checked) {
        body.version = 'Pocket 0.3.0';
        body.platform = /iPad|iPhone|iPod/.test(navigator.userAgent)
          ? 'iOS'
          : /Android/.test(navigator.userAgent)
            ? 'Android'
            : 'Браузер';
      }
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      const data = await r.json();
      if (!r.ok || !data.ok)
        throw Error(data.error || 'Не удалось отправить сообщение. Попробуй позже.');
      q('feedback-message').value = '';
      id = crypto.randomUUID();
      d.close();
      toast('Спасибо! Обращение отправлено автору SoundSync.');
    } catch (e) {
      error.textContent =
        e.name === 'TypeError' || e.name === 'TimeoutError'
          ? 'Не удалось подключиться. Текст сохранён — попробуй ещё раз.'
          : e.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Отправить';
    }
  };
}
