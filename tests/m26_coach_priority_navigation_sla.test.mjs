import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {schedulePriorityNavigation} from '../src/m26/shell/navigation.js';

function harness({scheduler=true}={}){
  const tasks=[],timers=[],priorities=[];
  const host={
    setTimeout(fn){timers.push(fn);return timers.length;},
  };
  if(scheduler)host.scheduler={postTask(fn,{priority}){tasks.push(fn);priorities.push(priority);return Promise.resolve();}};
  return {host,tasks,timers,priorities};
}
test('Coach click commits on next browser task with user-blocking priority, never inside pointer dispatch',async()=>{
  const {host,tasks,timers,priorities}=harness();
  let commits=0;
  assert.equal(schedulePriorityNavigation(()=>{commits++;},{windowLike:host}),'priority-task');
  assert.equal(commits,0);
  assert.deepEqual(priorities,['user-blocking']);
  assert.equal(timers.length,0);
  tasks[0]();
  assert.equal(commits,1);
  tasks[0]();
  assert.equal(commits,1,'a duplicate task callback cannot navigate twice');
});
test('WebKit/Safari PWA takes the exact bounded timer fallback without synchronous DOM replacement',()=>{
  const {host,timers}=harness({scheduler:false});
  let commits=0;
  assert.equal(schedulePriorityNavigation(()=>commits++,{windowLike:host}),'timer');
  assert.equal(commits,0);
  assert.equal(timers.length,1);
  timers[0]();
  assert.equal(commits,1);
});
test('postTask rejection before invocation reschedules once; rejection after invocation does not replay',async()=>{
  const timers=[];
  const failBefore={setTimeout(fn){timers.push(fn);},scheduler:{postTask(){return Promise.reject(new Error('cancelled'));}}};
  let count=0;
  schedulePriorityNavigation(()=>count++,{windowLike:failBefore});
  await Promise.resolve();await Promise.resolve();
  assert.equal(timers.length,1);
  timers[0]();
  assert.equal(count,1);
  const reported=[];
  const failAfter={setTimeout(fn){timers.push(fn);},reportError(error){reported.push(error.message);},
    scheduler:{postTask(fn){fn();return Promise.reject(new Error('post-task-error'));}}};
  schedulePriorityNavigation(()=>count++,{windowLike:failAfter});
  await Promise.resolve();await Promise.resolve();
  assert.equal(timers.length,1,'do not replay a route after it already committed');
  assert.equal(count,2);
  assert.deepEqual(reported,['post-task-error'],'an executed task failure must remain observable');
});
test('synchronous unsupported scheduler preserves fallback; invalid priorities reject safely',()=>{
  const {host,timers}=harness();
  host.scheduler.postTask=()=>{throw new Error('not supported');};
  let commits=0;
  assert.equal(schedulePriorityNavigation(()=>commits++,{windowLike:host}),'timer');
  assert.equal(commits,0);
  timers[0]();
  assert.equal(commits,1);
  assert.throws(()=>schedulePriorityNavigation(()=>{},{windowLike:host,priority:'background'}),/PRIORITY_INVALID/);
});
test('authenticated Coach navigation keeps exact ticket, generation, owner, role, route CAS and forceSync',()=>{
  const shell=readFileSync('src/m26/shell/shell-controller.js','utf8');
  assert.match(shell,/schedulePriorityNavigation\(\(\)=>\{/);
  assert.match(shell,/priority:coachPointer\?'user-blocking':'user-visible'/);
  assert.match(shell,/ticket!==touchRouteTicket\|\|version!==generation\|\|!unsubscribe/);
  assert.match(shell,/String\(latest\.identity\?\.id\|\|''\)!==ownerId/);
  assert.match(shell,/String\(latest\.identity\?\.role\|\|''\)!==expectedRole/);
  assert.match(shell,/String\(latest\.activeArea\|\|''\)!==previousArea/);
  assert.match(shell,/forceSync:String\(current\.identity\?\.role\|\|''\)==='coach'/);
});

test('Postmerge Coach, Admin and remote release gates watch the exact shell navigation runtime',()=>{
  const admin=readFileSync('.github/workflows/admin-webauthn-recurring.yml','utf8');
  const remote=readFileSync('.github/workflows/remote-gates.yml','utf8');
  const coach=readFileSync('.github/workflows/coach-webauthn-recurring.yml','utf8');
  const after=(yaml,tag,next)=>yaml.split('  '+tag+':')[1]?.split('  '+next+':')[0]||'';
  const adminPr=after(admin,'pull_request','push');
  const adminPush=after(admin,'push','workflow_dispatch');
  const remotePush=after(remote,'push','workflow_dispatch');
  for(const scope of [adminPr,adminPush,remotePush]){
    for(const path of ['src/m26/shell/shell-controller.js','src/m26/shell/navigation.js']){
      assert.equal(scope.split("- '"+path+"'").length-1,1,'exact navigation trigger '+path);
    }
    assert.ok(!scope.includes("- 'src/**'"),'no broad source trigger');
  }
  assert.match(after(coach,'push','workflow_dispatch'),/src\/m26\/shell\/\*\*/u);
});
