import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('15-Oct release gate includes open role P0, report privacy, evidence and A4 QA',async()=>{
  const text=await read('docs/product/IBERFIT_20261015_INTEGRATED_AUDIT_AND_INNOVATION.md');
  for(const term of ['#941','PWA Windows','SECURITY DEFINER','dos pestañas','PDF con bytes/hash','CI:'])
    assert.ok(text.includes(term),term);
});
test('Continuidad: immutable original/approved/executed IDs and never fictitious equivalence',async()=>{
  const text=await read('docs/product/IBERFIT_20261015_INTEGRATED_AUDIT_AND_INNOVATION.md');
  for(const id of ['originalSessionId','approvedAlternativeId','executedVariantId'])
    assert.ok(text.includes(id),id);
  assert.match(text,/NO es automáticamente equivalente/);
  const current=await read('src/m26/engagement/confirmed-adherence.js');
  assert.match(current,/A completed execution cannot retroactively turn a recorded no-show/);
});
test('provider neutral contract records consent, original timestamp, ingestion and disconnect semantics',async()=>{
  const text=await read('docs/product/IBERFIT_20261015_INTEGRATED_AUDIT_AND_INNOVATION.md');
  for(const term of ['providerRecordId','metricType','observedAt','ingestedAt','consentimiento','revocación','Withings+','Fitbit Web API'])
    assert.ok(text.includes(term),term);
});
test('M44 HTTP bootstrap does not expose raw report entities to Client',async()=>{
  const sql=await read('supabase/migrations/20261015142500_m44_bootstrap_private_reports_http_fence_v1.sql');
  assert.match(sql,/M44_REPORT_BOOTSTRAP_PRIVATE_PROJECTION_V1/);
  assert.match(sql,/item->>'entityType' is distinct from 'report'/);
  assert.match(sql,/r\.value->>'status'='publicado'/);
});
