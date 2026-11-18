import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const config=read('.sonarcloud.properties');
const snapshots=[
  "supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql",
  "supabase/rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql",
  "supabase/qa-migrations/20261117224500_coach_invitation_finalize_cas_v2.sql",
  "supabase/qa-rollbacks/20261117224500_coach_invitation_finalize_cas_v2_rollback.sql",
  "supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql",
  "supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql",
  "scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261117.ts"
];

test('Sonar CPD exceptions target only exact immutable backup and rollback source files',()=>{
 const line=config.split(/\r?\n/u).find(x=>x.startsWith('sonar.cpd.exclusions='));
 assert.ok(line);
 const entries=line.slice('sonar.cpd.exclusions='.length).split(',');
 assert.equal(new Set(entries).size,entries.length);
 for(const path of snapshots){
  assert.ok(existsSync(path),'Missing recovery snapshot: '+path);
  assert.ok(entries.includes(path),'Unregistered immutable recovery source: '+path);
 }
 for(const path of entries){
  assert.doesNotMatch(path,/\*|\?|\.\.\//u,'No wildcard suppression');
  assert.ok(path.startsWith('supabase/')||path.startsWith('scripts/ops/m44_legacy_edge_source/'));
 }
 assert.ok(!entries.some(x=>x.startsWith('src/')||x.startsWith('qa/rc64/')));
 assert.doesNotMatch(config,/^\s*sonar\.(?:exclusions|coverage\.exclusions)=/mu);
 assert.match(config,/Sonar still scans these files for reliability/u);
});

test('Fix Sonar reliability issues in the actual changed code paths',()=>{
 const app=read('src/m26/app/application.js');
 const meter=read('qa/rc64/qa-supabase-wire-meter.mjs');
 const projection=read('scripts/remote-gates/qa_m43_owner_projection.mjs');
 assert.match(app,/onPostAckRefreshError:\(error\)=>reportDiagnostic\('session-completion-refresh-after-ack',error\)/u);
 assert.doesNotMatch(app,/reportDiagnostic\('session-completion-refresh-after-ack',error,scope\)/u);
 assert.match(meter,/void task\.then\(\(\)=>pending\.delete\(task\),\(\)=>pending\.delete\(task\)\)/u);
 assert.doesNotMatch(meter,/task\.finally\(/u);
 assert.equal((projection.match(/\.sort\(\(a,b\)=>a\.localeCompare\(b\)\)/gu)||[]).length,2);
});
