import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
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
   }
  }
 });
});

test('Optional encrypted Auth/Vault census admits exact 13 count-only fields; rejects any extra identity, bad type or symlink',async()=>{
 await sandbox(async dir=>{
  const {KEYS,SCHEMA}=await import('../scripts/ops/m44_auth_vault_cardinality_contract.mjs');
  const good={schema:SCHEMA,captured_at:'2026-11-15T03:31:27.123456Z',
   counts:Object.fromEntries(KEYS.map(key=>[key,0]))};
  const filename=path.join(dir,'auth-vault-source.json');
  const check=String.raw`import pathlib,runpy,sys
g=runpy.run_path(sys.argv[1])
g["validate_optional_auth_census"](pathlib.Path(sys.argv[2]))
`;
  const runCheck=()=>run('-c',check,guard,filename);
  const {writeFile,symlink,unlink}=await import('node:fs/promises');
  await writeFile(filename,JSON.stringify(good));
  assert.equal(runCheck().status,0,runCheck().output);
  for(const bad of [
   {...good,email:'private@example.invalid'},
   {...good,counts:{...good.counts,auth_sessions:'1'}},
   {...good,counts:{...good.counts,auth_users:-1}},
   {...good,counts:{auth_users:1}},
  ]){
   await writeFile(filename,JSON.stringify(bad));
   const result=runCheck();
   assert.notEqual(result.status,0);
   assert.doesNotMatch(result.output,/private@example|auth_sessions|sensitive data/);
  }
  await unlink(filename);
  const original=path.join(dir,'original.json');
  await writeFile(original,JSON.stringify(good));
  await symlink(original,filename);
  assert.notEqual(runCheck().status,0);
 });
});
