import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPublishedSessionEntryReplay} from '../src/m26/rc39/published-session-entry-intent.js';

function fixture(){
  let clock=1000,clicks=0;
  const scope={owner:{id:'test-user'},role:'client',clientId:'synthetic-client',selectedClientId:'',area:'hoy'};
  const button={
    isConnected:true,disabled:false,
    getAttribute(name){return name==='data-workflow-action'?'start-published-session':
      name==='data-entity-id'?'synthetic-session':null;},
    click(){clicks+=1;},
  };
  const q=createPublishedSessionEntryReplay({
    readScope:()=>scope,findButtons:()=>[button],now:()=>clock,maxAgeMs:8000,
  });
  return {q,scope,button,advance(ms){clock+=ms;},clicks:()=>clicks};
}
test('UNIVERSAL web retains one first tap before controllers are ready, never issuing a direct training command',()=>{
  const f=fixture();
  assert.equal(f.q.capture(f.button),true);
  assert.equal(f.q.capture(f.button),true);
  assert.equal(f.clicks(),0);
  assert.equal(f.q.release(),true);
  assert.equal(f.clicks(),1);
  assert.equal(f.q.release(),false);
  assert.equal(f.clicks(),1);
});
test('UNIVERSAL never replays a tap after owner/session change, route change or stale time',()=>{
  for(const change of [
    f=>{f.scope.owner={id:'test-user'};},
    f=>{f.scope.role='coach';},
    f=>{f.scope.clientId='different-client';},
    f=>{f.scope.selectedClientId='different-client';},
    f=>{f.scope.area='actividad';},
    f=>f.advance(8001),
  ]){
    const f=fixture();
    assert.equal(f.q.capture(f.button),true);
    change(f);
    assert.equal(f.q.release(),false);
    assert.equal(f.clicks(),0);
  }
});
test('UNIVERSAL refuses to replay a removed, disabled or mismatched CTA, and explicit cancellation wins',()=>{
  for(const change of [
    f=>{f.button.isConnected=false;},
    f=>{f.button.disabled=true;},
    f=>{f.button.getAttribute=()=>null;},
    f=>{f.q.cancel();},
  ]){
    const f=fixture();f.q.capture(f.button);change(f);
    assert.equal(f.q.release(),false);
    assert.equal(f.clicks(),0);
  }
});
test('UNIVERSAL never automatically replays an actual workout-start action or a role without training rights',()=>{
  const f=fixture();
  const mutation={getAttribute(name){return name==='data-workflow-action'?'start':name==='data-entity-id'?'synthetic-session':null;}};
  assert.equal(f.q.capture(mutation),false);
  f.scope.role='admin';
  assert.equal(f.q.capture(f.button),false);
  assert.equal(f.q.release(),false);
});
test('UNIVERSAL application wires release after handler mount, protects teardown and remains owner-scoped',()=>{
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(app,/firstSessionEntryReplay\.capture\(button\)/u);
  assert.match(app,/queueMicrotask\(\(\)=>firstSessionEntryReplay\.release\(\)\)/u);
  assert.match(app,/function destroyControllers\([^\n]+firstSessionEntryReplay\.cancel\(\)/u);
  assert.ok(app.indexOf('sessionController.mount();')<app.indexOf('queueMicrotask(()=>firstSessionEntryReplay.release())'));
});
