import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const guard='scripts/ops/m44_offsite_archive_guard.py';
const build=String.raw`
import hashlib,io,json,sys,tarfile
mode,dest=sys.argv[1:]
a=dict(bucket_id='private',name='f/a.bin',
 id='11111111-1111-4111-8111-111111111111',
 version='v1',updated_at='2026-10-16T02:01:02.123456Z',size='3')
rows=[a]
entry=dict(bucket='private',name='f/a.bin',relative='files/000000.bin',
 bytes=3,sha256=hashlib.sha256(b'abc').hexdigest())
manifest=dict(schema='iberfit.storage.backup.v1',project='pjhmrhejsoofmouedavw',
 objects=[entry])
catalog=dict(schema='iberfit.m44.platform.catalog.v1')
for key in ('roles','role_memberships','relation_security','default_privileges',
 'function_security','policies','triggers','constraints','indexes','extensions',
 'bucket_configuration','migration_history'):
 catalog[key]='b'*64
parts=[('database.pgcustom',b'PGDMP backed fixture'),
 ('storage/manifest.json',json.dumps(manifest).encode()),
 ('storage/files/000000.bin',b'abc')]
if mode!='legacy':
 if mode=='changed': a['size']='4'
 if mode=='duplicate': rows=[a,a]
 if mode=='missing-manifest':parts[1]=('storage/manifest.json',b'{}')
 if mode=='bad-catalog': catalog['roles']='not SHA'
 if mode=='bad-storage-hash':entry['sha256']='b'*64
 if mode=='bad-storage-size':entry['bytes']=2
 if mode=='tampered-storage-bytes':parts[2]=('storage/files/000000.bin',b'xyz')
 if mode=='missing-storage-file':parts.pop(2)
 if mode=='orphan-storage-file':parts.append(('storage/files/000001.bin',b'unknown'))
 parts.extend([
  ('storage-inventory.json',json.dumps([dict(a, size='3')]).encode()),
  ('storage-post-inventory.json',json.dumps(rows).encode()),
  ('platform-catalog-source.json',json.dumps(catalog).encode())
 ])
 if mode=='partial':parts.pop()
 if mode=='bad-json':parts[-1]=('platform-catalog-source.json',b'{bad json}')
 if mode=='extra-member':parts.append(('untrusted.ini',b'x'))
 if mode=='fake-meta':parts.append(('storage-inventory.json',b'[]'))
if mode.startswith('roles'):
 if mode=='roles-legacy':
  parts=[v for v in parts if v[0] not in (
   'storage-inventory.json','storage-post-inventory.json','platform-catalog-source.json')]
 role_names=['postgres','anon','authenticated','authenticator','service_role',
  'supabase_admin','supabase_auth_admin','supabase_storage_admin']
 lines=['--','-- PostgreSQL database cluster dump','--',
  '-- Dumped from database version 17.6','-- Dumped by pg_dumpall version 17.6']
 for role in role_names:
  if mode=='roles-missing' and role=='service_role':continue
  lines.extend(['CREATE ROLE '+role+';',
   'ALTER ROLE '+role+' WITH NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOLOGIN NOREPLICATION;'])
 lines.append('-- PostgreSQL database cluster dump complete')
 if mode=='roles-password':lines.append("ALTER ROLE postgres WITH PASSWORD 'fixture-not-real';")
 if mode=='roles-truncated':lines=[x for x in lines if 'dump complete' not in x]
 parts.append(('global-roles.sql','\n'.join(lines).encode()))
if mode=='legacy-traversal':parts.append(('../evil.txt',b'not allowed'))
with tarfile.open(dest,'w') as f:
 for name,body in parts:
  m=tarfile.TarInfo(name)
  m.size=len(body)
  f.addfile(m,io.BytesIO(body))
`;

function call(...args){
 const p=spawnSync('python3',args,{encoding:'utf8',timeout:20000});
 assert.equal(p.error,undefined,String(p.error));
 return {ok:p.status===0,stdout:p.stdout,stderr:p.stderr};
}
async function inScratch(fn){
 const d=await mkdtemp(path.join(os.tmpdir(),'if-m44-format-'));
 try{await fn(d);}finally{await rm(d,{recursive:true,force:true});}
}
test('M44 historical and enriched genuine layouts are both accepted',async()=>{
 await inScratch(async d=>{
  for(const mode of ['legacy','enriched','roles-valid']){
   const tar=path.join(d,mode+'.tar'),dst=path.join(d,mode);
   assert.equal(call('-c',build,mode,tar).ok,true);
   await mkdir(dst);
   const r=call(guard,'unpack',tar,dst);
   assert.equal(r.ok,true,r.stderr);
   assert.match(r.stdout,/ARCHIVE_STRUCTURE_VERIFIED/);
   if(mode==='legacy'){
    assert.doesNotMatch(r.stdout,/ENRICHED_STORAGE_BYTES_SHA256_VERIFIED/);
   }else{
    assert.match(r.stdout,/ENRICHED_STORAGE_BYTES_SHA256_VERIFIED/);
   }
  }
 });
});
test('M44 extension cannot be partial, corrupt, mismatched or unknown',async()=>{
 await inScratch(async d=>{
  for(const mode of ['changed','duplicate','missing-manifest','bad-catalog','partial','bad-json','extra-member','fake-meta','legacy-traversal','roles-legacy','roles-password','roles-missing','roles-truncated','bad-storage-hash','bad-storage-size','tampered-storage-bytes','missing-storage-file','orphan-storage-file']){
   const tar=path.join(d,mode+'.tar'),dst=path.join(d,mode);
   assert.equal(call('-c',build,mode,tar).ok,true);
   await mkdir(dst);
   const r=call(guard,'unpack',tar,dst);
   assert.equal(r.ok,false,mode+' unexpectedly passed');
   assert.doesNotMatch(r.stderr,/f\/a\.bin|private|11111111/);
  }
 });
});


test('M44 restored enriched archive validates every binary blob, not just metadata',async()=>{
 await inScratch(async d=>{
  const modes=['enriched','roles-valid','bad-storage-hash','bad-storage-size',
   'tampered-storage-bytes','missing-storage-file','orphan-storage-file'];
  for(const mode of modes){
   const tar=path.join(d,mode+'.tar'),dst=path.join(d,mode);
   assert.equal(call('-c',build,mode,tar).ok,true);
   await mkdir(dst);
   const result=call(guard,'unpack',tar,dst);
   assert.equal(result.ok,mode==='enriched'||mode==='roles-valid',mode);
   if(result.ok)assert.match(result.stdout,/ENRICHED_STORAGE_BYTES_SHA256_VERIFIED/);
   else assert.doesNotMatch(result.stdout,/ENRICHED_STORAGE_BYTES_SHA256_VERIFIED/);
   assert.doesNotMatch(result.stdout+result.stderr,/f\/a\.bin|11111111|ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/);
  }
 });
});
