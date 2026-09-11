import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const migration=read('supabase/migrations/20260911045500_p0_health_rpc_least_privilege_v1.sql');
const rollback=read('backend/P0_HEALTH_RPC_LEAST_PRIVILEGE_ROLLBACK.sql');
const transport=read('src/m26/supabase-transport.js');
const publicBridge=read('supabase/migrations/20260905234500_exercise_media_runtime_bridge_v1.sql');

const HEALTH=[
  'm26_backend_health_v43',
  'm26_backend_health_v431',
  'm26_wearable_health_v44',
];

test('P0 health RPC migration is additive, transactional and fail-closed',()=>{
  assert.match(migration,/^-- IBERFIT P0/u);
  assert.match(migration,/\nbegin;\n/u);
  assert.match(migration,/\ncommit;\s*$/u);
  assert.doesNotMatch(migration,/drop\s+(?:table|function|schema)/iu);
  assert.match(migration,/IBERFIT_P0_HEALTH_RPC_REQUIRED/u);
  assert.match(migration,/IBERFIT_P0_HEALTH_RPC_ANON_EXECUTE_FORBIDDEN/u);
  assert.match(migration,/IBERFIT_P0_HEALTH_RPC_SECURITY_INVOKER_REQUIRED/u);
});

test('P0 health RPCs become SECURITY INVOKER and anonymous execution is revoked',()=>{
  for(const name of HEALTH){
    assert.match(migration,new RegExp(`alter function public\\.${name}\\(\\) security invoker`,'u'));
    assert.match(migration,new RegExp(`revoke all on function public\\.${name}\\(\\) from public, anon, authenticated`,'u'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${name}\\(\\) to authenticated, service_role`,'u'));
  }
});

test('client transport requires a real session token before health network access',()=>{
  assert.match(transport,/async function backendHealth\(token\)\{\s*if\(!token\)throw new Error\('M26_RC43_HEALTH_AUTH_REQUIRED'\)/u);
  assert.match(transport,/async function draftBackendHealth\(token\)\{\s*if\(!token\)throw new Error\('M26_RC431_HEALTH_AUTH_REQUIRED'\)/u);
  assert.match(transport,/async function wearableHealth\(token\)\{\s*if\(!token\)throw new Error\('M26_RC44_HEALTH_AUTH_REQUIRED'\)/u);
  assert.match(transport,/RC43_RPC\.health,?\{method:'POST',token,body:'\{\}'\}/u);
  assert.match(transport,/RC431_RPC\.health,?\{method:'POST',token,body:'\{\}'\}/u);
  assert.match(transport,/RC44_RPC\.health,?\{method:'POST',token,body:'\{\}'\}/u);
});

test('only brand exercise content remains deliberately anonymous in the reviewed bridge',()=>{
  assert.match(publicBridge,/grant execute on function public\.iberfit_exercise_catalog_public_v1\(integer,integer\) to anon,authenticated/u);
  assert.match(publicBridge,/grant execute on function public\.iberfit_exercise_media_manifest_v1\(\) to anon,authenticated/u);
  assert.doesNotMatch(migration,/iberfit_exercise_catalog_public_v1/u);
  assert.doesNotMatch(migration,/iberfit_exercise_media_manifest_v1/u);
});

test('emergency rollback is guarded and cannot run accidentally',()=>{
  assert.match(rollback,/IBERFIT_P0_HEALTH_RPC_ROLLBACK_NOT_AUTHORIZED/u);
  assert.match(rollback,/iberfit\.allow_p0_health_rpc_security_rollback/u);
  assert.match(rollback,/emergency-approved/u);
  assert.match(rollback,/security definer/u);
  assert.match(rollback,/\ncommit;\s*$/u);
});
