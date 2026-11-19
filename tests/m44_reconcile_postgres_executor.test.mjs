import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateLocalExecutorRoleSql,writePrivateLocalExecutor} from
 '../scripts/ops/m44_reconcile_postgres_executor.mjs';
const names=['postgres','anon','authenticated','authenticator','service_role',
 'supabase_admin','supabase_auth_admin','supabase_storage_admin',
 'supabase_privileged_role'];
const admin=['anon','authenticated','authenticator','pg_create_subscription',
 'pg_monitor','pg_read_all_data','pg_signal_backend','service_role'];
const example=()=>{
 const out=[
 '-- PostgreSQL database cluster dump',
 ...names.map(n=>'CREATE ROLE '+n+';'),
 ...names.map(n=>'ALTER ROLE '+n+' WITH NOSUPERUSER INHERIT NOCREATEDB NOCREATEROLE NOLOGIN NOREPLICATION NOBYPASSRLS;'),
 'ALTER ROLE postgres WITH NOSUPERUSER INHERIT CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS;',
 ...admin.map(n=>'GRANT '+n+' TO postgres WITH ADMIN OPTION GRANTED BY supabase_admin;'),
 'GRANT supabase_privileged_role TO postgres GRANTED BY supabase_admin;',
 '-- only synthetic data ',
 ];
 // The real dump contains exactly ONE ALTER for postgres.
 return out.filter(x=>!x.startsWith('ALTER ROLE postgres WITH NOSUPERUSER INHERIT NOCREATEDB')).join('\n')+'\n';
};
test('source-validated local executor uses NOLOGIN and reproduces nine memberships',()=>{
 const x=generateLocalExecutorRoleSql(example());
 assert.equal(x.membershipCount,9);
 assert.equal(x.platformRecoveryVerified,false);
 assert.equal(x.privilegedLoginEnabled,false);
 assert.match(x.sql,/ALTER ROLE "postgres" WITH NOSUPERUSER INHERIT CREATEDB CREATEROLE NOLOGIN REPLICATION BYPASSRLS/);
 assert.equal((x.sql.match(/WITH ADMIN OPTION;/gu)||[]).length,8);
 assert.match(x.sql,/GRANT "supabase_privileged_role" TO "postgres";/);
 assert.doesNotMatch(x.sql,/WITH SUPERUSER|PASSWORD|GRANTED BY/);
});
test('missing, duplicated or broadened source grants must fail closed',()=>{
 for(const alter of [
  x=>x.replace('GRANT pg_monitor TO postgres WITH ADMIN OPTION GRANTED BY supabase_admin;',''),
  x=>x+'GRANT anon TO postgres WITH ADMIN OPTION;',
  x=>x+'GRANT unknown_admin TO postgres;',
  x=>x.replace('GRANT anon TO postgres WITH ADMIN OPTION','GRANT anon TO postgres'),
  x=>x.replace('GRANT supabase_privileged_role TO postgres GRANTED','GRANT supabase_privileged_role TO postgres WITH ADMIN OPTION GRANTED'),
  x=>x.replace('ALTER ROLE postgres WITH NOSUPERUSER','ALTER ROLE postgres WITH SUPERUSER'),
  x=>x.replace(' CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS;',
              ' NOCREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS;'),
 ])assert.throws(()=>generateLocalExecutorRoleSql(alter(example())));
});
test('missing role archive or malicious source cannot create local privileges',()=>{
 for(const source of [
  null,'','CREATE ROLE postgres;',
  example().replace('CREATE ROLE postgres;','CREATE ROLE postgres; DROP TABLE auth.users;'),
 ])assert.throws(()=>generateLocalExecutorRoleSql(source));
});
test('private script materialization checks layout and cannot overwrite',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m44-postgres-'));
 try{
  const dir=path.join(root,'isolated');
  const priv=path.join(dir,'backend-drill-private');
  fs.mkdirSync(priv,{recursive:true});
  const archive=path.join(dir,'global-roles.sql');
  fs.writeFileSync(archive,example());
  const target=path.join(priv,'postgres-owner-restore.sql');
  const x=writePrivateLocalExecutor(archive,target);
  assert.equal(x.membershipCount,9);
  assert.equal(fs.statSync(target).mode&0o777,0o600);
  assert.throws(()=>writePrivateLocalExecutor(archive,target));
  assert.throws(()=>writePrivateLocalExecutor(archive,path.join(root,'bad.sql')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
