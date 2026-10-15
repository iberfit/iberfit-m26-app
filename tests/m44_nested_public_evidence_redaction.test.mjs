import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../supabase/migrations/'+p,import.meta.url),'utf8');
test('M44 public projection strips arbitrary nested keys from evidence and activitySeries',async()=>{
 const publicProjection=await read('20261015142000_m44_report_client_safe_publication_v1.sql');
 const issuedSource=await read('20261015143500_m44_immutable_evolution_pdf_ledger_v1.sql');
 for(const sql of [publicProjection,issuedSource]){
  assert.match(sql,/jsonb_agg\(jsonb_build_object\(/);
  assert.match(sql,/'label',item->>'label','text',item->>'text'/);
  assert.match(sql,/'source',item->>'source','quality',left/);
  assert.match(sql,/'from',item->>'from','to',item->>'to','count',item->'count'/);
  assert.match(sql,/with ordinality as evidence\(item,ord\)/i);
  assert.doesNotMatch(sql,/'evidence',coalesce\((?:new\.body|v_report\.content)->'evidence'/);
  assert.doesNotMatch(sql,/'activitySeries',coalesce\((?:new\.body|v_report\.content)->'activitySeries'/);
 }
});
