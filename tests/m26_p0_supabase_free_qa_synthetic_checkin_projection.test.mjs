import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const a=readFileSync('supabase/qa-migrations/20261030222500_free_qa_client_synthetic_checkin_projection.sql','utf8');
const b=readFileSync('supabase/qa-rollbacks/20261030222500_free_qa_client_synthetic_checkin_projection.rollback.sql','utf8');
const fn=s=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_pre_v65e()'));
const filter="\n      AND NOT COALESCE((\n        v_role in ('client','cliente')\n        AND (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment')='QA'\n        AND c.status='confirmado'\n        AND c.notes LIKE 'IBERFIT QA write certification %'\n        AND c.created_by=(SELECT id FROM auth.users WHERE email='qa.rc74.client-a@iberfit.cl')\n      ), FALSE)";
test('Only QA may install or revert exact current function',()=>{
 assert.match(a,/IS DISTINCT FROM 'QA'/);assert.match(a,/md5\(pg_get_functiondef/);
 assert.match(b,/IS DISTINCT FROM 'QA'/);
 assert.ok(a.includes('END; $qa_guard$;'));
 assert.ok(b.includes('END; $qa_guard$;'));
});
test('Authenticated Client synthetic checkins only, QA author and marker both required',()=>{
 assert.ok(fn(a).includes(filter));
 assert.ok(fn(a).includes('AND NOT COALESCE(('));
 for(const part of ["v_role in ('client','cliente')","c.status='confirmado'","c.notes LIKE 'IBERFIT QA write certification %'","c.created_by=(SELECT id FROM auth.users"]){assert.ok(fn(a).includes(part),part);}
});
test('Rollback restores full original SQL with every other permission and collection untouched',()=>{
 assert.equal(fn(a).replace(filter,''),fn(b));
 for(const part of ['SECURITY DEFINER',"SET search_path TO ''",'if auth.uid() is null then','clientProfiles','iriAssessments','checkins','m26Entities','remoteRevisions'])assert.ok(fn(a).includes(part),part);
});
test('No destructive DML, schema grants or privilege escalations',()=>{
 for(const x of [a,b]){
  assert.doesNotMatch(x,/\b(?:TRUNCATE|DELETE FROM|DROP TABLE|INSERT INTO|UPDATE public\.)\b/i);
  assert.doesNotMatch(x,/\b(?:GRANT|REVOKE|BYPASSRLS)\b/i);
 }
});
