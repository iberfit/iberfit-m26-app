import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const transport=readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
const other=[
 'qa/rc64/authenticated-smoke.spec.mjs',
 'qa/rc64/authenticated-current-contract.spec.mjs',
 'qa/rc64/authenticated-interaction.spec.mjs',
 'qa/rc64/authenticated-visual-evidence.spec.mjs',
].map(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'));

test('U39 production, QA Admin and QA Client continue on the unchanged bootstrap method',()=>{
 assert.match(app,/const qaAtomicCoach=runtime\.qaOnly===true[\s\S]*qa\.rc74\.coach@iberfit\.cl/u);
 assert.match(app,/transport\.bootstrapQaCoachWithHistory\(currentToken\(\),\{assertOwner:requireOwner\}\)/u);
 assert.match(app,/:transport\.bootstrap\(currentToken\(\)\)/u);
 assert.match(app,/requireOwner\(\); \/\/ Never interpret A's snapshot under B's active role\/token/u);
 const start=app.indexOf('const qaAtomicCoach=');
 const store=app.indexOf('store.hydrate(enriched)',start);
 const snap=app.indexOf('primarySnapshot,',start);
 assert.ok(start>=0&&snap>start&&store>snap,
   'no incomplete history may reach the canonical store');
});

test('U39 uses exactly two versioned read-only APIs and does not relax auth or retries',()=>{
 assert.match(transport,/if\(!runtime\.qaOnly\)throw new Error\('U39_QA_ONLY'\)/u);
 assert.match(transport,/iberfit_bootstrap_v26_core_u37_qa/u);
 assert.match(transport,/iberfit_privileged_history_page_u38_qa/u);
 assert.match(transport,/createPrivilegedHistoryAssembler\(core,\{owner,profile:'u38-qa-adaptive'\}\)/u);
 assert.match(transport,/U39_HISTORY_NOT_COMPLETE/u);
 assert.match(transport,/Promise\.allSettled\(workers\)/u);
 assert.match(transport,/error\?\.body\?\.code\|\|''\)!=='54000'/u);
 assert.match(transport,/U38_PAGE_BODY_BUDGET_EXCEEDED/u);
 assert.doesNotMatch(transport,/U39_.*(service_role|secretKey|localStorage\.setItem)/u);
});
test('U39 QA protected browsers allow only the specific versioned read RPC names',()=>{
 assert.ok(qa.includes("'iberfit_bootstrap_v26_core_u37_qa'"));
 assert.ok(qa.includes("'iberfit_privileged_history_page_u38_qa'"));
 for(const src of other){
  assert.ok(!src.includes("'iberfit_bootstrap_v26_core_u37_qa'"),
    'Client and pre-WebAuthn QA networks remain strictly allowlisted');
  assert.ok(!src.includes("'iberfit_privileged_history_page_u38_qa'"));
 }
 assert.match(qa,/if\(!isQaBootstrapRequest\(request,SUPABASE_ORIGIN\)[\s\S]*!isU39QaBootstrapOrHistory\(request\)\)return/u);
 assert.match(qa,/snapshotBootstrap\(\)/u);
 assert.match(qa,/expect\(bootstrap\.failureCount[\s\S]*toBe\(0\)/u);
 assert.doesNotMatch(qa,/console\.log\(auth\)|evidence\.token|evidence\.password/u);
});
