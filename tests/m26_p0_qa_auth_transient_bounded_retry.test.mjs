import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
for(const file of [
 'scripts/remote-gates/qa_client_delete_acl_denial.mjs',
 'scripts/remote-gates/run_qa_connected360_v45_write_gate.mjs',
]){
 test(file+' only retries QA Auth gateway outages once, without retrying 429 or bad credentials',()=>{
  const src=get(file);
  assert.match(src,/attempt=0;attempt<2;attempt\+\+/u);
  assert.match(src,/\/auth\/v1\/token\?grant_type=password/u);
  assert.match(src,/\.has\((?:res|r)\.status\)/u);
  assert.match(src,/setTimeout\(resolve,800\)/u);
  assert.match(src,/\b522\b/u);
  assert.doesNotMatch(src,/\b429\b[,\s]*[,\s]*\b(?:502|503)\b/u);
  assert.match(src,/failed_http_|FAILED_HTTP_/iu);
  assert.doesNotMatch(src,/console\.(?:log|error|warn)\(\s*(?:email|password|token)/u);
 });
}
