import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isQaBootstrapRequest,sanitizeQaBootstrapResponse,summarizeQaBootstrapSamples,summarizeQaBootstrapPayload,
} from '../qa/coach-webauthn-recurring/qa-bootstrap-response-metrics.mjs';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const req=(url,method='POST')=>({url:()=>url,method:()=>method});

test('QA bootstrap observer matches only exact origin, method, and RPC',()=>{
  assert.equal(isQaBootstrapRequest(req(QA+'/rest/v1/rpc/iberfit_bootstrap_v26'),QA),true);
  for(const request of [
    req(QA+'/rest/v1/rpc/iberfit_bootstrap_v26','GET'),
    req(QA+'/rest/v1/rpc/iberfit_bootstrap_v26_extra'),
    req(QA+'/rest/v1/rpc/iberfit_other_v26'),
    req('https://pjhmrhejsoofmouedavw.supabase.co/rest/v1/rpc/iberfit_bootstrap_v26'),
    req('https://gjztkdwfmunnzhtvxrsu.supabase.co.evil.test/rest/v1/rpc/iberfit_bootstrap_v26'),
  ])assert.equal(isQaBootstrapRequest(request,QA),false);
  assert.equal(isQaBootstrapRequest(null,QA),false);
  assert.equal(isQaBootstrapRequest(req('invalid'),QA),false);
});

test('HTTP success, SQL 500 and failed network yield bounded numeric-only evidence',()=>{
  const good=sanitizeQaBootstrapResponse({status:200,timing:{responseEnd:8232.5},contentLength:'8700352'});
  const failed=sanitizeQaBootstrapResponse({status:500,timing:{responseEnd:8740},contentLength:'123'});
  const aborted=sanitizeQaBootstrapResponse({status:0,timing:{responseEnd:-1},contentLength:null});
  assert.deepEqual(good,{httpStatus:200,durationMs:8233,contentLengthBytes:8700352});
  assert.deepEqual(failed,{httpStatus:500,durationMs:8740,contentLengthBytes:123});
  assert.deepEqual(aborted,{httpStatus:0,durationMs:null,contentLengthBytes:null});
  const summary=summarizeQaBootstrapSamples([good,failed,aborted]);
  assert.equal(summary.requestCount,3);
  assert.equal(summary.failureCount,2);
  assert.equal(summary.maxDurationMs,8740);
  assert.deepEqual(summary.samples,[good,failed,aborted]);
});

test('Payload, headers, token and response body must never survive serialization',()=>{
  const sample=sanitizeQaBootstrapResponse({
    status:401,
    timing:{responseEnd:110},
    contentLength:'NaN',
    authorization:'Bearer SECRET',
    email:'sensitive@example.test',
    responseBody:'{"code":"57014","secret":"secret"}',
  });
  const report=summarizeQaBootstrapSamples([sample]);
  const output=JSON.stringify(report);
  for(const forbidden of ['SECRET','sensitive@example.test','responseBody','authorization','secret'])
    assert.equal(output.includes(forbidden),false);
  assert.deepEqual(Object.keys(sample),['httpStatus','durationMs','contentLengthBytes']);
  assert.equal(sample.contentLengthBytes,null);
  assert.equal(sanitizeQaBootstrapResponse({status:200,timing:{responseEnd:Infinity},contentLength:'-10'}).durationMs,null);
});

test('Many requests preserve failure totals without unbounded raw detail',()=>{
  const many=Array.from({length:95},(_,i)=>sanitizeQaBootstrapResponse({
    status:i===92?500:200,timing:{responseEnd:i+1},
  }));
  const summary=summarizeQaBootstrapSamples(many);
  assert.equal(summary.requestCount,95);
  assert.equal(summary.failureCount,1);
  assert.equal(summary.maxDurationMs,95);
  assert.equal(summary.samples.length,64);
  assert.equal(summary.samplesTruncated,true);
});


test('U35 profile counts true collections and canonical/legacy overlap without publishing identifiers',()=>{
  const secret='qa-coach-private-data@example.invalid';
  const example={
    data:{
      m26Entities:[
        {entityType:'session_execution',entityId:'execution-1',body:{note:secret}},
        {entityType:'session_execution',entityId:'execution-2',body:{note:'x'}},
        {entityType:'session',entityId:'session-1',body:{note:'x'}},
        {entityType:'private_note',entityId:'secret',body:{note:secret}},
      ],
      sessionExecutions:[{id:'execution-1',comment:secret}],
      domainEvents:[{description:secret}],
      clients:[{email:secret}],
    },
    remoteRevisions:{'session:session-1':3},
    user:{email:secret},
  };
  const result=summarizeQaBootstrapPayload(JSON.stringify(example));
  assert.equal(result.sections.m26Entities.count,4);
  assert.equal(result.sections.sessionExecutions.count,1);
  assert.equal(result.sections.domainEvents.count,1);
  assert.equal(result.canonicalEntityTypes.sessionExecution,2);
  assert.equal(result.canonicalEntityTypes.session,1);
  assert.equal(result.canonicalLegacyExecutionIdOverlap,1);
  assert.equal(result.remoteRevisionEntries,1);
  const safe=JSON.stringify(result);
  for(const banned of [secret,'execution-1','execution-2','session-1','private_note','comment','description','email','body'])
    assert.equal(safe.includes(banned),false,'never serialize private data or dynamic entity names');
});

test('U35 payload profile handles invalid and oversized bodies without leaking content',()=>{
  assert.equal(summarizeQaBootstrapPayload(null),null);
  assert.equal(summarizeQaBootstrapPayload('not json').invalidJson,true);
  assert.equal(summarizeQaBootstrapPayload('{}').invalidShape,true);
  const oversize=summarizeQaBootstrapPayload('S'.repeat(16_000_001));
  assert.deepEqual(Object.keys(oversize),['schema','responseBytes','overInspectionBudget']);
  assert.equal(oversize.overInspectionBudget,true);
  assert.equal(oversize.responseBytes,16_000_001);
  assert.equal(JSON.stringify(oversize).includes('SSSS'),false);
});
