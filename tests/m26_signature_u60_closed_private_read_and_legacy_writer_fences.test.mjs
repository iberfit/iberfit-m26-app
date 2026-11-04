import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createM26Transport,M26_QA_PROJECT_REF,M26_QA_SUPABASE_ORIGIN,
  M26_PRODUCTION_PROJECT_REF,M26_PRODUCTION_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';
import {createOccurrencePrivateReader} from '../src/m26/workflows/occurrence-private-reader.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const OCC='10000000-0000-4000-8000-000000000104';
const APPT='10000000-0000-4000-8000-000000000106';
const ACTOR='10000000-0000-4000-8000-000000000105';
const snapshot={
  clientId:CLIENT,sessionId:SESSION,cycleId:null,title:'Entrenamiento guiado',
  queue:[{blockId:'s1',exerciseId:'e1',sets:2,prescription:{reps:12}}],
  blocks:[{id:'s1',exerciseId:'e1',sets:2}],
};
const privateResult={
  kind:'private-occurrence',
  occurrence:{id:OCC,clientId:CLIENT,sessionId:SESSION,appointmentId:APPT,
    localDate:'2026-11-05',localTime:null,timeZone:'America/Santiago',
    startsAt:null,endsAt:null,durationMinutes:60,status:'confirmada',
    revision:1,executionId:null},
  prescriptionSnapshot:snapshot,executionBody:null,
};
const auth=()=>({userId:ACTOR,clientId:CLIENT,role:'cliente',accessToken:'qa_signed_jwt'});

test('U60 private read is a single scoped JWT POST and cannot use role filters',async()=>{
  const sent=[];
  const transport=createM26Transport({
    enabled:true,qaOnly:true,projectRef:M26_QA_PROJECT_REF,
    url:M26_QA_SUPABASE_ORIGIN,publishableKey:'pk_fake_for_contract_test',
    version:'qa-u60',
  },{fetchImpl:async(url,opts)=>{
    sent.push({url,opts,body:JSON.parse(opts.body)});
    return {ok:true,status:200,headers:{get:()=> 'application/json'},
      json:async()=>privateResult};
  }});
  const reader=createOccurrencePrivateReader({
    enabled:true,transport,getAuthContext:auth,
  });
  const result=await reader.read({clientId:CLIENT,occurrenceId:OCC});
  assert.equal(result.occurrence.id,OCC);
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,M26_QA_SUPABASE_ORIGIN+
    '/rest/v1/rpc/iberfit_occurrence_detail_v1');
  assert.equal(sent[0].opts.headers.authorization,'Bearer qa_signed_jwt');
  assert.deepEqual(sent[0].body,{p_client_id:CLIENT,p_occurrence_id:OCC});
  await assert.rejects(transport.occurrencePrivateRead('jwt',{
    clientId:CLIENT,occurrenceId:OCC,role:'admin',
  }),/M26_OCCURRENCE_PRIVATE_READ_FILTER_INVALID/);
  await assert.rejects(reader.read({clientId:OTHER,occurrenceId:OCC}),
    /U60_PRIVATE_CLIENT_SCOPE_FORBIDDEN/);
  assert.equal(sent.length,1);
});

test('U60 client cannot receive an unlinked or unpublished dated prescription',async()=>{
  const reader=createOccurrencePrivateReader({
    enabled:true,getAuthContext:auth,
    transport:{occurrencePrivateRead:async()=>({
      ...privateResult,occurrence:{...privateResult.occurrence,appointmentId:null},
    })},
  });
  await assert.rejects(reader.read({clientId:CLIENT,occurrenceId:OCC}),
    /U60_PRIVATE_CLIENT_UNPUBLISHED_FORBIDDEN/);
});

test('U60 private detail rejects a different server owner before exposing data',async()=>{
  const transport={occurrencePrivateRead:async()=>({
    ...privateResult,occurrence:{...privateResult.occurrence,clientId:OTHER},
  })};
  const reader=createOccurrencePrivateReader({
    enabled:true,transport,getAuthContext:auth,
  });
  await assert.rejects(reader.read({clientId:CLIENT,occurrenceId:OCC}),
    /U60_PRIVATE_SCOPE_OR_SOURCE_DRIFT/);
});

test('U60 private detail rejects private snapshot fields and role switch during read',async()=>{
  let turn=0;
  const transport={occurrencePrivateRead:async()=>privateResult};
  const changing=createOccurrencePrivateReader({
    enabled:true,transport,
    getAuthContext:async()=>({...auth(),role:++turn===1?'coach':'cliente'}),
  });
  await assert.rejects(changing.read({clientId:CLIENT,occurrenceId:OCC}),
    /U60_PRIVATE_AUTH_CONTEXT_CHANGED/);
  const extra=createOccurrencePrivateReader({
    enabled:true,getAuthContext:auth,
    transport:{occurrencePrivateRead:async()=>({
      ...privateResult,
      prescriptionSnapshot:{...snapshot,publishedSnapshot:{coachPrivateNote:'hidden'}},
    })},
  });
  await assert.rejects(extra.read({clientId:CLIENT,occurrenceId:OCC}),
    /U60_PRIVATE_RESPONSE_INVALID/);
});

