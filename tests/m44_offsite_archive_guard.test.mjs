import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const guard='scripts/ops/m44_offsite_archive_guard.py';
const makeFixture=String.raw`
import io, pathlib, stat, sys, tarfile, zipfile
mode,dest = sys.argv[1:]
if mode.startswith('zip'):
    payload=b'IBFBAK01'+bytes(range(256))*4
    if mode=='zip-badmagic': payload=b'PLAINTXT'+payload[8:]
    with zipfile.ZipFile(dest,'w') as f:
        info=zipfile.ZipInfo('iberfit-prod-recovery.ibf' if mode!='zip-traversal' else '../passwords.txt')
        info.external_attr=(stat.S_IFREG|0o600)<<16
        f.writestr(info,payload)
        if mode=='zip-extra': f.writestr('extra.sql','not allowed')
elif mode.startswith('tar'):
    with tarfile.open(dest,'w') as f:
        for name,body in [('database.pgcustom',b'PGDMP safe synthetic'),
                          ('storage/manifest.json',b'{}'),
                          ('storage/files/000000.bin',b'fixture')]:
            info=tarfile.TarInfo(name)
            info.size=len(body)
            f.addfile(info,io.BytesIO(body))
        if mode=='tar-traversal':
            info=tarfile.TarInfo('../outside.bin')
            info.size=4
            f.addfile(info,io.BytesIO(b'oops'))
        if mode=='tar-symlink':
            info=tarfile.TarInfo('storage/files/000001.bin')
            info.type=tarfile.SYMTYPE
            info.linkname='/etc/passwd'
            f.addfile(info)
`;
function run(...args){
 const r=spawnSync('python3',args,{encoding:'utf8',timeout:15000});
 return {status:r.status,output:(r.stdout||'')+(r.stderr||''),error:r.error};
}
function fixture(mode,dest){
 const result=run('-c',makeFixture,mode,dest);
 assert.equal(result.status,0,result.output);
}
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sandbox(fn){
 const dir=await mkdtemp(path.join(os.tmpdir(),'iberfit-offsite-fixture-'));
 try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
test('Independent ZIP byte identity and ciphertext-only boundary pass on synthetic fixture',async()=>{
 await sandbox(async dir=>{
  const zip=path.join(dir,'source.zip'),out=path.join(dir,'source.ibf');
  fixture('zip-valid',zip);
  const result=run(guard,'unwrap',zip,sha256(await readFile(zip)),out);
  assert.equal(result.status,0,result.output);
  assert.match(result.output,/CIPHERTEXT_VERIFIED/);
  const restored=await readFile(out);
  assert.equal(restored.subarray(0,8).toString(),'IBFBAK01');
 });
});
test('Offsite verification rejects checksum mismatch, traversal, extra ZIP files and unencrypted input',async()=>{
 await sandbox(async dir=>{
  for(const mode of ['zip-valid','zip-extra','zip-traversal','zip-badmagic']){
   const zip=path.join(dir,mode+'.zip'),out=path.join(dir,mode+'.ibf');
   fixture(mode,zip);
   const digest=mode==='zip-valid'?'0'.repeat(64):sha256(await readFile(zip));
   const result=run(guard,'unwrap',zip,digest,out);
   assert.notEqual(result.status,0,mode);
   await assert.rejects(stat(out),{code:'ENOENT'});
  }
 });
});
test('Restored TAR uses an explicit whitelist; traversal and symlink fail closed',async()=>{
 await sandbox(async dir=>{
  for(const mode of ['tar-valid','tar-traversal','tar-symlink']){
   const tar=path.join(dir,mode+'.tar'),out=path.join(dir,mode);
   fixture(mode,tar);
   await import('node:fs/promises').then(fs=>fs.mkdir(out));
   const result=run(guard,'unpack',tar,out);
   if(mode==='tar-valid'){
    assert.equal(result.status,0,result.output);
    assert.match(result.output,/ARCHIVE_STRUCTURE_VERIFIED/);
   }else{
    assert.notEqual(result.status,0,mode);
    assert.deepEqual(await readdir(out),[],mode+' left partially extracted bytes');
    assert.doesNotMatch(result.output,/ARCHIVE_STRUCTURE_VERIFIED/);
   }
  }
 });
});


test('ZIP unwrap refuses existing files and dangling symlinks without removing them',async()=>{
 await sandbox(async dir=>{
  const zip=path.join(dir,'source.zip');
  fixture('zip-valid',zip);
  const expected=sha256(await readFile(zip));
  const existing=path.join(dir,'existing.ibf');
  await writeFile(existing,'preserve-private-file');
  const denied=run(guard,'unwrap',zip,expected,existing);
  assert.notEqual(denied.status,0);
  assert.equal((await readFile(existing,'utf8')),'preserve-private-file');
  const missing=path.join(dir,'not-yet-created.ibf');
  const alias=path.join(dir,'dangling.ibf');
  await symlink(missing,alias);
  const linked=run(guard,'unwrap',zip,expected,alias);
  assert.notEqual(linked.status,0);
  assert.equal(await readlink(alias),missing);
  await assert.rejects(stat(missing),{code:'ENOENT'});
  assert.doesNotMatch(linked.output,/CIPHERTEXT_VERIFIED/);
 });
});


test('reject TAR size bomb at member header and truncated copy before final publication',async()=>{
 await sandbox(async dir=>{
  const tar=path.join(dir,'source.tar');
  fixture('tar-valid',tar);
  const python=String.raw\`
import importlib.util,sys
spec=importlib.util.spec_from_file_location('m44_fixture_guard',sys.argv[1])
guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard)
mode,archive,destination=sys.argv[2:]
if mode=='storage':guard.MAX_STORAGE_OBJECT_BYTES=4
elif mode=='manifest':guard.MAX_JSON_BYTES=1
elif mode=='shortcopy':
 def one_byte(source,destination,length):destination.write(source.read(1))
 guard.shutil.copyfileobj=one_byte
else:sys.exit(13)
try:guard.unpack_tar(archive,destination)
except ValueError as e:
 if str(e) not in ('IBERFIT_OFFSITE_TAR_MEMBER_TOO_LARGE',
                   'IBERFIT_OFFSITE_TAR_MEMBER_SIZE_MISMATCH'):
  sys.exit(14)
 sys.exit(0)
sys.exit(15)
\`;
  for(const mode of ['storage','manifest','shortcopy']){
   const out=path.join(dir,mode);
   await import('node:fs/promises').then(fs=>fs.mkdir(out));
   const r=run('-c',python,guard,mode,tar,out);
   assert.equal(r.status,0,mode+':'+r.output);
   assert.deepEqual(await readdir(out),[],mode+' left unverified files');
   assert.doesNotMatch(r.output,/ARCHIVE_STRUCTURE_VERIFIED/);
  }
 });
});
