import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isQaBootstrapRequest,sanitizeQaBootstrapResponse,summarizeQaBootstrapSamples,
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
