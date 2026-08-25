import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/migrations/20260825162000_iberfit_rc74_4r_reproducibility_qa.sql';
const sql=fs.readFileSync(path,'utf8');
const lower=sql.toLowerCase();

test('R1 is QA-only and fail-closes on environment truth',()=>{
  assert.match(sql,/RC74_4R_QA_ENVIRONMENT_REQUIRED/u);
  assert.match(sql,/environment',''\) <> 'QA'/u);
  assert.match(sql,/realDataAllowed/u);
  assert.match(sql,/productionBlocked/u);
});

test('R2 contains no production project ref',()=>{
  assert.doesNotMatch(sql,/pjhmrhejsoofmouedavw/u);
});

test('R3 recreates the preserved pre-RC74.4 prepare helper',()=>{
  assert.match(sql,/create or replace function public\.iberfit_prepare_command_rc30_v26_pre_rc74_4\(p_command jsonb\)/iu);
  assert.match(sql,/INVALID_CHECKIN_PAYLOAD/u);
  assert.match(sql,/INVALID_PRIVATE_NOTE_PAYLOAD/u);
});

test('R4 wrapper delegates to the preserved prepare helper',()=>{
  assert.match(sql,/v_command := public\.iberfit_prepare_command_rc30_v26_pre_rc74_4\(p_command\)/u);
});

test('R5 wrapper requires execution completion feedback',()=>{
  assert.match(sql,/EJECUCION_COMPLETAR/u);
  assert.match(sql,/INVALID_EXECUTION_FEEDBACK_PAYLOAD/u);
});

test('R6 wrapper bounds session RPE to 1..10',()=>{
  assert.match(sql,/v_session_rpe not between 1 and 10/u);
});

test('R7 wrapper requires pain notes when pain is true',()=>{
  assert.match(sql,/v_pain and length\(v_pain_notes\) < 1/u);
});

test('R8 validator is immutable and internal-only',()=>{
  assert.match(sql,/iberfit_validate_execution_completion_v26\(p_body jsonb\)[\s\S]*?immutable/iu);
  assert.match(lower,/revoke all on function public\.iberfit_validate_execution_completion_v26\(jsonb\) from public, anon, authenticated/u);
});

test('R9 validator consumes the latest SESSION_COMPLETED event',()=>{
  assert.match(sql,/SESSION_COMPLETED/u);
  assert.match(sql,/order by x\.ord desc/u);
});

test('R10 validator requires every planned set to be result or skipped',()=>{
  assert.match(sql,/M26_EXECUTION_NOT_READY_TO_COMPLETE/u);
  assert.match(sql,/missingResultKey/u);
});

test('R11 persistence validates completed session executions',()=>{
  assert.match(sql,/p_entity_type = 'session_execution' and p_status = 'completada'/u);
  assert.match(sql,/iberfit_validate_execution_completion_v26\(p_body\)/u);
});

test('R12 persistence prevents cross-client entity reuse',()=>{
  assert.match(sql,/ENTITY_CLIENT_MISMATCH/u);
  for(const type of ['checkin','habit','habit_log','private_note'])assert.ok(sql.includes(`'${type}'`),type);
});

test('R13 persistence synchronizes exactly the four engagement source tables',()=>{
  for(const table of [
    'client_checkins_v26',
    'client_habits_v26',
    'client_habit_logs_v26',
    'coach_private_notes_v26',
  ]) assert.ok(sql.includes(`public.${table}`),table);
});

test('R14 source upserts cannot change client ownership',()=>{
  for(const table of [
    'client_checkins_v26',
    'client_habits_v26',
    'client_habit_logs_v26',
    'coach_private_notes_v26',
  ]) assert.ok(sql.includes(`where ${table}.client_id = excluded.client_id`),table);
});

test('R15 G captures both live RLS tables and exactly six known policies',()=>{
  assert.match(lower,/alter table public\.session_executions enable row level security/u);
  assert.match(lower,/alter table public\.session_events enable row level security/u);
  for(const policy of [
    'session_executions_read',
    'session_executions_insert',
    'session_executions_update_coach',
    'session_executions_delete_coach',
    'session_events_insert',
    'session_events_read',
  ]) assert.ok(sql.includes(policy),policy);
  assert.match(sql,/RC74_4R_G_POLICY_COUNT/u);
});

test('R16 live mutations do not admit Admin and client event writes stay bounded',()=>{
  const policyBlock=(name)=>sql.match(new RegExp(`create policy ${name}[\\s\\S]*?\\n\\);`,'u'))?.[0]||'';
  const execInsert=policyBlock('session_executions_insert');
  const execUpdate=policyBlock('session_executions_update_coach');
  const execDelete=policyBlock('session_executions_delete_coach');
  const eventInsert=policyBlock('session_events_insert');
  assert.ok(execInsert&&execUpdate&&execDelete&&eventInsert);
  for(const mutation of [execInsert,execUpdate,execDelete,eventInsert]) assert.doesNotMatch(mutation,/'admin'/u);
  assert.match(eventInsert,/actor_user_id\s*=\s*\(select auth\.uid\(\)\)/u);
  for(const eventType of [
    'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA',
    'CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA',
    'EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO','DESCANSO_EDITADO',
  ]) assert.ok(eventInsert.includes(`'${eventType}'`),eventType);
});

test('R17 R adds no direct grants to anon/authenticated and does not force RLS',()=>{
  assert.doesNotMatch(lower,/grant\s+(?:insert|update|delete|all)[\s\S]{0,120}\sto\s+(?:anon|authenticated)/u);
  assert.doesNotMatch(lower,/force row level security/u);
  assert.match(sql,/RC74_4R_SESSION_EXECUTIONS_RLS_REQUIRED/u);
  assert.match(sql,/RC74_4R_SESSION_EVENTS_RLS_REQUIRED/u);
});
