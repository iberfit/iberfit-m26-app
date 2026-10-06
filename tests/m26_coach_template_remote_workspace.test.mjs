import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const migration=read('supabase/migrations/20261006014500_coach_session_template_workspace_v1.sql');
const transport=read('src/m26/supabase-transport.js');
const application=read('src/m26/app/application.js');

test('Coach template workspace is owner-scoped, RLS protected and additive',()=>{
  assert.match(migration,/create table if not exists public\.coach_session_template_workspaces_v1/u);
  assert.match(migration,/enable row level security/u);
  assert.match(migration,/owner_user_id = \(select auth\.uid\(\)\)/u);
  assert.match(migration,/iberfit_role\(\)\)::text in \('coach','admin'\)/u);
  assert.match(migration,/IBERFIT-TABLE-ACCESS:/u);
  assert.match(migration,/IBERFIT-POLICY: public\.coach_session_template_workspaces_v1 = rls-client/u);
  assert.doesNotMatch(migration,/drop table/iu);
  assert.doesNotMatch(migration,/alter table public\.m26_session_drafts_v431/iu);
});

test('Coach template workspace declares least privilege and no anonymous API access',()=>{
  assert.match(migration,/revoke all[\s\S]*on table public\.coach_session_template_workspaces_v1[\s\S]*from public, anon, authenticated/iu);
  assert.match(migration,/grant select, insert, update[\s\S]*on table public\.coach_session_template_workspaces_v1[\s\S]*to authenticated/iu);
  assert.match(migration,/grant all[\s\S]*on table public\.coach_session_template_workspaces_v1[\s\S]*to service_role/iu);
  assert.doesNotMatch(migration,/grant delete[\s\S]*coach_session_template_workspaces_v1/iu);
  assert.match(migration,/revoke all[\s\S]*on table public\.coach_session_template_workspaces_v1[\s\S]*from public, anon, authenticated/iu);
  assert.match(migration,/revoke all[\s\S]*iberfit_coach_template_workspace_get_v1\(\)[\s\S]*from public, anon/iu);
  assert.match(migration,/revoke all[\s\S]*iberfit_coach_template_workspace_upsert_v1\(jsonb\)[\s\S]*from public, anon/iu);
});

test('remote workspace RPCs use invoker permissions and explicit optimistic conflict handling',()=>{
  assert.match(migration,/iberfit_coach_template_workspace_get_v1/u);
  assert.match(migration,/iberfit_coach_template_workspace_upsert_v1/u);
  assert.doesNotMatch(migration,/security definer/iu);
  assert.match(migration,/for update/u);
  assert.match(migration,/v_remote_revision <> v_current_revision/u);
  assert.match(migration,/'saved', false/u);
  assert.match(migration,/'conflict', true/u);
  assert.match(migration,/'workspace', v_current_workspace/u);
  assert.match(migration,/on conflict \(owner_user_id\)[\s\S]*do nothing/u);
});

test('workspace payload is bounded to product limits before persistence',()=>{
  assert.match(migration,/jsonb_array_length\(v_templates\) > 20/u);
  assert.match(migration,/jsonb_array_length\(v_versions\) not between 1 and 5/u);
  assert.match(migration,/octet_length\(p_value::text\) > 900000/u);
  assert.match(migration,/m26_json_safe_v43\(v_snapshot\)/u);
  assert.match(transport,/COACH_TEMPLATE_MAX_BYTES=900_000/u);
  assert.match(transport,/workspace\.templates\.length>20/u);
});

test('transport exposes dedicated Coach template workspace methods',()=>{
  assert.match(transport,/get:'iberfit_coach_template_workspace_get_v1'/u);
  assert.match(transport,/upsert:'iberfit_coach_template_workspace_upsert_v1'/u);
  assert.match(transport,/async function getSessionTemplateWorkspace\(token\)/u);
  assert.match(transport,/async function upsertSessionTemplateWorkspace\(token,\{workspace,remoteRevision=0\}=\{\}\)/u);
  assert.match(transport,/M26_COACH_TEMPLATE_SYNC_CONFLICT|M26_COACH_TEMPLATE_SAVE_INVALID_RESPONSE/u);
  assert.match(transport,/getSessionTemplateWorkspace,/u);
  assert.match(transport,/upsertSessionTemplateWorkspace,/u);
});

test('application saves templates locally before any remote sync attempt',()=>{
  const start=application.indexOf('async function saveCurrentSessionTemplate(name)');
  const end=application.indexOf('function loadCurrentSessionTemplate',start);
  assert.ok(start>=0&&end>start);
  const block=application.slice(start,end);
  const local=block.indexOf('sessionTemplateRepository.save(name,sessionUi.draft)');
  const remote=block.indexOf('syncSessionTemplateWorkspace');
  assert.ok(local>=0);
  assert.ok(remote>local);
  assert.match(block,/SESSION_TEMPLATE_SYNC_TIMEOUT_MS/u);
  assert.match(block,/Plantilla guardada en este dispositivo\. La sincronización se reintentará al reconectar\./u);
});

test('application reconciles template workspace on connectivity recovery without blocking auth',()=>{
  assert.match(application,/function syncSessionTemplateWorkspace/u);
  assert.match(application,/sessionTemplateRepository\.mergeWorkspace/u);
  assert.match(application,/result\.conflict===true/u);
  assert.match(application,/throw new Error\('M26_COACH_TEMPLATE_SYNC_CONFLICT'\)/u);
  assert.match(application,/templateConnectivityStop=observeConnectivity\(globalThis,/u);
  assert.match(application,/onOnline:\(\)=>syncSessionTemplateWorkspace\(\{renderAfter:true\}\)\.catch/u);
  assert.match(application,/coach-template-sync-builder-open/u);
  const setup=application.indexOf('async function setupAuthenticated()');
  const interactive=application.indexOf("qaStage('rc64-shell-interactive-ready')",setup);
  const reconnect=application.indexOf('coach-template-sync-reconnect',interactive);
  assert.ok(setup>=0&&interactive>setup&&reconnect>interactive);
});
