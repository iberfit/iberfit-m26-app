import test from 'node:test';
import assert from 'node:assert/strict';
import {
  qaIriPhotoStateTable,summarizeQaIriPhotoStateResponse,summarizeQaIriPhotoStateChecks,
} from '../qa/coach-webauthn-recurring/qa-iri-photo-response-metrics.mjs';

const ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const request=(url,method='GET')=>({url:()=>url,method:()=>method});
const TABLE='iri_consents_v1';
test('IRI state QA observer accepts only the five exact read-only QA tables',()=>{
  assert.equal(qaIriPhotoStateTable(request(ORIGIN+'/rest/v1/'+TABLE+'?assessment_id=eq.private'),ORIGIN),TABLE);
  assert.equal(qaIriPhotoStateTable(request(ORIGIN+'/rest/v1/iri_photo_report_permissions_v1'),ORIGIN),'iri_photo_report_permissions_v1');
  for(const [url,method] of [
    [ORIGIN+'/rest/v1/iri_external_reports_v26','GET'],
    ['https://pjhmrhejsoofmouedavw.supabase.co/rest/v1/'+TABLE,'GET'],
    [ORIGIN+'/rest/v1/'+TABLE,'POST'],
    [ORIGIN+'/rest/v1/'+TABLE+'/private','GET'],
  ])assert.equal(qaIriPhotoStateTable(request(url,method),ORIGIN),null);
});
test('IRI QA response shape summarizes arrays and rejects malformed or non-array responses without storing data',()=>{
  const secret='DO-NOT-RETAIN-PRIVATE-HEALTH-DATA';
  const sample=(rawText,contentType='application/json; charset=utf-8')=>
    summarizeQaIriPhotoStateResponse({table:TABLE,status:200,contentType,rawText,timing:{responseEnd:145.3}});
  const good=sample(JSON.stringify([{secret},{secret}]));
  assert.equal(good.shape,'array');assert.equal(good.rows,2);
  assert.equal(good.durationMs,145);assert.equal(good.contentKind,'json');
  assert.equal(sample(JSON.stringify({secret})).shape,'object');
  assert.equal(sample('not valid JSON').shape,'invalid-json');
  assert.equal(sample('null').shape,'null');
  assert.equal(sample('[]','application/vnd.pgrst.array+json').contentKind,'vendor-json');
  const summary=summarizeQaIriPhotoStateChecks([good,sample(JSON.stringify({secret}))]);
  assert.equal(summary.requests,2);assert.equal(summary.mismatches,1);
  assert.equal(JSON.stringify(summary).includes(secret),false);
  assert.equal(JSON.stringify(good).includes(secret),false);
  assert.equal(JSON.stringify(good).includes('assessment_id'),false);
});
test('IRI QA observer is bounded and preserves network failures without leaked messages',()=>{
  const failed=summarizeQaIriPhotoStateResponse({table:TABLE,networkFailure:true,contentType:'',rawText:'secret'});
  assert.equal(failed.shape,'network-failure');assert.equal(failed.httpStatus,0);
  const invalid=summarizeQaIriPhotoStateResponse({table:TABLE,rawText:'x'.repeat(2_000_001)});
  assert.equal(invalid.shape,'inspection-limit');
  const rows=Array.from({length:35},()=>failed);
  const summary=summarizeQaIriPhotoStateChecks(rows);
  assert.equal(summary.samples.length,32);assert.equal(summary.truncated,true);
  assert.equal(summarizeQaIriPhotoStateResponse({table:'private',rawText:'secret'}),null);
});
