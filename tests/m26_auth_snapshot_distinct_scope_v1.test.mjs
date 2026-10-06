import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261006235000_auth_snapshot_distinct_scope_v1.sql','utf8');
const qa=readFileSync('supabase/rollbacks/20261006235000_auth_snapshot_distinct_scope_v1.qa.rollback.sql','utf8');
const prod=readFileSync('supabase/rollbacks/20261006235000_auth_snapshot_distinct_scope_v1.prod.rollback.sql','utf8');
const occurrences=(s,p)=>(s.match(p)||[]).length;

test('#768 optimizes only the private existing snapshot layers',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_rc29\(\)/iu);
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_pre_v65e\(\)/iu);
  assert.equal(occurrences(migration,/LANGUAGE plpgsql/giu),2);
  assert.equal(occurrences(migration,/STABLE SECURITY DEFINER/giu),2);
  assert.equal(occurrences(migration,/SET search_path TO ''/giu),2);
  assert.equal(occurrences(migration,/\$function\$;/gu),2);
  assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26\(\)/iu);
  assert.doesNotMatch(migration,/\b(?:grant|revoke|truncate|drop|insert|delete|update)\s+(?:on|into|from|table|function|public\.)/iu);
});

test('#768 evaluates access on DISTINCT UUIDs with null-safe scope preservation',()=>{
  assert.equal(occurrences(migration,/with candidates as materialized/giu),4);
  assert.equal(occurrences(migration,/visible as materialized/giu),4);
  assert.equal(occurrences(migration,/is not distinct from/giu),4);
  for(const table of ['domain_events_v26','domain_entities_v26','client_checkins_v26']){
    assert.match(migration,new RegExp(`select distinct client_id from public\\.${table}`,'u'));
  }
  assert.match(migration,/where public\.iberfit_can_access_client_v26\(client_id\)/u);
  assert.match(migration,/where exists \(select 1 from visible v where v\.client_id is not distinct from e\.client_id\)/u);
  assert.match(migration,/where exists \(select 1 from visible v where v\.client_id is not distinct from c\.client_id\)/u);
});

test('#768 preserves JSON fields and ordered sections',()=>{
  for(const key of ['clients','userProfiles','clientProfiles','clientAccess','iriAssessments','reports',
    'trainingCycles','sessions','appointments','sessionExecutions','intelligenceRuns',
    'timelineEvents','domainEvents','coachAvailability','m26Entities','metrics']){
    assert.ok(migration.includes(`'${key}'`),`missing snapshot section ${key}`);
  }
  for(const key of ['checkins','habits','habitLogs','privateNotes']){
    assert.ok(migration.includes(`'{${key}}'`),`missing extended section ${key}`);
  }
  assert.match(migration,/jsonb_agg\(to_jsonb\(e\) order by e\.created_at desc\)/u);
  assert.match(migration,/jsonb_agg\(to_jsonb\(c\) order by c\.recorded_at desc\)/u);
  assert.match(migration,/public\.iberfit_current_role_v26\(\)/u);
  assert.match(migration,/public\.iberfit_bootstrap_v26_rc29\(\)/u);
  assert.match(migration,/where key not like 'private_note:%'/u);
  assert.match(migration,/where public\.iberfit_can_access_client_v26\(h\.client_id\)/u);
});

function normalizeOutsideStrings(sql){
  let out='',quoted=false;
  for(let i=0;i<sql.length;i++){
    const c=sql[i];
    if(c==="'"){
      out+=c;
      if(quoted&&sql[i+1]==="'"){out+="'";i++;}
      else quoted=!quoted;
    }else if(!quoted&&/\s/u.test(c))continue;
    else out+=c;
  }
  return out.replace(/^--[^\n]*\n/gmu,'');
}
test('#768 provides both exact historical rollbacks with equal SQL semantics',()=>{
  for(const source of [qa,prod]){
    assert.equal(occurrences(source,/CREATE OR REPLACE FUNCTION public\.iberfit_bootstrap_v26_/giu),2);
    assert.equal(occurrences(source,/\$function\$;/gu),2);
    assert.doesNotMatch(source,/with candidates as materialized/iu);
    assert.match(source,/public\.iberfit_can_access_client_v26\(e\.client_id\)/u);
    assert.match(source,/public\.iberfit_can_access_client_v26\(c\.client_id\)/u);
  }
  const stripHeader=s=>s.replace(/^--[^\n]*\n/gmu,'');
  assert.equal(normalizeOutsideStrings(stripHeader(qa)),normalizeOutsideStrings(stripHeader(prod)));
});
