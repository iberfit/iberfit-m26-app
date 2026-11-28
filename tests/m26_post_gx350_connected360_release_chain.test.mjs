import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const path='scripts/data-safety/connected360_v48_v58_isolated_pg17.sh';
const source=fs.readFileSync(path,'utf8');
const workflow=fs.readFileSync('.github/workflows/m26-c-connected360-isolated-pg17.yml','utf8');
test('provider release chain harness only permits disposable local PG17',()=>{
 assert.equal(spawnSync('bash',['-n',path]).status,0);
 const env={PATH:process.env.PATH,IBERFIT_PG17_SYNTHETIC_ONLY:'YES',PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGPASSWORD:'synthetic-local-only'};
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
 assert.match(source,/disabled_surfaces\.sql/u);
 assert.match(workflow,/isolated-pg17-provider-release-chain:/u);
 assert.match(workflow,/isolated-pg17-roles-and-rollback:/u);
 assert.match(workflow,/isolated-pg17-document-consent:/u);
 assert.doesNotMatch(workflow,/secrets\./u);
});
