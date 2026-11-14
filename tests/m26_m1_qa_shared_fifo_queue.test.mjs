import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// GitHub Actions 2026: cancel-in-progress=false without queue:max still
// silently replaces older pending jobs sharing a concurrency group.
const WORKFLOWS=Object.freeze({
 'authenticated-client-interaction':1,
 'u71-qa-real-dated-e2e':1,
 'remote-gates':1,
 'daily-use-visual-evidence':1,
 'session-qa-isolated':1,
 'device-experience-gate':1,
 'm44-wip-report-quality':1,
 'admin-webauthn-recurring':1,
 'coach-webauthn-recurring':1,
 'qa-real-write-cert':5,
});
test('all shared authenticated QA gates maintain a FIFO queue without cancelling pending evidence',()=>{
 for(const [workflow,expected] of Object.entries(WORKFLOWS)){
  const file=readFileSync(new URL('../.github/workflows/'+workflow+'.yml',import.meta.url),'utf8');
  const lines=file.split(/\r?\n/u);
  const positions=lines.flatMap((line,index)=>line.trim()==='group: iberfit-qa-shared-auth-readonly'?[index]:[]);
  assert.equal(positions.length,expected,workflow+' shared gate declaration count');
  for(const index of positions){
   assert.equal(lines[index+1].trim(),'queue: max',workflow+' must not discard pending jobs');
   assert.equal(lines[index+2].trim(),'cancel-in-progress: false',workflow+' must not interrupt real QA sessions');
   const indent=lines[index].match(/^\s*/u)[0].length;
   assert.equal(lines[index+1].match(/^\s*/u)[0].length,indent,workflow+' YAML queue nesting');
   assert.equal(lines[index+2].match(/^\s*/u)[0].length,indent,workflow+' YAML cancel nesting');
  }
 }
});
