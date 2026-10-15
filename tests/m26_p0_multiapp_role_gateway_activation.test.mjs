import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const application=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const enhancer=readFileSync(new URL('../src/m26/rc39/shell-enhancer.js',import.meta.url),'utf8');

function bodyBetween(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a!==-1&&b>a,'expected production implementation');
  return source.slice(a,b);
}

test('P0: modal selection is handled in capture phase before workspace click handlers',()=>{
  const mount=bodyBetween(shell,'function mount({progressive=false}={}) {','function destroy() {');
  const modal=mount.indexOf("root.addEventListener('click', onRoleChoiceClick, true);");
  const general=mount.indexOf("root.addEventListener('click', onClick);");
  assert.ok(modal>=0&&general>modal,'gateway capture comes before general navigation');
  assert.match(shell,/root.removeEventListener\('click', onRoleChoiceClick, true\);/u);
  assert.match(enhancer,/data-m26-role-choice-status role="status" aria-live="polite"/u);
});

test('P0: actual gateway handler dispatches one authorized role intent and releases pointer locks',()=>{
  const block=bodyBetween(shell,'  function dispatchRoleChoice(button){','  function onClick(event) {');
  const events=[];
  const root={
    contains:()=>true,
    dispatchEvent:event=>events.push(event),
  };
  const releases=[];
  const factory=new Function('root','releasePointerInteraction','releaseFormInteraction',
    block+'return onRoleChoiceClick;');
  const handler=factory(root,()=>releases.push('pointer'),()=>releases.push('form'));
  let stopped=0,prevented=0;
  const button={getAttribute:k=>k==='data-m26-switch-role'?'coach':null};
  const click={
    target:{closest:selector=>selector==='.m26-role-choice [data-m26-switch-role]'?button:null},
    preventDefault(){prevented+=1;},
    stopImmediatePropagation(){stopped+=1;},
  };
  handler(click);
  assert.deepEqual(releases,['pointer','form']);
  assert.equal(events.length,1);
  assert.equal(events[0].type,'m26:switch-role');
  assert.equal(events[0].detail.role,'coach');
  assert.equal(stopped,1);
  assert.equal(prevented,1);
  handler({...click,target:{closest:()=>null}});
  assert.equal(events.length,1,'non-gateway controls cannot trigger a second role selection');
});

test('P0: app handles role choice as single-flight and confirms server-projected role',()=>{
  const block=bodyBetween(application,'  async function onSwitchRole(event){','  function onInspectOperation');
  assert.match(block,/if\(roleSwitchBusy\)return false;/u);
  assert.match(block,/const applicationAccess=store\.getState\(\)\.applicationAccess\|\|\{\};/u);
  assert.match(block,/!canSwitchApplication\(applicationAccess\)\|\|!allowed\.includes\(role\)/u);
  assert.match(block,/state\?\.identity\?\.role!==role/u);
  assert.match(block,/state\?\.applicationAccess\?\.roleChoiceConfirmed!==true/u);
  assert.match(block,/finally\{\s*roleSwitchBusy=false/u);
  assert.match(application,/data-m26-role-choice-status/u);
  assert.doesNotMatch(block,/withActiveRole\(|assurance:\s*'verified'|skipMfa/u);
});

test('P0 regression: persisted execution cannot block the initial Coach/Admin role chooser',()=>{
  const setup=bodyBetween(application,
    '    progressiveControllerMountPromise=(async()=>{',
    '    })().catch((error)=>{');
  assert.match(setup,/const choicePending=canSwitchApplication\(accessBeforeChoice\)/u);
  assert.match(setup,/accessBeforeChoice\.roleChoiceConfirmed!==true/u);
  assert.match(setup,/const executionRestored=choicePending\?false:await restoreExecutionAfterAuthentication\(\);/u);
  const handler=bodyBetween(application,'  async function onSwitchRole(event){','  function onInspectOperation');
  assert.match(handler,/const initialChoice=applicationAccess\.roleChoiceConfirmed!==true;/u);
  assert.match(handler,/if\(sessionUi&&!initialChoice\)\{/u,'active workouts block switching after role confirmation');
  assert.match(handler,/if\(sessionUi&&initialChoice\)sessionUi=null;/u,'pre-choice UI is released while durable recovery remains');
  assert.match(handler,/if\(initialChoice&&\['coach','client'\]\.includes\(role\)\)\{/u);
  const verifyIndex=handler.indexOf("throw new Error('M26_ROLE_SWITCH_CONFIRMATION_MISSING');");
  const recoveryIndex=handler.indexOf('await restoreExecutionAfterAuthentication();',verifyIndex);
  assert.ok(verifyIndex>=0&&recoveryIndex>verifyIndex,'recovery happens only after authoritative role verification');
  assert.doesNotMatch(handler,/if\(initialChoice&&\['coach','client','admin'\]/u,'Admin cannot auto-resume Coach execution');
});
