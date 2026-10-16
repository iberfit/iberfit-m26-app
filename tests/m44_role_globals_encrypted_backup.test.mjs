import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateRoleGlobals} from '../scripts/ops/m44_global_roles_archive_check.mjs';

const CORE=['postgres','anon','authenticated','authenticator','service_role',
 'supabase_admin','supabase_auth_admin','supabase_storage_admin'];
const fixture=()=>[
 '--','-- PostgreSQL database cluster dump','--',
 '-- Dumped from database version 17.6','-- Dumped by pg_dumpall version 17.6',
 ...CORE.flatMap(name=>['','CREATE ROLE '+name+';',
  'ALTER ROLE '+name+' WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION;']),
 'GRANT authenticated TO authenticator;',
 '-- PostgreSQL database cluster dump complete'
].join('\n');
test('password-free global role dump captures required Supabase roles but certifies NO role restore',()=>{
 const p=validateRoleGlobals(fixture());
 assert.equal(p.valid,true);
 assert.equal(p.coreRoleCount,8);
 assert.equal(p.roleStatementCount,8);
 assert.match(p.sha256,/^[a-f0-9]{64}$/);
 assert.equal(p.rolesRestored,false);
 assert.equal(p.hostedAuthVerified,false);
});
test('password clause is never accepted even when role and filename appear valid',()=>{
 for(const fragment of [
  "ALTER ROLE postgres WITH PASSWORD 'sensitive-synthetic-only';",
  "ALTER ROLE postgres WITH PASSWORD NULL;",
  "CREATE ROLE synthetic WITH LOGIN PASSWORD 'synthetic-not-real';"
 ])assert.throws(()=>validateRoleGlobals(fixture()+'\n'+fragment),/PASSWORD_CLAUSE_FORBIDDEN/);
});
test('missing built-in role and malformed dump fail without printing data',()=>{
 assert.throws(()=>validateRoleGlobals(fixture().replace('CREATE ROLE service_role;','-- omitted role')),/BUILTIN_ROLE_MISSING/);
 assert.throws(()=>validateRoleGlobals('CREATE ROLE postgres;'),/EXPORT_SIZE_INVALID/);
});
test('CLI only prints fixed status; rejects symlink and existing private paths',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-roles-'));
 try{
  const dump=path.join(dir,'role-global-private.sql');
  const link=path.join(dir,'role-symlink-private.sql');
  fs.writeFileSync(dump,fixture(),{mode:0o600});
  fs.symlinkSync(dump,link);
  const run=file=>spawnSync(process.execPath,['scripts/ops/m44_global_roles_archive_check.mjs',file],{encoding:'utf8'});
  const a=run(dump);
  assert.equal(a.status,0,a.stderr);
  assert.match(a.stdout,/IBERFIT_GLOBAL_ROLES_ENCRYPTABLE:core=8:application_NOT_certified/);
  assert.doesNotMatch(a.stdout,/postgres|authenticator|sensitive/);
  const b=run(link);
  assert.notEqual(b.status,0);
  assert.match(b.stderr,/FILE_INVALID/);
  assert.doesNotMatch(b.stderr,/role-symlink-private|postgres/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('backup includes passwordless roles within ciphertext and never replays into production',()=>{
 const w=fs.readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const production=w.split('  production-backup:')[1]||'';
 const p=production.indexOf('pg_dump -Fc'),globals=production.indexOf('pg_dumpall'),storage=production.indexOf('m44_storage_backup_bytes.mjs export');
 const encrypt=production.indexOf('m44_encrypted_backup_archive.mjs encrypt');
 assert.ok(p>0&&p<globals&&globals<storage&&storage<encrypt);
 assert.match(w,/pg_dumpall[^\n]*--roles-only[^\n]*--no-role-passwords/);
 assert.match(w,/m44_global_roles_archive_check\.mjs/);
 assert.match(w,/database\.pgcustom\s+global-roles\.sql\s+storage/);
 assert.doesNotMatch(w,/psql[^\n]*-f [^\n]*global-roles\.sql/);
 assert.match(w,/IBERFIT_GLOBAL_ROLES_ARCHIVED_BUT_NOT_APPLIED/);
});
