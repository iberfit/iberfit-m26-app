import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('IRI remoto usa una tabla privada aditiva y no altera el backend de sesiones',()=>{
  const migration=read('supabase/migrations/20261003174500_iri_remote_draft_recovery.sql');
  assert.match(migration,/create table if not exists private\.m26_iri_drafts_v1/u);
  assert.doesNotMatch(migration,/alter table public\.m26_session_drafts_v431/iu);
  assert.doesNotMatch(migration,/drop constraint/iu);
  assert.doesNotMatch(migration,/drop table/iu);
  assert.match(migration,/references public\.iri_assessments\(id\)/u);
  assert.match(migration,/unique \(owner_user_id, client_id, assessment_id\)/u);
  assert.match(migration,/enable row level security/u);
  assert.match(migration,/owner_user_id = \(select auth\.uid\(\)\)/u);
  assert.match(migration,/public\.is_assigned_coach\(client_id\)/u);
});

test('RPC IRI conserva assurance, SECURITY INVOKER y permisos mínimos',()=>{
  const migration=read('supabase/migrations/20261003174500_iri_remote_draft_recovery.sql');
  assert.match(migration,/iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(migration,/m26_iri_draft_get_v1/u);
  assert.match(migration,/m26_iri_draft_upsert_v1/u);
  assert.match(migration,/m26_iri_draft_delete_v1/u);
  assert.doesNotMatch(migration,/security definer/iu);
  assert.match(migration,/revoke all on function public\.m26_iri_draft_get_v1\(uuid,uuid\) from public, anon/u);
  assert.match(migration,/grant execute on function public\.m26_iri_draft_get_v1\(uuid,uuid\) to authenticated, service_role/u);
  assert.match(migration,/assessment\.id = p_assessment_id/u);
  assert.match(migration,/assessment\.client_id = p_client_id/u);
});

test('transport de sesiones permanece session-only y el IRI usa RPC dedicadas',()=>{
  const transport=read('src/m26/supabase-transport.js');
  assert.match(transport,/if\(scope!=='session-builder'\)throw new Error\('M26_RC431_DRAFT_SCOPE_INVALID'\)/u);
  assert.doesNotMatch(transport,/REMOTE_DRAFT_SCOPES/u);
  assert.match(transport,/get:'m26_iri_draft_get_v1'/u);
  assert.match(transport,/upsert:'m26_iri_draft_upsert_v1'/u);
  assert.match(transport,/delete:'m26_iri_draft_delete_v1'/u);
  assert.match(transport,/async function getIriDraft\(token,clientId,assessmentId\)/u);
  assert.match(transport,/async function upsertIriDraft\(token,payload=\{\}\)/u);
  assert.match(transport,/async function deleteIriDraft\(token,clientId,assessmentId\)/u);
});

test('IRI guarda local primero y sincroniza remoto sin convertir red en bloqueo',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const local=workflow.indexOf('await draftRepository.save(clientId,iriDraftStorageScope(draft,form),draft)');
  const remote=workflow.indexOf('remote=await persistIriRemoteDraft(clientId,draft,form)');
  assert.ok(local>=0);
  assert.ok(remote>local);
  assert.match(workflow,/IRI_REMOTE_SYNC_DELAY_MS=4_000/u);
  assert.match(workflow,/iriRemoteSaveChain=queued\.then\(\(\)=>undefined,\(\)=>undefined\)/u);
  assert.match(workflow,/assessmentId,/u);
  assert.match(workflow,/saveIriDraft\(\{silent:true,syncRemote:false\}\)/u);
  assert.match(workflow,/saveIriDraft\(\{silent:true,syncRemote:true\}\)/u);
});

test('IRI recupera sólo la evaluación actual y evita resucitar el borrador al confirmar',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/getRemoteDraft\(clientId,currentAssessmentId\)/u);
  assert.match(workflow,/String\(result\.assessmentId\|\|''\)===currentAssessmentId/u);
  assert.match(workflow,/remoteTime>=localTime/u);
  assert.match(workflow,/Borrador recuperado desde el respaldo seguro\./u);
  assert.match(workflow,/clearTimeout\(iriRemoteSaveTimer\)/u);
  assert.match(workflow,/await iriRemoteSaveChain\.catch\(\(\)=>\{\}\)/u);
  assert.match(workflow,/deleteRemoteDraft\(clientId,assessmentId\)/u);
  assert.match(workflow,/await clearIriDraftBackups\(draft\.clientId,draft,form\)/u);
});

test('IRI fuerza un último respaldo local antes de pagehide o desmontaje sin depender de red',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const application=read('src/m26/app/application.js');
  assert.match(workflow,/async function flushLocalDrafts\(\)/u);
  assert.match(workflow,/clearTimeout\(iriSaveTimer\)/u);
  assert.match(workflow,/clearTimeout\(iriRemoteSaveTimer\)/u);
  assert.match(workflow,/saveIriDraft\(\{silent:true,syncRemote:false\}\)/u);
  assert.match(workflow,/function onPageHide\(\)\{void flushLocalDrafts\(\);\}/u);
  assert.match(workflow,/flushLocalDrafts,/u);
  assert.match(application,/destroyControllers\(\{preserveWorkflowDrafts=true\}=\{\}\)/u);
  assert.match(application,/if\(preserveWorkflowDrafts\)void workflow\?\.flushLocalDrafts\?\.\(\)/u);
});

test('application inyecta las RPC IRI con la sesión actual',()=>{
  const application=read('src/m26/app/application.js');
  assert.match(application,/getRemoteDraft:async\(clientId,assessmentId\)=>\{await refreshSessionIfNeeded\(\);return transport\.getIriDraft\(currentToken\(\),clientId,assessmentId\);\}/u);
  assert.match(application,/upsertRemoteDraft:async\(payload\)=>\{await refreshSessionIfNeeded\(\);return transport\.upsertIriDraft\(currentToken\(\),payload\);\}/u);
  assert.match(application,/deleteRemoteDraft:async\(clientId,assessmentId\)=>\{await refreshSessionIfNeeded\(\);return transport\.deleteIriDraft\(currentToken\(\),clientId,assessmentId\);\}/u);
});
