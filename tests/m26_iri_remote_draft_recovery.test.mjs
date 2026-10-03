import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('IRI remoto reutiliza el backend seguro de borradores sin duplicar tablas',()=>{
  const migration=read('supabase/migrations/20261003174500_iri_remote_draft_recovery.sql');
  assert.match(migration,/alter table public\.m26_session_drafts_v431/u);
  assert.doesNotMatch(migration,/create table/iu);
  assert.match(migration,/scope in \('session-builder','iri-first-session'\)/u);
  assert.match(migration,/iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(migration,/owner_user_id = auth\.uid\(\)/u);
  assert.match(migration,/public\.is_assigned_coach\(p_client_id\)/u);
  assert.doesNotMatch(migration,/security definer/iu);
  assert.match(migration,/revoke all on function public\.m26_draft_get_v431\(uuid,text\) from public, anon/u);
  assert.match(migration,/grant execute on function public\.m26_draft_get_v431\(uuid,text\) to authenticated, service_role/u);
});

test('transport sólo admite los dos scopes remotos conocidos',()=>{
  const transport=read('src/m26/supabase-transport.js');
  assert.match(transport,/REMOTE_DRAFT_SCOPES=new Set\(\['session-builder','iri-first-session'\]\)/u);
  assert.match(transport,/if\(!REMOTE_DRAFT_SCOPES\.has\(scope\)\)throw new Error\('M26_RC431_DRAFT_SCOPE_INVALID'\)/u);
});

test('IRI guarda local primero y sincroniza remoto sin convertir red en bloqueo',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const local=workflow.indexOf('await draftRepository.save(clientId,iriDraftStorageScope(draft,form),draft)');
  const remote=workflow.indexOf('remote=await persistIriRemoteDraft(clientId,draft,form)');
  assert.ok(local>=0);
  assert.ok(remote>local);
  assert.match(workflow,/IRI_REMOTE_SYNC_DELAY_MS=4_000/u);
  assert.match(workflow,/iriRemoteSaveChain=queued\.then\(\(\)=>undefined,\(\)=>undefined\)/u);
  assert.match(workflow,/saveIriDraft\(\{silent:true,syncRemote:false\}\)/u);
  assert.match(workflow,/saveIriDraft\(\{silent:true,syncRemote:true\}\)/u);
});

test('IRI recupera el respaldo remoto más reciente y limpia ambos respaldos tras confirmar',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/remoteTime>=localTime/u);
  assert.match(workflow,/Borrador recuperado desde el respaldo seguro\./u);
  assert.match(workflow,/deleteRemoteDraft\(clientId,IRI_REMOTE_DRAFT_SCOPE\)/u);
  assert.match(workflow,/await clearIriDraftBackups\(draft\.clientId,draft,form\)/u);
  assert.match(workflow,/iriDraftMatchesCurrent/u);
});

test('application inyecta las RPC remotas usando la sesión actual',()=>{
  const application=read('src/m26/app/application.js');
  assert.match(application,/getRemoteDraft:async\(clientId,scope\)=>\{await refreshSessionIfNeeded\(\);return transport\.getSessionDraft\(currentToken\(\),clientId,scope\);\}/u);
  assert.match(application,/upsertRemoteDraft:async\(payload\)=>\{await refreshSessionIfNeeded\(\);return transport\.upsertSessionDraft\(currentToken\(\),payload\);\}/u);
  assert.match(application,/deleteRemoteDraft:async\(clientId,scope\)=>\{await refreshSessionIfNeeded\(\);return transport\.deleteSessionDraft\(currentToken\(\),clientId,scope\);\}/u);
});
