import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  'supabase/migrations/20261006212500_communication_bootstrap_scoped_read_v1.sql',
  'utf8',
);
const rollback=readFileSync(
  'supabase/rollbacks/20261006212500_communication_bootstrap_scoped_read_v1.rollback.sql',
  'utf8',
);

test('#759 communication hydration removes only the duplicated general bootstrap',()=>{
  assert.match(migration,/create or replace function public\.iberfit_communication_bootstrap_v14_pre_v65e\(p_application text\)/iu);
  assert.doesNotMatch(migration,/\b(?:perform|select)\s+public\.iberfit_bootstrap_v26\s*\(/iu);
  assert.match(migration,/public\.iberfit_client_id\(\)/u);
  assert.match(migration,/from public\.clients c/u);
  assert.match(migration,/public\.iberfit_can_access_client_v26\(c\.id\)/u);
  assert.match(migration,/coalesce\(\([\s\S]*?select c\.name[\s\S]*?\),'Cliente'\)/u);
});

test('#759 retains authenticated organization and role boundaries and privileged assurance',()=>{
  assert.match(migration,/public\.iberfit_application_context_v14\(\)/u);
  assert.match(migration,/membershipStatus',''\) <> 'active'/u);
  assert.match(migration,/V14_ORGANIZATION_ACCESS_SUSPENDED/u);
  assert.match(migration,/v_app not in \('client','coach'\)/u);
  assert.match(migration,/V14_COMMUNICATION_ROLE_FORBIDDEN/u);
  assert.match(migration,/perform public\.iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(migration,/v_org := \(v_context->>'organizationId'\)::uuid/u);
  assert.match(migration,/v_app='client' and t\.client_id=v_client/u);
  assert.match(migration,/v_app='coach' and t\.coach_user_id=v_user/u);
  assert.match(migration,/v_app='client' and n\.recipient_client_id=v_client/u);
  assert.match(migration,/v_app='coach' and n\.recipient_user_id=v_user/u);
  assert.match(migration,/revoke execute on function public\.iberfit_communication_bootstrap_v14_pre_v65e\(text\)[\s\S]*from public, anon, authenticated;/iu);
});

test('#759 preserves communications JSON, ordering and read-only response',()=>{
  for(const k of [
    'id','clientId','coachUserId','status','subject','clientName','coachName',
    'createdAt','updatedAt','unreadCount','revision','threadId',
    'senderUserId','senderRole','body','readByClientAt','readByCoachAt',
    'title','readAt','actionArea','actionEntityId','ok','threads','messages',
    'notifications','serverTime',
  ])assert.ok(migration.includes(`'${k}'`),`missing contract field ${k}`);
  for(const required of [
    'order by t.updated_at desc','order by m.created_at','order by n.created_at desc',
    't.status=\'active\'','t.organization_id=v_org','n.organization_id=v_org',
  ])assert.ok(migration.includes(required),required);
  const body=migration.slice(migration.indexOf('as $function$'),migration.indexOf('$function$;'));
  assert.doesNotMatch(body,/\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s|drop\s|alter\s)\b/iu);
});

test('#759 rollback restores the original contract and authenticated callable remains untouched',()=>{
  assert.match(rollback,/create or replace function public\.iberfit_communication_bootstrap_v14_pre_v65e\(p_application text\)/iu);
  assert.match(rollback,/public\.iberfit_bootstrap_v26\(\)/u);
  assert.doesNotMatch(migration,/create or replace function public\.iberfit_communication_bootstrap_v14\(p_application text\)/iu);
});
