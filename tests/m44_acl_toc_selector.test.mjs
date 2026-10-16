import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {selectPrivilegeToc,writePrivilegeToc} from '../scripts/ops/m44_acl_toc_selector.mjs';

const fixture=()=>[
 ';','; Archive created at 2026-10-16 08:00:00 UTC',';     dbname: synthetic',
 ';     TOC Entries: 5',';',
 '1; 2615 2200 SCHEMA - private_fixture synthetic_owner',
 '2; 1259 24000 TABLE private_fixture.exercise synthetic_owner',
 '3; 0 0 TABLE DATA private_fixture.exercise synthetic_owner',
 '4; 0 0 ACL private_fixture TABLE exercise synthetic_owner',
 '5; 0 0 DEFAULT ACL private_fixture DEFAULT PRIVILEGES FOR TABLES synthetic_owner',
 ''
].join('\n');

test('strict TOC selector includes exactly ACL and DEFAULT ACL records',()=>{
 const r=selectPrivilegeToc(fixture());
 assert.deepEqual([r.grants,r.defaults,r.total],[1,1,5]);
 assert.equal(r.platformRecoveryVerified,false);
 const active=r.output.split('\n').filter(line=>/^\d+;/.test(line));
 assert.deepEqual(active,[
  '4; 0 0 ACL private_fixture TABLE exercise synthetic_owner',
  '5; 0 0 DEFAULT ACL private_fixture DEFAULT PRIVILEGES FOR TABLES synthetic_owner'
 ]);
 assert.match(r.output,/;1; 2615/);
 assert.match(r.output,/;3; 0 0 TABLE DATA/);
});

test('duplicate TOC IDs, malformed lines and control characters fail closed',()=>{
 const f=fixture();
 for(const broken of [
  f.replace('5; 0 0 DEFAULT ACL','4; 0 0 DEFAULT ACL'),
  f+'evil arbitrary statement\n',
  f.replace('TABLE DATA','TABLE\u0000 DATA'),
  f.replace('2; 1259','not-an-entry; 1259'),
  f.replace('4; 0 0 ACL','4; 0 0 ACL\t\u0002'),
 ]) assert.throws(()=>selectPrivilegeToc(broken),/IBERFIT_M44_ACL_TOC_/);
});

test('cannot trick type matcher with ACL in object name or DDL descriptions',()=>{
 const f=fixture().replace('4; 0 0 ACL private_fixture TABLE exercise synthetic_owner',
  '4; 0 0 TABLE private_fixture ACL synthetic_owner');
 assert.throws(()=>selectPrivilegeToc(f),/REQUIRED_PRIVILEGES_MISSING/);
 assert.throws(()=>selectPrivilegeToc(fixture().replace('5; 0 0 DEFAULT ACL','5; 0 0 DEFAULT-ACL')),
  /REQUIRED_PRIVILEGES_MISSING/);
});

test('CLI writes only private same-directory output, never leaks object names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-toc-'));
 try{
  const src=path.join(dir,'source.list'),dst=path.join(dir,'selected.list'),bad=path.join(dir,'symlink.list');
  fs.writeFileSync(src,fixture(),{mode:0o600});
  fs.symlinkSync(src,bad);
  const proof=writePrivilegeToc(src,dst);
  assert.equal(proof.grants,1);
  assert.equal(fs.statSync(dst).mode&0o777,0o600);
  const active=fs.readFileSync(dst,'utf8').split('\n').filter(x=>/^\d+;/.test(x));
  assert.equal(active.length,2);
  assert.throws(()=>writePrivilegeToc(src,dst),/OUTPUT_WRITE_FAILED/);
  const exec=(f,t)=>spawnSync(process.execPath,['scripts/ops/m44_acl_toc_selector.mjs',f,t],{encoding:'utf8'});
  const rejected=exec(bad,path.join(dir,'symlink-dst.list'));
  assert.notEqual(rejected.status,0);
  assert.doesNotMatch(rejected.stderr,/private_fixture|synthetic_owner|source\.list/);
  const otherDir=fs.mkdtempSync(path.join(os.tmpdir(),'m44-other-'));
  try{
   const x=exec(src,path.join(otherDir,'target.list'));
   assert.notEqual(x.status,0);assert.match(x.stderr,/WORKSPACE_MISMATCH/);
  }finally{fs.rmSync(otherDir,{recursive:true,force:true});}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('encrypted backup workflow runs selector only after decrypting, without replaying ACL onto PROD',()=>{
 const y=fs.readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const prod=y.split('  production-backup:')[1]||'';
 const decrypted=prod.indexOf('m44_encrypted_backup_archive.mjs decrypt');
 const toc=prod.indexOf('pg_restore --list /work/database.pgcustom');
 const selector=prod.indexOf('m44_acl_toc_selector.mjs');
 const marker=prod.indexOf('IBERFIT_PGCUSTOM_ACL_DEFAULTS_ARCHIVED_ENCRYPTED_ONLY');
 assert.ok(decrypted>=0&&decrypted<toc&&toc<selector&&selector<marker);
 assert.match(prod,/rm -f "\$WORK\/isolated\/acl-toc-private\.list" "\$WORK\/isolated\/acl-only-private\.list"/);
 assert.doesNotMatch(prod,/pg_restore[^\n]+--use-list=[^\n]+--dbname="\$IBERFIT_PROD_DATABASE_URL"/);
});
