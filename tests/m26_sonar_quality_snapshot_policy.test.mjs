import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const config=read('.sonarcloud.properties');
const snapshots=[
  "scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261119/index.ts",
  "scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/index.ts",
  "scripts/ops/m44_legacy_edge_source/iberfit-iri-report-emission-v1-prod-20261115/index.ts",
  "scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/pdf-renderer.js",
  "scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/storage-recovery.js",
  "supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql",
  "supabase/rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql",
  "supabase/qa-migrations/20261117224500_coach_invitation_finalize_cas_v2.sql",
  "supabase/qa-rollbacks/20261117224500_coach_invitation_finalize_cas_v2_rollback.sql",
  "supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql",
  "supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql",
  "scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261117.ts",
  "supabase/qa-migrations/20261118015500_p0_free_completed_session_scalar_fast_v1.sql",
  "supabase/qa-rollbacks/20261118015500_p0_free_completed_session_scalar_fast_v1.rollback.sql"
];

test('Sonar CPD exceptions target only exact immutable backup and rollback source files',()=>{
 const line=config.split(/\r?\n/u).find(x=>x.startsWith('sonar.cpd.exclusions='));
 assert.ok(line);
 const entries=line.slice('sonar.cpd.exclusions='.length).split(',');
 assert.equal(entries.length,26,'Existing 21 exact recovery files plus five frozen M44 production source snapshots');
 assert.equal(new Set(entries).size,entries.length);
 for(const path of entries)assert.ok(existsSync(path),'Missing immutable recovery file: '+path);
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

// Runtime and vendored contracts remain measured. The five exact rollback
// bytes are independently verified by the M44 recovery provenance contract.
test('M44 CPD policy covers only the five verified production archives, never their live counterparts',async()=>{
 const {loadInventory,validateLocalSources,AUXILIARY_SOURCES}=await import('../scripts/ops/m44_edge_source_recovery_contract.mjs');
 const inventory=loadInventory();
 const pinned=inventory.sources.filter(s=>s.source_state==='canonical_live_snapshot_pending_release').map(s=>s.source_path).concat(AUXILIARY_SOURCES.map(s=>s.path));
 const expected=["scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261119/index.ts","scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/index.ts","scripts/ops/m44_legacy_edge_source/iberfit-iri-report-emission-v1-prod-20261115/index.ts","scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/pdf-renderer.js","scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/storage-recovery.js"];
 assert.deepEqual([...pinned].sort((a,b)=>a<b?-1:a>b?1:0),[...expected].sort((a,b)=>a<b?-1:a>b?1:0));
 assert.equal(validateLocalSources(inventory).filesVerified,16);
 const entries=config.split(/\r?\n/u).find(x=>x.startsWith('sonar.cpd.exclusions=')).slice('sonar.cpd.exclusions='.length).split(',');
 for(const file of expected)assert.ok(entries.includes(file),file);
 assert.ok(!entries.some(file=>file.startsWith('supabase/functions/')||file.startsWith('src/')));
 assert.doesNotMatch(config,/^\s*sonar\.(?:exclusions|coverage\.exclusions)=/mu);
});
