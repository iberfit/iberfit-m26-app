import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260914144702_iri_profile_revision_consistency_v26.sql','utf8').replace(/\r\n/g,'\n');
const controller=fs.readFileSync('src/m26/app/workflow-controller.js','utf8').replace(/\r\n/g,'\n');
const render=fs.readFileSync('src/m26/modules/route-render.js','utf8').replace(/\r\n/g,'\n');
const viewModel=fs.readFileSync('src/m26/modules/route-view-model.js','utf8').replace(/\r\n/g,'\n');
const firstSession=fs.readFileSync('src/m26/workflows/iri-first-session.js','utf8').replace(/\r\n/g,'\n');

test('IRI completion uses canonical client/profile revisions as an optimistic concurrency contract',()=>{
  assert.match(viewModel,/canonicalClientRevision:\s*Number\(client\?\.revision/u);
  assert.match(viewModel,/canonicalProfileRevision:\s*Number\(rawProfile\?\.revision/u);
  assert.match(render,/name="canonicalClientRevision"/u);
  assert.match(render,/name="canonicalProfileRevision"/u);
  assert.match(firstSession,/canonicalClientRevision:num\(raw\.canonicalClientRevision/u);
  assert.match(firstSession,/canonicalProfileRevision:num\(raw\.canonicalProfileRevision/u);
  assert.match(firstSession,/canonicalClientRevision:draft\.canonicalClientRevision/u);
  assert.match(firstSession,/canonicalProfileRevision:draft\.canonicalProfileRevision/u);
});

test('local IRI draft restoration never overwrites live canonical revision provenance',()=>{
  const flattenStart=firstSession.indexOf('export function flattenFirstSessionDraft');
  const flattenEnd=firstSession.indexOf('export const __iriFirstSessionInternals',flattenStart);
  assert.ok(flattenStart>=0&&flattenEnd>flattenStart);
  const block=firstSession.slice(flattenStart,flattenEnd);
  assert.doesNotMatch(block,/canonicalClientRevision/u);
  assert.doesNotMatch(block,/canonicalProfileRevision/u);
});

test('backend fails closed before IRI mutation when canonical profile revisions drift',()=>{
  const prepareIndex=migration.indexOf('v_command:=public.iberfit_prepare_command_rc30_v26');
  const guardIndex=migration.indexOf("if v_entity_type='iri' and v_command_type='IRI_COMPLETAR' then");
  const lockIndex=migration.indexOf("pg_advisory_xact_lock(hashtextextended(v_client_id::text,0))");
  const conflictIndex=migration.indexOf("'V26_IRI_PROFILE_REVISION_CONFLICT'");
  assert.ok(guardIndex>=0&&lockIndex>guardIndex&&conflictIndex>lockIndex&&prepareIndex>conflictIndex);
  assert.match(migration,/canonicalClientRevision/u);
  assert.match(migration,/canonicalProfileRevision/u);
  assert.match(migration,/for update;/u);
});

test('only IRI_COMPLETAR may synchronize personProfile into the canonical client record',()=>{
  const typedSync=migration.indexOf("if v_entity_type='iri' and v_result->>'kind'='ack' then");
  const profileSync=migration.indexOf("if v_command_type='IRI_COMPLETAR' then",typedSync);
  const profileExtract=migration.indexOf("v_profile:=case when jsonb_typeof(v_body->'personProfile')='object'",profileSync);
  assert.ok(typedSync>=0&&profileSync>typedSync&&profileExtract>profileSync);
  assert.equal((migration.match(/v_profile:=case when jsonb_typeof\(v_body->'personProfile'\)/gu)||[]).length,1);
});

test('IRI profile synchronization advances all canonical revisions and modality atomically',()=>{
  assert.match(migration,/set profile=coalesce\(ap\.profile,'\{\}'::jsonb\)\|\|v_profile,[\s\S]*?modality=coalesce\(v_modality,ap\.modality\),[\s\S]*?revision=ap\.revision\+1/u);
  assert.match(migration,/update public\.clients c[\s\S]*?revision=c\.revision\+1,[\s\S]*?updated_at=clock_timestamp\(\)/u);
  assert.match(migration,/where ap\.id=v_profile_id and ap\.revision=v_current_profile_revision/u);
  assert.match(migration,/where c\.id=v_client_id and c\.revision=v_current_client_revision/u);
});

test('internal IRI synchronization helper remains closed to browser roles',()=>{
  assert.match(migration,/security definer[\s\S]*?set search_path=''/u);
  assert.match(migration,/revoke all on function public\.iberfit_execute_command_v26_pre_rc74_4h\(jsonb\)[\s\S]*?from public,anon,authenticated;/u);
  assert.match(migration,/grant execute on function public\.iberfit_execute_command_v26_pre_rc74_4h\(jsonb\)[\s\S]*?to service_role;/u);
});

test('a profile revision conflict preserves the IRI draft and asks for re-review',()=>{
  const start=controller.indexOf('async function completeIri()');
  const end=controller.indexOf('async function moveIri',start);
  assert.ok(start>=0&&end>start);
  const block=controller.slice(start,end);
  const save=block.indexOf('draftRepository?.save?.(draft.clientId,IRI_DRAFT_SCOPE,draft)');
  const execute=block.indexOf('commandBus.execute');
  assert.ok(save>=0&&execute>save);
  assert.match(block,/V26_IRI_PROFILE_REVISION_CONFLICT/u);
  assert.match(block,/La ficha cambió mientras preparabas el IRI/u);
  assert.doesNotMatch(block,/draftRepository\?\.remove\?\.[\s\S]*?V26_IRI_PROFILE_REVISION_CONFLICT/u);
});

test('IRI UI explains canonical record versus confirmed diagnostic snapshot',()=>{
  assert.match(render,/La ficha del cliente es la fuente operativa/u);
  assert.match(render,/evaluación confirmada conserva su fotografía diagnóstica/u);
  assert.match(render,/Verifica los datos canónicos del expediente/u);
});
