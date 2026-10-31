import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('src/m26/supabase-transport.js','utf8');
const fn=s.slice(s.indexOf('  async function clientCompletedHistoryPage('),s.indexOf('  async function rpc(',s.indexOf('  async function clientCompletedHistoryPage(')));
test('QA-only history endpoint has no identity parameter and is not canonical PROD RPC',()=>{
 assert.ok(fn.includes("runtime.qaOnly!==true"));
 assert.ok(fn.includes("runtime.canary!==true"));
 assert.ok(fn.includes("runtime.projectRef!==M26_QA_PROJECT_REF"));
 assert.ok(!fn.includes('p_client_id'));
 assert.ok(!fn.includes('service_role'));
 assert.ok(!s.slice(s.indexOf('const CANONICAL_RPC='),s.indexOf('const RC65C_AUTH_ASSURANCE_RPC')).includes('completed_history_page'));
});
test('transport preserves exact cursor params, cancellation and visible auth errors',()=>{
 for(const term of ["'p_section'","'p_snapshot_at'","'p_cursor'","'p_limit'","'p_limit'","params.p_limit>32",
  "signal","method:'POST'","token","M26_FREE_HISTORY_ARGUMENTS_INVALID"])
  assert.ok(fn.includes(term),term);
 assert.match(fn,/return request\('\/rest\/v1\/rpc\/iberfit_client_completed_history_page_free_v1'/);
 assert.ok(s.includes('    clientCompletedHistoryPage,'));
});