test('U60 private detail remains unreleased in production transport',async()=>{
  let calls=0;
  const prod=createM26Transport({
    enabled:true,qaOnly:false,projectRef:M26_PRODUCTION_PROJECT_REF,
    url:M26_PRODUCTION_SUPABASE_ORIGIN,publishableKey:'pk_fake_for_contract_test',
  },{fetchImpl:async()=>{calls++;throw new Error('NETWORK_SHOULD_NOT_RUN');}});
  await assert.rejects(prod.occurrencePrivateRead('jwt',{clientId:CLIENT,occurrenceId:OCC}),
    /M26_OCCURRENCE_PRIVATE_READ_NOT_RELEASED/);
  assert.equal(calls,0);
});

test('U60 SQL closed stage preserves roles and fences legacy writes atomically',()=>{
  const sql=readFileSync(new URL(
    '../supabase/migrations/20261104150000_u60_closed_private_read_legacy_writer_fences.sql',
    import.meta.url),'utf8');
  assert.match(sql,/CREATE FUNCTION private\.iberfit_u60_occurrence_detail_v1/u);
  assert.match(sql,/CREATE FUNCTION public\.iberfit_occurrence_detail_v1/u);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.iberfit_occurrence_detail_v1\(uuid,uuid\)/u);
  assert.doesNotMatch(sql,/^\s*GRANT\s+(?:EXECUTE|ALL)/gimu);
  assert.match(sql,/public\.iberfit_can_access_client_v26\(p_client_id\)/u);
  assert.match(sql,/v_role NOT IN \('coach','cliente'\)/u);
  assert.match(sql,/v_occ\.appointment_id IS NULL/u);
  assert.match(sql,/v_occ\.prescription_snapshot->'queue'/u);
  assert.match(sql,/octet_length\(v_snapshot::text\)>524288/u);
  for(const trigger of ['u60_typed_execution_fence','u60_active_lock_fence',
    'u60_occurrence_insert_fence'])
    assert.match(sql,new RegExp('CREATE TRIGGER '+trigger));
  assert.match(sql,/hashtextextended\('schedule_client:'\|\|NEW\.client_id::text,0\)/u);
  assert.match(sql,/U60_LEGACY_EXECUTION_BLOCKED/u);
  assert.match(sql,/U60_LEGACY_ACTIVE_LOCK_BLOCKED/u);
  assert.match(sql,/U60_LEGACY_EXECUTION_ALREADY_ACTIVE/u);
  assert.doesNotMatch(sql,/DISABLE ROW LEVEL SECURITY|TRUNCATE|DROP TABLE/iu);
});

test('U60 runtime defaults to owner-authenticated private reader; opt-in only',()=>{
  const src=readFileSync(new URL('../src/m26/workflows/occurrence-runtime.js',import.meta.url),'utf8');
  assert.match(src,/createOccurrencePrivateReader\(\{\s*enabled:true,transport,getAuthContext/u);
  assert.match(src,/enabled=false/u);
  assert.match(src,/readPrivateOccurrence:privateRead/u);
});


test('U60 QA audit is read-only and matches eight source fingerprints before ledger repair',()=>{
  const script=readFileSync(new URL(
    '../scripts/u60/qa_readonly_reconciliation.sql',import.meta.url),'utf8');
  const migration=readFileSync(new URL(
    '../supabase/migrations/20261104150000_u60_closed_private_read_legacy_writer_fences.sql',
    import.meta.url),'utf8');
  const normalizedAudit=script.replace(/^--.*$/gmu,'');
  assert.doesNotMatch(normalizedAudit,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|DO)\b/iu);
  const names=['iberfit_u30_occurrence_snapshot_guard_v1',
    'iberfit_u31_occurrence_transition_v1',
    'iberfit_u32_build_execution_queue_v1',
    'iberfit_u32_create_occurrences_batch_v1',
    'iberfit_u32_appointment_writer_fence_v1',
    'iberfit_u33_occurrence_calendar_v1',
    'iberfit_u34_coach_occurrence_change_v1',
    'iberfit_occurrence_api_v1'];
  for(const name of names){
    assert.match(script,new RegExp("'"+name+"'"));
    assert.match(migration,new RegExp("'"+name+"'"));
  }
  assert.match(script,/ledger_versions_present/u);
  assert.match(script,/ready_for_u60/u);
  assert.match(migration,/ledger_rows=7 AND verified_functions=8 AND drifted_functions=0/u);
  assert.match(migration,/u60_reconciliation_required_before_schema_changes/u);
  assert.match(migration,/v_typed\.execution_status IS DISTINCT FROM 'activa'/u);
  assert.match(migration,/v_typed\.execution_status IS DISTINCT FROM 'cerrada_confirmada'/u);
  assert.match(migration,/v_typed\.remote_confirmed_at IS NULL/u);
  assert.ok(migration.indexOf('u60_reconciliation_required_before_schema_changes') <
    migration.indexOf('CREATE FUNCTION private.iberfit_u60_occurrence_detail_v1'),
    'preflight must execute BEFORE new privileged functions are created');
  assert.doesNotMatch(script,/PJHM|pjhmrhejsoofmouedavw/iu,'never query PROD in the QA-only reconciliation');
});
