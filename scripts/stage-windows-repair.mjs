import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

export function stageWindowsRepair(destination, python) {
  const archive=path.resolve('build/windows-runtime-repair.zip');
  const metadata=path.resolve('build/windows-runtime-repair.json');
  const spec=JSON.parse(fs.readFileSync(metadata,'utf8'));
  if(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==spec.archiveSha256)throw Error('Corrupt Windows runtime repair archive');
  execFileSync(python,['-I','-S','-B','-c',`
import pathlib,zipfile,json,hashlib,sys
archive,metadata,destination=map(pathlib.Path,sys.argv[1:])
spec=json.loads(metadata.read_text(encoding='utf-8'))
with zipfile.ZipFile(archive) as z:
 assert set(z.namelist())=={e['path'] for e in spec['files']}, 'Unexpected repair files'
 for e in spec['files']:
  relative=pathlib.PurePosixPath(e['path'])
  assert not relative.is_absolute() and '..' not in relative.parts, 'Unsafe repair path'
  data=z.read(e['path'])
  assert len(data)==e['size'] and hashlib.sha256(data).hexdigest()==e['sha256'], 'Corrupt repair file'
  target=destination/relative
  target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(data)
`,archive,metadata,path.resolve(destination)],{stdio:'inherit'});
  return spec;
}
