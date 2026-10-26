import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('U26 Coach IRI network perimeter permits only verified QA read-only probes',()=>{
  const src=read('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
  assert.match(src,/import \{isQaPrivateAvatarRead\} from '\.\.\/rc64\/secure-current-source-auth\.mjs'/u);
  assert.match(src,/if\(url\.origin!==SUPABASE_ORIGIN\)return false/u);
  assert.match(src,/if\(isQaPrivateAvatarRead\(request\)\)return true/u);
  const tables=['iri_consents_v1','iri_photogrammetry_captures_v1',
    'iri_photogrammetry_analyses_v1','iri_photogrammetry_analyses_v2',
    'iri_photo_report_permissions_v1','iri_external_reports_v26'];
  const block=src.slice(src.indexOf('const U26_IRI_READONLY_TABLES='),src.indexOf('const U26_UUID='));
  assert.ok(block.length>100);
  for(const name of tables)assert.ok(block.includes("'"+name+"'"),name);
  const actual=[...block.matchAll(/'iri_[a-z0-9_]+'/gu)].map(match=>match[0].slice(1,-1));
  assert.deepEqual(actual.sort(),[...tables].sort());
  assert.match(src,/method==='GET'&&authenticatedQaRequest\(request\)/u);
  assert.match(src,/U26_IRI_READONLY_TABLES\.has\(url\.pathname\.slice/u);
  assert.match(src,/url\.pathname==='\/rest\/v1\/rpc\/m26_iri_draft_get_v1'/u);
  assert.match(src,/approvedIriDraftRead\(request\)/u);
  assert.match(src,/keys\.every\(key=>\['p_client_id','p_assessment_id'\]\.includes\(key\)\)/u);
  assert.match(src,/if\(method==='POST'&&url\.pathname==='\/auth\/v1\/token'/u);
  assert.doesNotMatch(src,/method==='(PUT|PATCH|DELETE)'/u);
});

test('U26 privileged QA still runs only after Canary merge with fixture cleanup',()=>{
  const flow=read('.github/workflows/coach-webauthn-recurring.yml');
  assert.match(flow,/if: github\.event_name != 'pull_request'/u);
  assert.match(flow,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(flow,/Cleanup Coach QA WebAuthn fixture[\s\S]*?if: always\(\)/u);
});

test('U51 Coach IRI harness mirrors the exact QA-only U39 read-only bootstrap endpoints',()=>{
  const privileged=read('qa/coach-iri-document-privileged/iri-document-privileged.spec.mjs');
  const passing=read('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
  const transport=read('src/m26/supabase-transport.js');
  const allowBlock=privileged.slice(privileged.indexOf('const READ_ONLY_RPCS='),privileged.indexOf('const PHOTO_TABLES='));
  assert.ok(allowBlock.length>300,'privileged IRI RPC allowlist exists');
  const qaRpcNames=[...allowBlock.matchAll(/'([a-z0-9_]+_qa)'/gu)].map(match=>match[1]).sort();
  const expected=[
    'iberfit_bootstrap_v26_core_u37_qa',
    'iberfit_privileged_history_page_u38_qa',
  ].sort();
  assert.deepEqual(qaRpcNames,expected,'no extra QA-only RPCs are permitted');
  const coachAllowBlock=passing.slice(passing.indexOf('const READ_ONLY_RPCS='),passing.indexOf('const U26_IRI_READONLY_TABLES='));
  for(const rpc of expected){
    assert.ok(coachAllowBlock.includes("'"+rpc+"'"),'passing Coach harness requires '+rpc);
    assert.ok(transport.includes("'/rest/v1/rpc/"+rpc+"'"),'atomic loader invokes '+rpc);
  }
  assert.match(privileged,/if\(url\.origin!==QA_ORIGIN\)return false/u);
  assert.match(privileged,/if\(method==='POST'&&url\.pathname\.startsWith\(rpcPrefix\)\)/u);
  assert.match(privileged,/READ_ONLY_RPCS\.has\(rpc\)/u);
  assert.match(privileged,/await route\.abort\('blockedbyclient'\)/u);
});
