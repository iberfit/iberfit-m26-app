import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20261004133000_iri_external_report_upsert_rls_fix.sql',
  import.meta.url
);

test('IRI external report upsert SELECT is limited to object.upload and an existing authorized IRI', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /alter policy iri_external_object_read_v12[\s\S]*on storage\.objects[\s\S]*using/i);
  assert.match(sql, /storage\.allow_only_operation\('object\.upload'\)/i);
  assert.match(sql, /iberfit_can_manage_iri_external_report_v12/i);
  assert.match(sql, /from public\.iri_assessments i/i);
  assert.match(sql, /i\.assessment_type\s*=\s*'inicial'/i);
  assert.match(sql, /from public\.iri_external_reports_v26 r/i);
  assert.match(sql, /r\.object_path\s*=\s*storage\.objects\.name/i);
  assert.match(sql, /r\.visible_to_client[\s\S]*iberfit_can_manage_iri_external_report_v12/i);

  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /to\s+public\s+using/i);
});
