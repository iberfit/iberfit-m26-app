import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const release=readFileSync(new URL('../qa/signature-u40/prod-client-privacy-guarded-release.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../qa/signature-u40/prod-client-privacy-guarded-rollback.sql',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/signature-u40/verify-prod-patch-parity.qa.sql',import.meta.url),'utf8');
const executable=s=>s.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
test('U40 exact PROD baseline and result require prior matching postgres-controlled SECURITY DEFINER',()=>{
 assert.match(release,/md5\(pg_get_functiondef\('public\.iberfit_bootstrap_v26_rc29\(\)'::regprocedure\)\)\s*='6ca1d901bb26ceedccfb7dc15945451d'/u);
 assert.match(release,/='7fb270cb0f55f0f1f9918ac9b5d69178'/u);
 assert.match(release,/pg_get_userbyid\(proowner\)='postgres'/u);
 assert.match(release,/prosecdef AND provolatile='s'/u);
 assert.match(release,/SET search_path TO ''/u);
 assert.match(release,/Dedicated data\.checkins is the canonical Client check-in collection/u);
 assert.match(release,/Avoid serializing the same check-in a second time in m26Entities/u);
 assert.match(release,/WHERE key='environment'\)='PRODUCTION'/u);
 assert.match(release,/BEGIN;[\s\S]*COMMIT;/u);
 assert.equal((release.match(/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_rc29\(\)/gu)||[]).length,1);
});
test('U40 only narrows client private/event scope, while retaining all existing coach/admin projections',()=>{
 assert.match(release,/'domainEvents',case when v_role in \('client','cliente'\) then '\[\]'::jsonb/u);
 for(const kind of ['private_note','intelligence','report','checkin'])
   assert.ok(release.includes(kind),'exclude internal Client entity: '+kind);
 for(const state of ['publicado','publicada','published','disponible','completado','completada','completed'])
   assert.ok(release.includes("'"+state+"'"),'published state remains allowed: '+state);
 assert.ok(!/in[\s\n]+\([^\)]*'validado'/u.test(release),'validated plans must not be public');
 assert.match(release,/public\.iberfit_m43_client_safe_plan_v2/u);
 assert.match(release,/public\.iberfit_m43_client_safe_session_v2/u);
 assert.match(release,/public\.iberfit_m43_client_safe_execution_v1/u);
 assert.match(release,/e\.body->>'visibleToClient','true'/u);
 for(const sql of [release,rollback]){
   assert.doesNotMatch(executable(sql),/\b(ALTER ROLE|GRANT|REVOKE|TRUNCATE|DELETE FROM|UPDATE\s+\w+\s+SET|statement_timeout)\b/iu);
 }
});
test('U40 reverse direction is baseline-pinned and restores prior PROD source exactly',()=>{
 assert.match(rollback,/='7fb270cb0f55f0f1f9918ac9b5d69178'/u);
 assert.match(rollback,/='6ca1d901bb26ceedccfb7dc15945451d'/u);
 assert.match(rollback,/WHERE key='environment'\)='PRODUCTION'/u);
 assert.match(rollback,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_rc29\(\)/u);
 assert.doesNotMatch(rollback,/'domainEvents',case when v_role in \('client','cliente'\)/u);
 assert.doesNotMatch(rollback,/e\.entity_type not in \('private_note','intelligence','report'\)/u);
});
test('U40 QA parity tests all three roles and two clients without mutation',()=>{
 for(const label of ["'coach','qa.rc74.coach@iberfit.cl'","'admin','qa.rc74.admin@iberfit.cl'",
   "'cliente','qa.rc74.client-a@iberfit.cl'","'cliente','qa.rc74.client-b@iberfit.cl'"])
   assert.ok(qa.includes(label));
 assert.match(qa,/v_src IS DISTINCT FROM v_target/u);
 assert.match(qa,/public\.iberfit_bootstrap_v26_rc29\(\)/u);
 assert.match(qa,/private\.iberfit_bootstrap_v26_rc29_u40_qa\(\)/u);
 assert.doesNotMatch(executable(qa),/^\s*COMMIT\s*;|\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+public\./imu);
});
