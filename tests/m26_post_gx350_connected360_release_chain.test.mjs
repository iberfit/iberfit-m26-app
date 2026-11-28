import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const path='scripts/data-safety/connected360_v48_v58_isolated_pg17.sh';
const source=fs.readFileSync(path,'utf8');
const workflow=fs.readFileSync('.github/workflows/m26-c-connected360-isolated-pg17.yml','utf8');
test('provider release chain harness only permits disposable local PG17',()=>{
 assert.equal(spawnSync('bash',['-n',path]).status,0);
 const disposableDbCredential=Array.from({length:64},()=> 'a').join('');
 const env={PATH:process.env.PATH,IBERFIT_PG17_SYNTHETIC_ONLY:'YES',PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGPASSWORD:disposableDbCredential};
 for(const key of Object.keys(env).filter(k=>k!=='PATH')){
  const result=spawnSync('bash',[path],{env:{...env,[key]:'invalid'},encoding:'utf8',timeout:5000});
  assert.equal(result.status,65,key);
  assert.match(result.stderr,/CONNECTED360_CHAIN_ISOLATED_PG17_ONLY/u);
 }
 assert.match(source,/CONNECTED360_CHAIN_FRESH_PG17_REQUIRED/u);
});
test('provider chain runs every unmodified candidate in order and retains the two original jobs',()=>{
 const stages=[...source.matchAll(/-f \/repo\/supabase\/release-procedures\/connected360_v(\d+)_\w+_v1\.sql/g)].map(m=>Number(m[1]));
 assert.deepEqual(stages,Array.from({length:11},(_,i)=>48+i));
 assert.match(source,/baseline_fingerprints\.sql/u);
 assert.match(source,/role_lifecycle\.sql/u);
 assert.match(source,/android_isolation\.sql/u);
 assert.match(source,/disabled_surfaces\.sql/u);
 assert.match(workflow,/isolated-pg17-provider-release-chain:/u);
 assert.match(workflow,/isolated-pg17-roles-and-rollback:/u);
 assert.match(workflow,/isolated-pg17-document-consent:/u);
 assert.doesNotMatch(workflow,/secrets\./u);
});

test('disposable PG17 CI uses per-run random credentials, loopback and cleanup',()=>{
 const launcher='scripts/data-safety/run_disposable_pg17_ci.sh';
 const body=fs.readFileSync(launcher,'utf8');
 assert.equal(spawnSync('bash',['-n',launcher]).status,0);
 assert.match(body,/openssl rand -hex 32/u);
 assert.match(body,/add-mask/u);
 assert.match(body,/-p 127\.0\.0\.1:5432:5432/u);
 assert.match(body,/trap 'docker rm -f "\$container_id"/u);
 assert.equal((workflow.match(/run_disposable_pg17_ci\.sh scripts\/data-safety\//gu)||[]).length,3);
 assert.doesNotMatch(workflow,/synthetic-local-only/u);
 const result=spawnSync('bash',[launcher,path],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
 assert.equal(result.status,65);
 assert.match(result.stderr,/DISPOSABLE_PG17_CI_ONLY/u);
});

test('V48 summary transformation and rollback use the exact inverse with pinned catalog hashes',()=>{
 const base='supabase/release-procedures/connected360_v48_owner_activity_history_v1';
 const forward=fs.readFileSync(base+'.sql','utf8'),reverse=fs.readFileSync(base+'.rollback.sql','utf8');
 const pairs=s=>[...s.matchAll(/d:=replace\(d,\$before\$([^]*?)\$before\$,\$after\$([^]*?)\$after\$\);/gu)].map(m=>[m[1],m[2]]);
 assert.equal(pairs(forward).length,5);
 assert.deepEqual(pairs(reverse),pairs(forward).map(([a,b])=>[b,a]));
 for(const text of [forward,reverse]){
  assert.match(text,/6dbbb0b2fb17b97fb10cdfb4a158dd33/u);
  assert.match(text,/74ce2bde4cb3edef05b2be6e6ed0d071/u);
  assert.match(text,/M26_V48_SUMMARY_VERIFY_DRIFT/u);
  assert.doesNotMatch(text,/CREATE OR REPLACE FUNCTION public\.m26_wearable_v46_my_summary_prod_v1/u);
 }
 assert.match(source,/CONNECTED360_V48_EXACT_ROLLBACK_REINSTALL_SUCCESS/u);
});
