"""Import immutable, checksum-verified build outputs into the draft release."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
from urllib.parse import urlparse
import zipfile

event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
url = event['inputs']['artifactUrl']
host = urlparse(url).hostname or ''
if urlparse(url).scheme != 'https' or not (host.endswith('.blob.core.windows.net') or host.endswith('.githubusercontent.com')):
    raise ValueError('Unexpected artifact storage host')
print('::add-mask::' + url)
with urllib.request.urlopen(url, timeout=120) as response, open('artifact.zip', 'wb') as output:
    shutil.copyfileobj(response, output)
names = ['SoundSync-1.2.0-macOS-arm64.zip', 'SoundSync-1.2.0-macOS-arm64.dmg', 'SoundSync-1.2.0-Update-macOS-arm64.zip']
allowed = names + ['SHA256SUMS-macOS.txt', 'BUILD-INFO.json']
Path('dist').mkdir(exist_ok=True)
with zipfile.ZipFile('artifact.zip') as archive:
    for name in allowed:
        matches = [i for i in archive.infolist() if Path(i.filename).name == name]
        if len(matches) != 1:
            raise ValueError('Missing or duplicate asset: ' + name)
        with archive.open(matches[0]) as source, open(Path('dist') / name, 'wb') as target:
            shutil.copyfileobj(source, target)
checks = dict((line.split()[1], line.split()[0]) for line in Path('dist/SHA256SUMS-macOS.txt').read_text().splitlines())
for name in names:
    with open(Path('dist') / name, 'rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    if checks[name] != digest:
        raise ValueError('Checksum mismatch: ' + name)
    print('Verified ' + name)
subprocess.run(['gh', 'release', 'upload', 'v1.2.0', *['dist/' + n for n in allowed], '--repo', os.environ['GITHUB_REPOSITORY'], '--clobber'], check=True)
