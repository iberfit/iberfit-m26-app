import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorkspaceEntryGate} from '../src/m26/app/workspace-entry-gate.js';

const application=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
test('M42 entry serializes two taps on the same workout and blocks competing draft',async()=>{
  let scope='user1|client|member1',release,entered=0;
  const gate=createWorkspaceEntryGate({getScope:()=>scope});
  const work=async({isCurrent})=>{entered++;await new Promise(r=>release=r);return isCurrent();};
  const first=gate.run('session:member1:run',work);
  const second=gate.run('session:member1:run',work);
  assert.strictEqual(first,second);
  await Promise.resolve();
  assert.equal(entered,1);
  assert.throws(()=>gate.run('builder:member1',work),/M42_WORKSPACE_ENTRY_BUSY/);
  release();assert.equal(await first,true);
  assert.equal(gate.isBusy(),false);
});
test('M42 pending recovered session cannot surface after logout or role switch',async()=>{
  let scope='user1|client|member1',release,mutated=false;
  const gate=createWorkspaceEntryGate({getScope:()=>scope});
  const result=gate.run('session:member1:run',async({isCurrent})=>{
    await new Promise(r=>release=r);
    if(!isCurrent())return false;
    mutated=true;return true;
  });
  await Promise.resolve();
  scope='user2|admin|';release();
  assert.equal(await result,false);
  assert.equal(mutated,false);
});
test('M42 explicit cancellation invalidates pending selection even with same identity',async()=>{
  let release,mutated=false;
  const gate=createWorkspaceEntryGate({getScope:()=> 'same-user'});
  const result=gate.run('builder:member1',async({isCurrent})=>{
    await new Promise(r=>release=r);
    if(isCurrent())mutated=true;
  });
  await Promise.resolve();gate.cancel();release();
  assert.equal(await result,false);
  assert.equal(mutated,false);
});
test('M42 both workspace routes share gate and abandon stale async resumes',()=>{
  assert.match(application,/const workspaceEntryGate=createWorkspaceEntryGate/u);
  assert.match(application,/workspaceEntryGate\.run\('builder:'\+clientId/u);
  assert.match(application,/workspaceEntryGate\.run\('session:'\+clientId/u);
  assert.match(application,/if\(!isCurrent\(\)\)return false;/u);
  assert.match(application,/const previous=activeApplicationRole;[\s\S]{0,280}workspaceEntryGate\.cancel\(\)/u);
  assert.match(application,/workspaceEntryGate\.cancel\(\);\s*activeApplicationRole=role;/u);
  assert.match(application,/function destroyControllers[^\n]+workspaceEntryGate\.cancel\(\)/u);
  assert.match(application,/M42_WORKSPACE_ALREADY_ACTIVE/u);
});
