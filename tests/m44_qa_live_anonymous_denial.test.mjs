import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('M44 hosted QA anonymous negative gate never needs secrets or sends requests to production',async()=>{
 const smoke=await readFile(new URL('../qa/m44/qa-edge-anonymous-denial.mjs',import.meta.url),'utf8');
 const wf=await readFile(new URL('../.github/workflows/m44-wip-report-quality.yml',import.meta.url),'utf8');
 assert.match(smoke,/gjztkdwfmunnzhtvxrsu\.supabase\.co/);
 assert.match(smoke,/untrusted-origin\.invalid/);
 assert.match(smoke,/anonymous write forbidden/);
 assert.match(smoke,/anonymous read forbidden/);
 assert.match(smoke,/mutationRequestsExecuted:0/);
 assert.doesNotMatch(smoke,/app\.iberfit\.cl|pjhmrhejsoofmouedavw|PASSWORD|SECRET_KEY|SERVICE_ROLE_KEY/);
 assert.match(wf,/qa-edge-anonymous-denial:/);
 assert.match(wf,/node qa\/m44\/qa-edge-anonymous-denial\.mjs/);
});
