import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('../supabase/migrations/20261004215000_iri_photo_single_active_view_v1.sql',import.meta.url),'utf8');

test('photogrammetry keeps exactly one active original per assessment and view',()=>{
  assert.match(sql,/iri_photo_one_active_view_v1/u);
  assert.match(sql,/where status='active'/u);
  assert.match(sql,/row_number\(\) over \([\s\S]*partition by assessment_id,view/u);
  assert.match(sql,/set status='revoked'/u);
  assert.match(sql,/pg_advisory_xact_lock/u);
  assert.match(sql,/hashtextextended\(p_assessment_id::text\|\|':'\|\|v_view,0\)/u);
  assert.match(sql,/c\.id<>v_row\.id/u);
  assert.doesNotMatch(sql,/delete from public\.iri_photogrammetry_captures_v1/iu);
  assert.doesNotMatch(sql,/delete from storage\.objects/iu);
  assert.doesNotMatch(sql,/drop table|drop column|truncate/iu);
});

test('photo replacement preserves immutable originals and only changes active metadata',()=>{
  assert.match(sql,/update public\.iri_photogrammetry_captures_v1 c[\s\S]*status='revoked'/u);
  assert.match(sql,/update public\.iri_photogrammetry_captures_v1[\s\S]*set status='active'/u);
  assert.match(sql,/IRI_V4_PHOTO_OBJECT_NOT_FOUND/u);
  assert.match(sql,/iberfit_iri_consent_active_v1/u);
});
