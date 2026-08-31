import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationNames=fs.readdirSync('supabase/migrations')
  .filter((name)=>/^20260831041300_final_launch_p0_revoke_legacy_client_create\.sql$/u.test(name));
assert.equal(migrationNames.length,1,'exactly one final-launch P0 migration must exist');
const migrationPath=`supabase/migrations/${migrationNames[0]}`;
const sql=fs.readFileSync(migrationPath,'utf8').replace(/\r\n?/gu,'\n');
const rc65=fs.readFileSync(
  'supabase/migrations/20260830044500_rc65_c2_c3_privileged_server_enforcement.sql',
  'utf8',
).replace(/\r\n?/gu,'\n');

test('final launch P0 revokes external EXECUTE from legacy client-create only',()=>{
  for(const signature of [
    'public.iberfit_create_client_draft(jsonb)',
    'public.iberfit_create_client_draft_v12(jsonb)',
    'public.iberfit_create_client_draft_v12_pre_v65e(jsonb)',
  ]){
    assert.ok(sql.includes(`to_regprocedure('${signature}')`),`missing migration precondition: ${signature}`);
  }

  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.iberfit_create_client_draft\s*\(\s*jsonb\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/iu,
  );
  assert.doesNotMatch(sql,/\bgrant\s+/iu,'P0 migration must not grant new privileges');
  assert.doesNotMatch(sql,/\balter\s+function\b/iu,'P0 migration must not alter any function');
  assert.doesNotMatch(sql,/\bdrop\s+function\b/iu,'legacy function must remain present');
  assert.doesNotMatch(sql,/\bsecurity\s+(?:definer|invoker)\b/iu,'P0 migration must not change function security mode');
  assert.doesNotMatch(sql,/(?:enable|disable|force|no\s+force)\s+row\s+level\s+security|(?:create|alter|drop)\s+policy/iu,'P0 migration must not change RLS');
  assert.doesNotMatch(sql,/grant\s+(?:select|insert|update|delete|truncate|references|trigger)\s+on/iu,'P0 migration must not widen table grants');
  assert.doesNotMatch(sql,/service[_-]?role|sb_secret_|password|private[_-]?key/iu,'P0 migration must not introduce privileged credential material');
});

test('canonical v12 client-create path remains WebAuthn-gated and internal implementation stays private',()=>{
  assert.match(
    rc65,
    /create\s+or\s+replace\s+function\s+public\.iberfit_create_client_draft_v12\s*\(\s*p_payload\s+jsonb\s*\)[\s\S]*?perform\s+public\.iberfit_require_privileged_assurance_v65d\s*\(\s*\)\s*;[\s\S]*?return\s+public\.iberfit_create_client_draft_v12_pre_v65e\s*\(\s*p_payload\s*\)\s*;/iu,
  );
  assert.match(
    rc65,
    /revoke\s+all\s+on\s+function\s+public\.iberfit_create_client_draft_v12_pre_v65e\s*\(\s*jsonb\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/iu,
  );
});

test('P0 closure does not rewrite the safe v12 wrapper or its internal implementation',()=>{
  for(const name of ['iberfit_create_client_draft_v12','iberfit_create_client_draft_v12_pre_v65e']){
    assert.doesNotMatch(
      sql,
      new RegExp(`(?:create\\s+or\\s+replace|alter|drop)\\s+function\\s+public\\.${name}\\b`,'iu'),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`grant\\s+execute[\\s\\S]*?on\\s+function\\s+public\\.${name}\\b`,'iu'),
    );
  }
});
