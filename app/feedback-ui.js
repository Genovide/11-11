(() => {
  const button = node('button', 'quiet feedback-open', 'Обратная связь');
  button.id = 'feedback-open';
  button.type = 'button';
  document.querySelector('.window-actions').before(button);
  const dialog = node('dialog', 'feedback-dialog');
  dialog.id = 'feedback-dialog';
  dialog.innerHTML =
    '<form id="feedback-form"><div class="feedback-heading"><div><span class="feedback-eyebrow">ПОМОГИ СДЕЛАТЬ SOUNDSYNC ЛУЧШЕ</span><h2>Обратная связь</h2></div><button type="button" class="feedback-close" aria-label="Закрыть">×</button></div><p class="feedback-intro">Расскажи о проблеме, предложи функцию или оставь отзыв — о любой части приложения.</p><label for="feedback-type">Что хочешь сообщить?</label><select id="feedback-type"><option value="bug">Сообщить об ошибке</option><option value="idea">Предложить улучшение</option><option value="other">Оставить отзыв</option></select><label for="feedback-title">Тема</label><input id="feedback-title" required minlength="3" maxlength="120" placeholder="Коротко: что случилось или чего не хватает"><label for="feedback-message">Сообщение</label><textarea id="feedback-message" required minlength="10" maxlength="3000" rows="6" placeholder="Для ошибки: что ты делал, что ожидал и что получилось. Для предложения: как это должно работать."></textarea><label for="feedback-contact">Контакт для ответа — необязательно</label><input id="feedback-contact" maxlength="160" placeholder="Telegram @имя или электронная почта"><label class="feedback-check"><input id="feedback-info" type="checkbox" checked> Добавить версию приложения и название системы</label><p class="feedback-privacy">Сообщение сохранится в очереди для автора SoundSync. Регистрация не нужна. Музыка, история, пути к файлам и ключи не прикладываются. Без контакта автор не сможет ответить.</p><p id="feedback-error" class="feedback-error" role="alert" hidden></p><div class="feedback-actions"><button id="feedback-copy" class="outline" type="button">Скопировать текст</button><button id="feedback-submit" class="primary" type="submit">Отправить</button></div></form>';
  document.body.append(dialog);
  const q = (id) => dialog.querySelector('#' + id),
    error = q('feedback-error');
  button.onclick = () => {
    error.hidden = true;
    dialog.showModal();
    q('feedback-type').focus();
  };
  dialog.querySelector('.feedback-close').onclick = () => dialog.close();
  q('feedback-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(
        q('feedback-title').value.trim() + '\n\n' + q('feedback-message').value.trim()
      );
      toast('Текст обращения скопирован');
    } catch {
      error.textContent = 'Не удалось скопировать. Можно выделить и скопировать сообщение вручную.';
      error.hidden = false;
    }
  };
  let requestId = crypto.randomUUID();
  q('feedback-form').addEventListener('input', () => {
    requestId = crypto.randomUUID();
  });
  q('feedback-form').onsubmit = async (event) => {
    event.preventDefault();
    error.hidden = true;
    const submit = q('feedback-submit');
    submit.disabled = true;
    try {
      await window.lumen.feedbackOpen({
        id: requestId,
        contact: q('feedback-contact').value,
        type: q('feedback-type').value,
        title: q('feedback-title').value,
        message: q('feedback-message').value,
        includeInfo: q('feedback-info').checked,
      });
      q('feedback-message').value = '';
      requestId = crypto.randomUUID();
      dialog.close();
      toast('Спасибо! Обращение отправлено автору SoundSync.');
    } catch (e) {
      error.textContent = cleanError(e);
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  };
})();
