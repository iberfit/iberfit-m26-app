import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const migrationsDir=path.resolve(here,'../supabase/migrations');
const migrationFiles=fs.readdirSync(migrationsDir)
  .filter((name)=>name.endsWith('.sql'))
  .sort();

function extractDollarQuotedFunctionBody(sql,functionName){
  const normalized=sql.toLowerCase();
  const marker=`create or replace function public.${functionName}`.toLowerCase();
  const start=normalized.lastIndexOf(marker);
  if(start<0)return null;
  const tail=sql.slice(start);
  const asMatch=tail.match(/\bas\s+\$([A-Za-z0-9_]*)\$/u);
  assert.ok(asMatch,`Unable to locate dollar-quoted body for ${functionName}`);
  const delimiter=`$${asMatch[1]}$`;
  const bodyStart=(asMatch.index??0)+asMatch[0].length;
  const bodyEnd=tail.indexOf(delimiter,bodyStart);
  assert.ok(bodyEnd>=bodyStart,`Unable to locate closing delimiter for ${functionName}`);
  return tail.slice(bodyStart,bodyEnd);
}

function latestFunctionDefinition(functionName){
  let latest=null;
  for(const file of migrationFiles){
    const sql=fs.readFileSync(path.join(migrationsDir,file),'utf8').replace(/\r\n/gu,'\n');
    const body=extractDollarQuotedFunctionBody(sql,functionName);
    if(body!==null)latest={file,body};
  }
  return latest;
}

test('latest Admin bootstrap remains a primary-auth read surface',()=>{
  const latest=latestFunctionDefinition('iberfit_admin_bootstrap_v14');
  assert.ok(latest,'Admin bootstrap definition must exist in migration ledger');
  assert.doesNotMatch(latest.body,/iberfit_require_privileged_assurance_v65d/iu,
    `Read bootstrap was re-gated by privileged assurance in ${latest.file}`);
  assert.match(latest.body,/iberfit_admin_bootstrap_v14_pre_v65e/iu,
    `Admin bootstrap lost its canonical base projection in ${latest.file}`);
  assert.match(latest.body,/client_access_v26/iu,
    `Admin bootstrap lost clientAccess projection in ${latest.file}`);
});

test('latest Admin mutation surface still requires privileged assurance',()=>{
  const latest=latestFunctionDefinition('iberfit_admin_execute_v14');
  assert.ok(latest,'Admin execute definition must exist in migration ledger');
  assert.match(latest.body,/iberfit_require_privileged_assurance_v65d/iu,
    `Privileged mutation guard disappeared in ${latest.file}`);
});
