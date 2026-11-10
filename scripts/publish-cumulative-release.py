"""Publish a new cumulative update; never overwrite a published release."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = 'Genovide/SoundSync'
API = 'https://api.github.com/repos/' + REPO
WEB = 'https://github.com/' + REPO


def credential():
    token = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    if not token:
        result = subprocess.run(['git', 'credential', 'fill'],
                                input='protocol=https\nhost=github.com\n\n',
                                capture_output=True, text=True, check=True)
        token = dict(line.split('=', 1) for line in result.stdout.splitlines()
                     if '=' in line).get('password')
    if not token:
        raise RuntimeError('GitHub authentication is unavailable')
    return token


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.commit):
        raise ValueError('A full commit SHA is required')
    version = json.loads((ROOT / 'app/package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version')
    tag = 'v' + version
    notes = (ROOT / 'docs/releases' / (version + '.md')).read_text(encoding='utf-8')
    archives = [f'SoundSync-{version}-Update-{platform}-{arch}.zip'
                for platform, arch in [('Windows', 'x64'), ('macOS', 'arm64')]]
    files = {name: (ROOT / 'dist' / name).read_bytes() for name in archives}
    checksums = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
                        for name, data in files.items())
    files['SHA256SUMS.txt'] = checksums.encode()
    (ROOT / 'dist/SHA256SUMS.txt').write_text(checksums, encoding='utf-8', newline='\n')
    token = credential()

    def request(method, url, data=None, content_type='application/json'):
        if isinstance(data, dict):
            data = json.dumps(data).encode()
        req = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
            'Content-Type': content_type, 'User-Agent': 'SoundSync-release-maintenance'})
        with urllib.request.urlopen(req, timeout=120) as response:
            body = response.read()
            return json.loads(body) if body else None

    # Confirm the source is on GitHub and full download links remain valid.
    assert request('GET', API + '/commits/' + args.commit)['sha'] == args.commit
    base = request('GET', API + '/releases/tags/v1.2.0')
    expected_base = {'SoundSync-1.2.0-Windows-x64.zip', 'SoundSync-1.2.0-macOS-arm64.zip',
                     'SoundSync-1.2.0-macOS-arm64.dmg'}
    assert expected_base <= {a['name'] for a in base['assets']} and not base['draft']
    try:
        release = request('GET', API + '/releases/tags/' + tag)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        release = None
    if release:
        if not release['draft']:
            raise RuntimeError('Refusing to overwrite a published release: ' + tag)
        # A resumed draft must still point to the reviewed source commit.
        assert release['target_commitish'] == args.commit
        try:
            ref = request('GET', API + '/git/ref/tags/' + tag)
            assert ref['object']['type'] == 'commit' and ref['object']['sha'] == args.commit
        except urllib.error.HTTPError as error:
            if error.code != 404:  # Draft tags may not exist until publication.
                raise
    else:
        release = request('POST', API + '/releases', {
            'tag_name': tag, 'target_commitish': args.commit,
            'name': 'SoundSync ' + version + ' — накопительное обновление',
            'body': notes, 'draft': True, 'prerelease': False})
    if release.get('immutable'):
        raise RuntimeError('Draft release is immutable')
    assets = {a['name']: a for a in release['assets']}
    assert not (set(assets) - set(files)), 'Unexpected assets in draft'
    upload = release['upload_url'].split('{', 1)[0]
    for name, data in files.items():
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        asset = assets.get(name)
        if asset and (asset['size'] != len(data) or asset.get('digest') != digest):
            request('DELETE', asset['url'])  # Only an unpublished draft asset.
            asset = None
        if not asset:
            asset = request('POST', upload + '?name=' + urllib.parse.quote(name), data,
                            'application/zip' if name.endswith('.zip') else 'text/plain')
        assert asset['size'] == len(data) and asset.get('digest') == digest, name
        print('Uploaded and verified:', name, len(data), flush=True)
    verified = request('GET', release['assets_url'])
    assert {a['name'] for a in verified} == set(files)
    for asset in verified:
        data = files[asset['name']]
        assert asset['size'] == len(data)
        assert asset.get('digest') == 'sha256:' + hashlib.sha256(data).hexdigest()
    published = request('PATCH', release['url'], {'body': notes, 'draft': False, 'make_latest': 'true'})
    latest = request('GET', API + '/releases/latest')
    assert latest['id'] == published['id'] and not latest['draft']
    print('Published:', published['html_url'], flush=True)

    # Keep old entry points useful without moving or re-uploading their assets.
    marker = '<!-- soundsync-downloads -->'
    block = (marker + '\n## Первая установка и обновление\n\n'
             '**Полная сборка:** [Windows ZIP](' + WEB + '/releases/download/v1.2.0/SoundSync-1.2.0-Windows-x64.zip) · '
             '[macOS DMG](' + WEB + '/releases/download/v1.2.0/SoundSync-1.2.0-macOS-arm64.dmg) · '
             '[macOS ZIP](' + WEB + '/releases/download/v1.2.0/SoundSync-1.2.0-macOS-arm64.zip).\n\n'
             '**После установки полной сборки:** скачай [последний накопительный апдейт](' + WEB + '/releases/latest). '
             'Промежуточные апдейты не нужны. Если плеер уже установлен, скачай только последний апдейт.\n\n'
             '<!-- /soundsync-downloads -->\n\n')
    releases = request('GET', API + '/releases?per_page=100')
    for old in releases:
        if old['draft'] or old['id'] == published['id']:
            continue
        body = re.sub(r'<!-- soundsync-downloads -->.*?<!-- /soundsync-downloads -->\s*',
                      '', old.get('body') or '', flags=re.S)
        patch = {'body': block + body}
        if old['tag_name'] == 'v1.2.0':
            patch['name'] = 'SoundSync 1.2.0 — полная сборка для первой установки'
        request('PATCH', old['url'], patch)
        print('Added full-download links:', old['tag_name'], flush=True)


if __name__ == '__main__':
    main()
