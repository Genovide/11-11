"""Validate both release ZIPs, manifests and platform separation."""
import hashlib,json,pathlib,zipfile

dist=pathlib.Path('dist')
for platform,arch in [('Windows','x64'),('macOS','arm64')]:
    name=f'SoundSync-1.2.3-Update-{platform}-{arch}.zip'
    with zipfile.ZipFile(dist/name) as z:
        assert z.testzip() is None
        names=set(z.namelist())
        entries=json.loads(z.read('manifest.json'))
        assert len({e['path'] for e in entries})==len(entries)
        assert {n for n in names if n.startswith('payload/')}=={'payload/'+e['path'] for e in entries}
        for e in entries:
            p=pathlib.PurePosixPath(e['path'])
            assert not p.is_absolute() and '..' not in p.parts and p.parts[0].lower()!='data'
            assert hashlib.sha256(z.read('payload/'+e['path'])).hexdigest()==e['sha256'],e['path']
        sums=z.read('SHA256SUMS-payload.txt').decode().splitlines()
        assert set(sums)=={e['sha256']+'  payload/'+e['path'] for e in entries}
        repairs=[e for e in entries if e['path'].startswith('alignment/runtime/')]
        if platform=='Windows':
            assert len(repairs)==53
            assert all(n in names for n in ['Update-SoundSync.ps1','Update-Archive.ps1','Update-Transaction.ps1','base.json'])
            assert not any(n.endswith('.command') for n in names)
        else:
            assert not repairs and 'base.json' not in names
            assert not any(n.endswith(('.ps1','.bat','.exe','.dll','.pyd')) for n in names)
            info=z.getinfo('Update-SoundSync.command')
            assert (info.external_attr>>16)&0o111
            assert b'\r' not in z.read(info)
        print(platform,'ZIP, hashes, paths and platform separation passed')
