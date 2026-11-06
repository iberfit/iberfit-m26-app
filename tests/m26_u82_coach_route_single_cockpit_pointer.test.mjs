import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enhanceCoachActionCenter} from '../src/m26/shell/shell-controller.js';

const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');

test('U82: an explicit existing Coach cockpit never recomputes the expensive historical route',()=>{
  const safeRoot={querySelectorAll:()=>[]};
  const invalidState=null;
  const vm={mode:'authenticated',identity:{role:'coach'},activeArea:'hoy'};
  assert.doesNotThrow(()=>enhanceCoachActionCenter({
    root:safeRoot,shellVm:vm,state:invalidState,
    coachCockpit:Object.freeze({items:Object.freeze([]),attentionCount:0}),
  }));
  assert.equal(enhanceCoachActionCenter({root:safeRoot,shellVm:vm,state:invalidState,coachCockpit:null}),false);
  assert.match(shell,/coachCockpit===undefined\s*\?coachTodayViewModel\(shellVm,state\)\?\.coachCockpit/u);
  assert.match(shell,/coachCockpit:getCoachCockpit\(\)/u);
});

test('U82: the live authorized route supplies its one cockpit for DOM enhancement without duplicate rebuilding',()=>{
  assert.match(app,/let coachCockpitForCurrentFrame=null;/u);
  assert.match(app,/coachCockpitForCurrentFrame=null;\s*qaStage\('rc64-route-start'\)/u);
  assert.match(app,/coachCockpitForCurrentFrame=routeVm\?\.coachCockpit\?\?null;/u);
  assert.match(app,/createShellController\(\{root,store,renderRoute,getCoachCockpit:\(\)=>coachCockpitForCurrentFrame\}\)/u);
});

test('U82: Coach physical click returns before a potentially heavy authenticated render without reducing 5s SLA',()=>{
  const begin=shell.lastIndexOf("    const areaButton = event.target.closest?.('[data-m26-area]');");
  const end=shell.indexOf("    const actionButton = event.target.closest?.('[data-m26-action]');",begin);
  assert.ok(begin>=0&&end>begin);
  const nav=shell.slice(begin,end);
  assert.match(nav,/const coachPointer=String\(current\.identity\?\.role\|\|''\)==='coach'/u);
  assert.match(nav,/if\(\(clientTouch\|\|coachPointer\)&&typeof windowLike\?\.setTimeout==='function'\)/u);
  assert.match(nav,/const ticket=\+\+touchRouteTicket/u);
  assert.match(nav,/ticket!==touchRouteTicket\|\|version!==generation\|\|!unsubscribe/u);
  assert.match(nav,/String\(latest\.identity\?\.id\|\|''\)!==ownerId/u);
  assert.match(nav,/String\(latest\.identity\?\.role\|\|''\)!==expectedRole/u);
  assert.match(nav,/String\(latest\.activeArea\|\|''\)!==previousArea/u);
  assert.match(nav,/\},0\);\s*\}else commitRoute\(\);/u);
  assert.match(nav,/forceSync:String\(current\.identity\?\.role\|\|''\)==='coach'/u);
  const u26=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');
  assert.match(u26,/choice\.click\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.match(u26,/expect\.poll\(\(\)=>activeArea\(page\)/u);
  assert.doesNotMatch(u26,/dispatchEvent\(|force:true/u);
});
