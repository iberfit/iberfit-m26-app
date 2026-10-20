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
  assert.equal((block.match(/'iri_[a-z0-9_]+\/gu)||[]).length,0);
  assert.match(src,/method==='GET'&&authenticatedQaRequest\(request\)/u);
  assert.match(src,/U26_IRI_READONLY_TABLES\.has\(url\.pathname\.slice/u);
  assert.match(src,/url\.pathname==='\/rest\/v1\/rpc\/m26_iri_draft_get_v1'/u);
  assert.match(src,/approvedIriDraftRead\(request\)/u);
  assert.match(src,/keys\.every\(key=>\['p_client_id','p_assessment_id'\]\.includes\(key\)\)/u);
  assert.match(src,/^|\n\s*if\(method==='POST'&&url\.pathname==='\/auth\/v1\/token'/u);
  assert.doesNotMatch(src,/method==='(PUT|PATCH|DELETE)'/u);
});

test('U26 privileged QA still runs only after Canary merge with fixture cleanup',()=>{
  const flow=read('.github/workflows/coach-webauthn-recurring.yml');
  assert.match(flow,/if: github\.event_name != 'pull_request'/u);
  assert.match(flow,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(flow,/Cleanup Coach QA WebAuthn fixture[\s\S]*?if: always\(\)/u);
});
