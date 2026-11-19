import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareMissingLocalRoles,prepareFile} from '../scripts/ops/m44_prepare_missing_local_roles.mjs';

const roles=['postgres','anon','authenticated','authenticator','service_role',
 'supabase_admin','supabase_auth_admin','supabase_storage_admin','cli_login_postgres'];
const dump=()=>`-- PostgreSQL database cluster dump
${roles.map(x=>`CREATE ROLE ${x};
ALTER ROLE ${x} WITH NOLOGIN;`).join('\n')}
GRANT anon TO authenticated;
-- ${'archive synthetic fixture '.repeat(18)}
`;
test('reconcile only missing validated roles with NOLOGIN, never source SQL',()=>{
 const r=prepareMissingLocalRoles(dump(),'supabase_admin\nauthenticated\nanon\n');
 assert.equal(r.expected,roles.length);assert.equal(r.missing,roles.length-3);
 assert.match(r.sql,/CREATE ROLE "postgres" NOLOGIN/);
 assert.match(r.sql,/IF NOT EXISTS \(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='postgres'\)/);
 assert.equal((r.sql.match(/DO \$m44_local_role\$/gu)||[]).length,r.missing);
 assert.ok(r.sql.indexOf('IF NOT EXISTS')<r.sql.indexOf('CREATE ROLE "postgres" NOLOGIN'));
 assert.doesNotMatch(r.sql,/ALTER ROLE |GRANT /);
 assert.equal(r.platformRecoveryVerified,false);
});
test('no missing role results in SQL no-op',()=>{
 const r=prepareMissingLocalRoles(dump(),roles.join('\n'));
 assert.equal(r.missing,0);assert.doesNotMatch(r.sql,/CREATE ROLE/);
});
test('malicious extra role and duplicate roles fail closed',()=>{
 for(const bad of [
  dump().replace('CREATE ROLE postgres;','CREATE ROLE postgres; DROP TABLE auth.users;'),
  dump()+'CREATE ROLE anon;\n',
  dump().replace('CREATE ROLE cli_login_postgres;','CREATE ROLE "a-b";'),
 ])assert.throws(()=>prepareMissingLocalRoles(bad,'supabase_admin\n'));
});
test('foreign or invalid target roles rejected',()=>{
 for(const target of ['', 'postgres\n', 'supabase_admin\nroot-admin\n',
  'supabase_admin\nsupabase_admin\n','supabase_admin\n\0'])
  assert.throws(()=>prepareMissingLocalRoles(dump(),target));
});
test('private output path and permissions enforced, no overwrite',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m44-reconcile-'));
 try{
  const isolation=path.join(root,'isolated');
  const out=path.join(isolation,'backend-drill-private');
  fs.mkdirSync(out,{recursive:true});
  const archive=path.join(isolation,'global-roles.sql');
  const existing=path.join(out,'existing-roles.txt');
  const output=path.join(out,'missing-role-ddl.sql');
  fs.writeFileSync(archive,dump());fs.writeFileSync(existing,'supabase_admin\n');
  const r=prepareFile(archive,existing,output);assert.equal(r.expected,roles.length);
  assert.equal(fs.statSync(output).mode&0o777,0o600);
  assert.throws(()=>prepareFile(archive,existing,output));
  assert.throws(()=>prepareFile(archive,path.join(root,'foreign.txt'),path.join(root,'forbidden.sql')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
