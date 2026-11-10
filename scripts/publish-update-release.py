"""Replace the two tested v1.2.2 updates, retaining old assets until verification."""
import hashlib,json,os,pathlib,time,urllib.parse,urllib.request

REPO='Genovide/SoundSync'
TAG='v1.2.2'
API='https://api.github.com/repos/'+REPO
TOKEN=os.environ['GH_TOKEN']

def request(method,url,data=None,content_type='application/json'):
    if isinstance(data,dict):data=json.dumps(data).encode()
    req=urllib.request.Request(url,data=data,method=method,headers={
        'Authorization':'Bearer '+TOKEN,'Accept':'application/vnd.github+json',
        'Content-Type':content_type,'User-Agent':'SoundSync-release-maintenance'})
    with urllib.request.urlopen(req,timeout=120) as response:
        body=response.read()
        return json.loads(body) if body else None

def main():
    dist=pathlib.Path('dist')
    names=['SoundSync-1.2.2-Update-Windows-x64.zip','SoundSync-1.2.2-Update-macOS-arm64.zip']
    files={name:(dist/name).read_bytes() for name in names}
    sums=''.join(hashlib.sha256(files[name]).hexdigest()+'  '+name+'\n' for name in names)
    (dist/'SHA256SUMS.txt').write_text(sums,encoding='utf-8',newline='\n')
    files['SHA256SUMS.txt']=sums.encode()
    release=request('GET',API+'/releases/tags/'+TAG)
    latest=request('GET',API+'/releases/latest')
    assert latest['id']==release['id'] and not release.get('immutable'), 'Latest release changed or is immutable'
    originals={a['name']:a for a in release['assets'] if a['name'] in files}
    assert set(originals)==set(files), 'Expected both existing update archives and checksums'
    (dist/'release-before.json').write_text(json.dumps(release,ensure_ascii=False,indent=2),encoding='utf-8')
    nonce=os.environ.get('GITHUB_RUN_ID',str(time.time_ns()))+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    staged={};renamed=[];promoted=[]
    try:
        # Upload first. A failed upload leaves every original download available.
        for name,data in files.items():
            pending=name+'.pending-'+nonce
            asset=request('POST','https://uploads.github.com/repos/'+REPO+'/releases/'+str(release['id'])+'/assets?name='+urllib.parse.quote(pending),data,
                          'application/zip' if name.endswith('.zip') else 'text/plain; charset=utf-8')
            staged[name]=asset
            assert asset['size']==len(data) and asset['digest']=='sha256:'+hashlib.sha256(data).hexdigest(), 'Uploaded digest mismatch'
        for name,asset in originals.items():
            request('PATCH',asset['url'],{'name':name+'.previous-'+nonce});renamed.append(name)
        for name,asset in staged.items():
            request('PATCH',asset['url'],{'name':name});promoted.append(name)
        published=request('GET',release['assets_url'])
        current={a['name']:a for a in published if a['name'] in files}
        assert set(current)==set(files)
        for name,data in files.items():
            assert current[name]['digest']=='sha256:'+hashlib.sha256(data).hexdigest()
    except BaseException:
        # Restore canonical download names if promotion was interrupted.
        for name in reversed(promoted):request('PATCH',staged[name]['url'],{'name':name+'.pending-'+nonce})
        for name in reversed(renamed):request('PATCH',originals[name]['url'],{'name':name})
        for asset in staged.values():request('DELETE',asset['url'])
        raise
    notes='''## Исправленное обновление Windows и Mac

- Windows: восстановлены 53 отсутствующих Python-модуля PyTorch (`torch.utils.data` и связанные модули). Исправлена ошибка `cannot import name data` при синхронизации.
- Ускорена распаковка Windows через .NET; для замены EXE извлекается только нужный файл. Локальная основа используется без лишнего копирования ZIP.
- Проверка совместимости Windows использует до четырёх потоков и не требует полной основы для файлов, которые уже включены в апдейт.
- Движок Python/PyTorch проверяется при установке. Windows откатывает замену файлов при ошибке проверки; Mac проверяет движок до замены приложения и повторной подписи.
- Отдельные пакеты для Windows x64 и Mac Apple Silicon arm64. Windows-модули не попадают в Mac-архив.
- Оба пакета проверены на соответствующих ОС: повторная установка, восстановление основы, сохранение данных; на Mac также запуск приложения и проверка подписи.

Файлы релиза заменены, версия осталась **1.2.2**. Если старый апдейт уже был установлен, скачай обновлённый ZIP и запусти его повторно. Контрольные суммы обновлены в `SHA256SUMS.txt`.

'''
    body=release.get('body','')
    if '## Исправленное обновление Windows и Mac' not in body:
        body=notes+body
    ui_notes='''## Обновлённый интерфейс и общий экран трека

- Выровнены кнопки, SVG-иконки, отступы и элементы управления. Убраны конфликтующие зелёные и жёлтые подложки.
- Тема «Без градиентов» стала нейтрально-тёмной; цветные заливки и декоративные градиенты отключены.
- В градиентной теме фон, панели, акценты и основные визуализации плавно подстраиваются под палитру обложки. Трек без обложки возвращает нейтральную палитру.
- Визуализация и текст объединены в один экран с переключателем. Первой открывается визуализация; переключение сохраняет воспроизведение и позицию трека.
- Очередь, редактирование текста и синхронизация остаются доступны. AI-описание свёрнуто в компактный раскрываемый блок.
- Интерфейс проверен в Electron на Windows и Mac Apple Silicon, включая короткое окно, обе темы и управление с клавиатуры.

Скачай обновлённый ZIP своей платформы и установи поверх текущей версии. Номер релиза остался **1.2.2**.

'''
    if '## Обновлённый интерфейс и общий экран трека' not in body:
        body=ui_notes+body
    if body!=release.get('body',''):
        request('PATCH',release['url'],{'body':body})
    # Cleanup is deliberately last: originals are retained until every new digest is verified.
    for asset in originals.values():request('DELETE',asset['url'])
    print('Replaced and verified Windows update, Mac update and SHA256SUMS.txt:',release['html_url'])

if __name__=='__main__':main()
