import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/remote-gates/run_qa_connected360_v45_write_gate.mjs',import.meta.url),'utf8');

test('V45 QA synthetic identities use JWT-scoped client RPCs, not privileged bootstrap',()=>{
  assert.match(source,/success\('iberfit_current_role_v26',session\.token\)/u);
  assert.match(source,/success\('iberfit_client_id',session\.token\)/u);
  assert.doesNotMatch(source,/success\('iberfit_bootstrap_v26',session\.token\)/u);
  assert.match(source,/ROLE_CLIENT/u);
  assert.match(source,/CLIENTS_DIFFER/u);
  assert.match(source,/ISOLATED_QA_ONLY/u);
});

test('V45 QA failure evidence includes only bounded HTTP and machine-readable error codes',()=>{
  assert.match(source,/result\.body\?\.code/u);
  assert.match(source,/replace\(\/\[\^A-Z0-9_\]\/giu,''\)/u);
  assert.doesNotMatch(source,/JSON\.stringify\(result\.body\)/u);
});
