import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('M44 Security-definer bootstrap redacts private reports before client hydration',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261015142500_m44_bootstrap_private_reports_http_fence_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/SECURITY DEFINER bypasses table RLS/);
  assert.match(sql,/r\.value->>'client_id'=public\.iberfit_client_id\(\)::text/);
  assert.match(sql,/r\.value->>'status'='publicado'/);
  assert.match(sql,/r\.value->>'audience'='cliente'/);
  assert.match(sql,/select jsonb_agg\(jsonb_build_object\(/);
  const envelope=sql.slice(sql.indexOf('select jsonb_agg(jsonb_build_object'),sql.indexOf('from jsonb_array_elements(coalesce(v_payload#>'));
  for(const forbidden of ['coachComment','m44DraftFingerprint','evidenceSignature','created_by','sourceAssessmentRevision']){
    assert.doesNotMatch(envelope,new RegExp("'"+forbidden+"'"));
  }
  assert.match(sql,/item->>'entityType' is distinct from 'report'/);
  assert.match(sql,/split_part\(k\.key,':',1\)<>'report'/);
  assert.match(sql,/M44_BOOTSTRAP_BASELINE_CHANGED_REVIEW_REQUIRED/);
});

test('M44 Client reader only receives a whitelisted projection and is not gated by canonical report rows',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261015142500_m44_bootstrap_private_reports_http_fence_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/'\{data,reports\}'/);
  assert.match(sql,/'\{data,m26Entities\}'/);
  assert.match(sql,/'\{remoteRevisions\}'/);
  assert.match(sql,/'content',jsonb_build_object/);
});
