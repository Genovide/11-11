<div align="center">
<img src="build/icon.png" width="128" alt="SoundSync">
<h1>SoundSync</h1>
<p>Твоя музыка. Твои тексты. Твой ритм.</p>
<p>Музыкальный плеер для Windows и macOS Apple Silicon.</p>
<a href="https://github.com/Genovide/SoundSync/releases/latest">Скачать SoundSync</a> · <a href="https://github.com/Genovide/SoundSync/issues">Сообщить о проблеме</a>
</div>

![Интерфейс SoundSync](docs/screenshot.png)

## Возможности

- Медиатека, альбомы, артисты, любимые и скачанные треки.
- SoundCloud и «Моя волна» по артисту, жанру или настроению.
- LRCLIB: поиск и сохранение текстов, уточнение названия, исполнителя и альбома.
- Разбор сложных названий и версий записей; ручные правки сохраняются по ID трека.
- Синхронизация слов и ручная правка таймингов. У slowed/sped-up записей таймкоды оригинала не применяются автоматически.
- Рецензии и оценки РЗТ в собственном окне плеера.
- Бесконечная прокрутка и сортировки по названию, исполнителю, альбому, длительности и году.
- Чёрно-жёлтое оформление SoundSync, режим без градиентов и визуализации.

## Скачать 1.2.0

| Система | Полная версия | Обновление |
|---|---|---|
| Windows x64 | [ZIP](https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-Windows-x64.zip) | [Update ZIP](https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-Update-Windows-x64.zip) |
| macOS 14+, Apple Silicon | [DMG](https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-macOS-arm64.dmg) · [ZIP](https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-macOS-arm64.zip) | [Update ZIP](https://github.com/Genovide/SoundSync/releases/download/v1.2.0/SoundSync-1.2.0-Update-macOS-arm64.zip) |

Полные версии включают Python, FFmpeg и модель синхронизации. Пользовательской музыки, настроек, истории и ключей в них нет. Контрольные суммы — в `SHA256SUMS.txt` в релизе.

### Windows

Распакуй полный ZIP целиком и запусти `SoundSync.exe`. `Create-SoundSync-Shortcuts.bat` создаёт ярлыки. Данные хранятся в папке `Data` рядом с программой.

Для обновления закрой плеер, распакуй Update ZIP в отдельную папку и запусти `Update-SoundSync.bat`. Выбери установленный плеер. Обновление проверяет файлы и создаёт резервную копию; пользовательские данные сохраняются.

### macOS

Нужны Apple Silicon и macOS 14+. Открой DMG и перенеси `SoundSync.app` в Applications. Данные хранятся в `~/Library/Application Support/SoundSync`.

Mac-сборка тестовая: она имеет ad-hoc подпись, но не нотарифицирована Apple. Gatekeeper может ограничивать открытие. Защиту системы отключать не нужно; для обычного публичного распространения без этих ограничений требуется Developer ID и нотариализация.

Update ZIP рассчитан на установленную `SoundSync.app` с встроенной Whisper Small. Закрой приложение через меню SoundSync и запусти `Update-SoundSync.command`. При переходе со старой неработающей Mac-сборки используй полную версию.

## Примечания

Один трек бывает в нескольких изданиях: проверяй выбранный альбом LRCLIB. Сайт РЗТ может запрашивать проверку браузера. AI-описания запускаются пользователем с личным ключом OpenRouter; ключи в сборки не включаются.

## Сборка из исходников

`app` — приложение, `alignment` — Python-обработчики, `scripts` — упаковка и проверки.

Mac: Node.js 22+, npm, uv, инструменты Xcode. `npm ci`, `npm ci --prefix app --omit=dev`, `npm run build:mac`, `npm run test:mac`, `npm run archive:mac`. GitHub Actions выполняет нативную сборку и сохраняет отчёт запуска и скриншот.

Windows: укажи `SOUNDSYNC_WINDOWS_BASE` на полную portable-версию с Python и моделью и выполни `npm run build:windows`. Папка `Data` в архив не включается.
