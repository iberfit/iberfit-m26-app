import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('authenticated interaction always releases the real QA browser lease before fixture teardown',()=>{
 const source=readFileSync('qa/rc64/authenticated-interaction.spec.mjs','utf8');
 assert.match(source,/test\.afterEach\(async\(\{page\},testInfo\)=>\{[\s\S]*?releaseQaSessionBeforeContextClose\(page\)/u);
 assert.match(source,/if\(testInfo\.status==='passed'\)expect\(cleanup\)\.toBe\('released'\)/u);
});
test('client DELETE denial gate releases only verified fixture tokens without changing the negative ACL assertion',()=>{
 const source=readFileSync('scripts/remote-gates/qa_client_delete_acl_denial.mjs','utf8');
 assert.match(source,/actual!==String\(email\)\.trim\(\)\.toLowerCase\(\)/u);
 assert.match(source,/issuedSessions\.push\(\{email:actual,token\}\)/u);
 assert.match(source,/await runQaStageWithCleanup\(runDenial,releaseIssuedSessions/u);
 assert.match(source,/r\.status!==403\|\|r\.payload\?\.code!=='42501'/u);
 assert.match(source,/result\.released!==issuedSessions\.length/u);
 assert.doesNotMatch(source,/scope=global|sb_secret_|pjhmrhejsoofmouedavw/u);
});
