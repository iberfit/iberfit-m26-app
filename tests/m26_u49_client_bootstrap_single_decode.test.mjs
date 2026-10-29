import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCanonicalBootstrapResponse} from '../src/m26/supabase-transport.js';
const body=(value)=>({text:async()=>value});

test('U49 preserves exact canonical payload including Unicode',async()=>{
 const original={user:{role:'client'},data:{m26Entities:[{body:{title:'Sesión 🏃‍♀️'}}],sessionExecutions:[{revision:4}]}};
 assert.deepEqual(await parseCanonicalBootstrapResponse(body(JSON.stringify(original))),original);
});
test('U49 validates real UTF-8 wire bytes, not character count',async()=>{
 assert.equal(await parseCanonicalBootstrapResponse(body('"🟢"'),6),'🟢');
 await assert.rejects(()=>parseCanonicalBootstrapResponse(body('"🟢"'),5),e=>e.status===413&&e.message==='M26_RESPONSE_TOO_LARGE');
 await assert.rejects(()=>parseCanonicalBootstrapResponse(body('{"a":1}    '),7),e=>e.status===413);
});
test('U49 maintains fail-closed invalid budgets and old malformed JSON behavior',async()=>{
 assert.deepEqual(await parseCanonicalBootstrapResponse(body('{"broken":')), {});
 await assert.rejects(()=>parseCanonicalBootstrapResponse(body('{}'),0),/M26_RESPONSE_LIMIT_INVALID/u);
 await assert.rejects(()=>parseCanonicalBootstrapResponse(body('{}'),20_000_001),/M26_RESPONSE_LIMIT_INVALID/u);
});
test('U49 only optimizes bootstrap, preserving 20MB, Auth headers and other RPCs',()=>{
 const s=readFileSync('src/m26/supabase-transport.js','utf8');
 for(const key of ["canonicalBootstrapWire=path==='/rest/v1/rpc/iberfit_bootstrap_v26'",
 'parseCanonicalBootstrapResponse(response)',"const MAX_RESPONSE_BYTES=20_000_000",
 "credentials:'omit'","cache:'no-store'","redirect:'error'",
 "contentLength(response)>MAX_RESPONSE_BYTES","jsonByteLength(payload)>MAX_RESPONSE_BYTES"])
  assert.ok(s.includes(key),key);
 assert.match(s,/authorization: `Bearer \$\{String\(token\)\}`/u);
});
