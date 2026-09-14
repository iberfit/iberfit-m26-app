import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260914062000_admin_client_create_responsible_coach_v26.sql','utf8');
const render=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const viewModel=fs.readFileSync('src/m26/admin/view-model.js','utf8');
const wizard=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');

test('real client onboarding exposes an optional responsible Coach and defaults intelligently',()=>{
  assert.match(viewModel,/admin-clientes'[\s\S]*?coaches:Object\.freeze\(clone\(adminCollection\(state,'coachProfiles'\)\)\)/u);
  assert.match(render,/Coach responsable<select name="coachUserId"/u);
  assert.match(render,/selfCoach\|\|\(eligibleCoaches\.length===1\?eligibleCoaches\[0\]:null\)/u);
  assert.match(render,/Asignar después/u);
  assert.match(controller,/coachUserId:text\(data,'coachUserId',200\)/u);
  assert.match(wizard,/service:\['modality','weeklyFrequency','sessionDurationMinutes','coachUserId'\]/u);
});

test('responsible Coach assignment is validated before client creation and written atomically',()=>{
  assert.match(migration,/iberfit_assert_org_user_scope_v65e\(v_org,v_coach,true,'coach'\)/u);
  const validation=migration.indexOf('iberfit_assert_org_user_scope_v65e(v_org,v_coach');
  const creation=migration.indexOf('iberfit_admin_create_client_v26_pre_privileged_assurance');
  assert.ok(validation>=0&&creation>validation,'Coach authorization must be checked before canonical client creation');
  assert.match(migration,/insert into public\.iberfit_coach_client_assignments/u);
  assert.match(migration,/insert into public\.iberfit_conversation_threads/u);
  assert.match(migration,/status='active'/u);
});

test('responsible Coach assignment is optional, replay-safe and preserves least privilege',()=>{
  assert.match(migration,/if v_coach is null then\s+return v_result;/u);
  assert.match(migration,/select a\.id into v_assignment[\s\S]*?a\.status='active'/u);
  assert.match(migration,/if v_assignment is null then[\s\S]*?insert into public\.iberfit_coach_client_assignments/u);
  assert.match(migration,/revoke all on function public\.iberfit_admin_create_client_v26\(jsonb,jsonb\)[\s\S]*?from public,anon,authenticated/u);
});
