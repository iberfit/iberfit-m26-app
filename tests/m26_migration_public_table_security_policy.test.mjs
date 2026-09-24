import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeMigration,
  findCreatedTables,
  isPolicyMigrationFile,
  maskNonCode,
  PUBLIC_TABLE_POLICY_CUTOFF,
} from '../scripts/ci/check_migration_security_policy.mjs';

const serviceOnly=(table='example')=>`
-- IBERFIT-TABLE-ACCESS: public.${table} :: Internal operational data exposed only through narrow RPC/service paths.
-- IBERFIT-POLICY: public.${table} = service-role-only
create table if not exists public.${table} (id uuid primary key);
alter table public.${table} enable row level security;
alter table public.${table} force row level security;
revoke all on table public.${table} from public, anon, authenticated;
grant all on table public.${table} to service_role;
`;

const rlsClient=(table='client_visible')=>`
-- IBERFIT-TABLE-ACCESS: public.${table} :: Authenticated users read rows that belong to their own user identity.
-- IBERFIT-POLICY: public.${table} = rls-client
create table public.${table} (id uuid primary key, user_id uuid not null);
alter table public.${table} enable row level security;
revoke all on table public.${table} from public, anon, authenticated;
grant select on table public.${table} to authenticated;
grant all on table public.${table} to service_role;
create policy ${table}_select_own on public.${table}
  for select to authenticated using (user_id = auth.uid());
`;

function codes(sql){return analyzeMigration(sql,{file:'supabase/migrations/20260924010000_fixture.sql'}).map((item)=>item.code);}

test('policy cutoff is explicit and historical migrations remain grandfathered',()=>{
  assert.equal(PUBLIC_TABLE_POLICY_CUTOFF,'20260924000000');
  assert.equal(isPolicyMigrationFile('20260923235959_old.sql'),false);
  assert.equal(isPolicyMigrationFile('20260924000000_new.sql'),true);
  assert.equal(isPolicyMigrationFile('notes.sql'),false);
});

test('service-role-only table passes with explicit RLS and role declarations',()=>{
  assert.deepEqual(codes(serviceOnly()),[]);
});

test('direct authenticated access passes only with RLS policy in same migration',()=>{
  assert.deepEqual(codes(rlsClient()),[]);
  assert.ok(codes(rlsClient().replace(/create policy[\s\S]*$/u,'')).includes('RLS_CLIENT_POLICY_REQUIRED'));
});

test('missing RLS fails closed',()=>{
  assert.ok(codes(serviceOnly().replace('alter table public.example enable row level security;','')).includes('RLS_DECLARATION_REQUIRED'));
});

test('anon and authenticated must each be explicitly declared',()=>{
  const noAnon=serviceOnly().replace('revoke all on table public.example from public, anon, authenticated;','revoke all on table public.example from public, authenticated;');
  const noAuth=serviceOnly().replace('revoke all on table public.example from public, anon, authenticated;','revoke all on table public.example from public, anon;');
  assert.ok(codes(noAnon).includes('ANON_ACCESS_UNDECLARED'));
  assert.ok(codes(noAuth).includes('AUTHENTICATED_ACCESS_UNDECLARED'));
});

test('service_role grant is mandatory and explicit',()=>{
  assert.ok(codes(serviceOnly().replace('grant all on table public.example to service_role;','')).includes('SERVICE_ROLE_ACCESS_UNDECLARED'));
});

test('service-role-only intent rejects accidental client grant',()=>{
  const sql=serviceOnly()+`\ngrant select on table public.example to authenticated;\n`;
  assert.ok(codes(sql).includes('SERVICE_ROLE_ONLY_CLIENT_GRANT'));
});

test('security intent requires meaningful rationale and policy intent',()=>{
  const noAccessIntent=serviceOnly().replace(/-- IBERFIT-TABLE-ACCESS:.*\n/u,'');
  const noPolicyIntent=serviceOnly().replace(/-- IBERFIT-POLICY:.*\n/u,'');
  assert.ok(codes(noAccessIntent).includes('ACCESS_INTENT_REQUIRED'));
  assert.ok(codes(noPolicyIntent).includes('POLICY_INTENT_REQUIRED'));
});

test('documented no-RLS exception requires explicit disable and rationale',()=>{
  const sql=`
-- IBERFIT-TABLE-ACCESS: public.external_acl :: Table is governed by an external database privilege boundary for a documented integration.
-- IBERFIT-RLS-EXCEPTION: public.external_acl :: External integration cannot use PostgREST roles and is isolated by database role grants.
-- IBERFIT-POLICY: public.external_acl = service-role-only
create table public.external_acl(id bigint primary key);
alter table public.external_acl disable row level security;
revoke all on table public.external_acl from public, anon, authenticated;
grant all on table public.external_acl to service_role;
`;
  assert.deepEqual(codes(sql),[]);
  assert.ok(codes(sql.replace('alter table public.external_acl disable row level security;','')).includes('RLS_DECLARATION_REQUIRED'));
});

test('unqualified CREATE TABLE is rejected instead of silently assuming public',()=>{
  assert.ok(codes('create table unsafe_table(id bigint);').includes('UNQUALIFIED_CREATE_TABLE'));
});

test('explicit non-public schemas are outside this policy',()=>{
  assert.deepEqual(codes('create table private.internal_table(id bigint);'),[]);
});

test('comments, quoted strings and dollar-quoted function bodies cannot spoof CREATE TABLE detection',()=>{
  const sql=`
-- create table public.fake_comment(id int);
select 'create table public.fake_string(id int)';
create function public.fake_fn() returns void language plpgsql as $body$
begin
  perform 'create table public.fake_body(id int)';
end
$body$;
${serviceOnly('real_table')}
`;
  const tables=findCreatedTables(sql);
  assert.deepEqual(tables.map(({schema,table})=>({schema,table})),[{schema:'public',table:'real_table'}]);
  assert.deepEqual(codes(sql),[]);
  assert.equal(maskNonCode(sql).includes('fake_comment'),false);
});

test('multiple public tables are validated independently',()=>{
  const sql=serviceOnly('good_table')+`\ncreate table public.bad_table(id bigint);\n`;
  const findings=analyzeMigration(sql,{file:'supabase/migrations/20260924020000_multi.sql'});
  assert.equal(findings.some((item)=>item.table==='public.good_table'),false);
  assert.equal(findings.some((item)=>item.table==='public.bad_table'&&item.code==='RLS_DECLARATION_REQUIRED'),true);
});
