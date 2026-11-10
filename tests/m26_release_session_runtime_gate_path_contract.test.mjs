import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const releaseSensitivePaths=[
  'src/m26/workflows/session-controller.js',
  'src/m26/workflows/session-execution.js',
  'src/m26/workflows/session-recovery.js',
  'src/m26/command-bus.js',
];
const workflows=[
  {file:'.github/workflows/coach-webauthn-recurring.yml',events:['pull_request','push']},
  {file:'.github/workflows/admin-webauthn-recurring.yml',events:['pull_request','push']},
  {file:'.github/workflows/remote-gates.yml',events:['push']},
];

function triggerBody(yaml,event){
  const marker='  '+event+':\\n';
  const start=yaml.indexOf(marker);
  assert.ok(start>=0,'event exists: '+event);
  const remainder=yaml.slice(start+marker.length);
  const end=remainder.search(/\\n  (?:push|pull_request|workflow_dispatch|schedule):/u);
  return end<0?remainder:remainder.slice(0,end);
}

test('all authenticated release gates run for session persistence and command-bus changes',()=>{
  for(const {file,events} of workflows){
    const yaml=readFileSync(file,'utf8');
    for(const event of events){
      const block=triggerBody(yaml,event);
      for(const path of releaseSensitivePaths){
        const hit=block.split("- '"+path+"'").length-1;
        assert.equal(hit,1,file+' '+event+' must include exactly one '+path);
      }
    }
  }
});
