import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {assertActionAllowed,M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const data=JSON.parse(
  fs.readFileSync(
    new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url),
  ),
);
const catalog=createExerciseCatalog(data);

function sessionWithTarget(targetRpe=7){
  const draft=createSessionDraft({
    clientId:'client-quick-rpe',
    title:'Coach quick RPE',
  });
  addCatalogExercise(draft,catalog.list()[0].id,catalog,{
    sets:2,
    reps:'10',
    restSeconds:60,
    targetRpe,
    targetRir:3,
  });
  return draft;
}

test('Coach sees three touch RPE shortcuts around the planned target while Client stays simpler',()=>{
  const session=sessionWithTarget(7);
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-quick-rpe'});
  startExecution(execution);

  const coachHtml=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(coachHtml,/m26-session-coach-rpe-quick/);
  assert.match(coachHtml,/data-session-action="set-rpe-quick"/);
  for(const value of [6,7,8]){
    assert.match(coachHtml,new RegExp(`data-rpe-value="${value}"`));
  }
  assert.match(coachHtml,/aria-pressed="false"/);

  const clientHtml=renderGuidedExecution({execution,session,catalog,role:'client'});
  assert.doesNotMatch(clientHtml,/m26-session-coach-rpe-quick/);
  assert.doesNotMatch(clientHtml,/data-session-action="set-rpe-quick"/);
});

test('quick RPE remains bounded near the top of the scale',()=>{
  const session=sessionWithTarget(10);
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-quick-rpe-top'});
  startExecution(execution);
  const html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  for(const value of [8,9,10])assert.match(html,new RegExp(`data-rpe-value="${value}"`));
  assert.doesNotMatch(html,/data-rpe-value="11"/);
});

test('quick RPE action is Coach-only and remains UI coordination rather than a domain dispatch action',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['set-rpe-quick'],{
    roles:['coach'],
    domain:'execution',
  });
  assert.equal(assertActionAllowed('set-rpe-quick','coach'),true);
  assert.equal(assertActionAllowed('set-rpe-quick','client'),false);
  assert.equal(assertActionAllowed('set-rpe-quick','admin'),false);

  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const dispatchStart=source.indexOf('export function dispatchSessionAction');
  const dispatchEnd=source.indexOf('export function createSessionController',dispatchStart);
  assert.doesNotMatch(source.slice(dispatchStart,dispatchEnd),/set-rpe-quick/u);
  assert.match(source.slice(dispatchEnd),/if\(action==='set-rpe-quick'\)/u);
});

test('quick RPE translations are complete across supported surface languages',()=>{
  assert.equal(iberfitSurfaceTranslate('RPE rápido',{language:'en'}),'Quick RPE');
  assert.equal(iberfitSurfaceTranslate('RPE rápido',{language:'fr'}),'RPE rapide');
  assert.equal(iberfitSurfaceTranslate('RPE rápido',{language:'pt'}),'RPE rápido');
});

function controllerHarness(){
  const listeners=[];
  const session=sessionWithTarget(7);
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-controller-rpe'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});

  let persistCalls=0;
  const rpeInput={
    value:'',
    getAttribute(name){return name==='data-set-field'?'rpe':null;},
  };
  const quickButton={
    disabled:false,
    attrs:new Map([
      ['data-session-action','set-rpe-quick'],
      ['data-rpe-value','8'],
      ['aria-pressed','false'],
    ]),
    getAttribute(name){return this.attrs.get(name)||null;},
    setAttribute(name,value){this.attrs.set(name,String(value));},
    removeAttribute(name){this.attrs.delete(name);},
  };
  const root={
    addEventListener(type,fn,capture=false){listeners.push({type,fn,capture:Boolean(capture)});},
    removeEventListener(){},
    querySelector(selector){
      if(selector==='[data-set-field="rpe"]')return rpeInput;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='[data-set-field]')return [rpeInput];
      if(selector==='[data-session-action="set-rpe-quick"]')return [quickButton];
      return [];
    },
  };
  const recoveryCoordinator={
    async persist(){persistCalls+=1;},
    async settle(){},
  };
  const controller=createSessionController({
    root,
    getContext:()=>({
      execution,
      session,
      catalog,
      actor:{role:'coach',userId:'coach-1'},
      recoveryCoordinator,
    }),
    render:()=>{},
    onError:(error)=>{throw error;},
    autosaveDelayMs:50,
    liveTelemetryController:{
      start:async()=>{},
      pause:async()=>{},
      resume:async()=>{},
      stop:async()=>{},
    },
    lifecycleTarget:{addEventListener(){},removeEventListener(){}},
    visibilityTarget:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},
  });
  controller.mount();
  const click=listeners.find((item)=>item.type==='click'&&!item.capture)?.fn;
  assert.equal(typeof click,'function');
  const event={
    target:{closest:(selector)=>selector==='[data-session-action]'?quickButton:null},
    preventDefault(){},
  };
  return {
    controller,
    execution,
    rpeInput,
    quickButton,
    click,
    event,
    get persistCalls(){return persistCalls;},
  };
}

test('Coach quick RPE updates only the active draft and persists recovery state without completing the set',async()=>{
  const harness=controllerHarness();
  await harness.click(harness.event);

  assert.equal(harness.rpeInput.value,'8');
  assert.equal(harness.quickButton.attrs.get('aria-pressed'),'true');
  assert.equal(harness.execution.activeSetDraft?.values?.rpe,'8');
  assert.deepEqual(harness.execution.results,{});
  assert.equal(harness.execution.setIndex,0);
  assert.equal(harness.execution.restUntil,null);

  await new Promise((resolve)=>setTimeout(resolve,80));
  assert.ok(harness.persistCalls>=1);

  harness.controller.destroy();
});

test('quick RPE styling is touch-friendly and exposes a selected state',()=>{
  const css=fs.readFileSync('src/m26/design/premium-ux.css','utf8');
  const start=css.indexOf('.m26-session-live-v3 .m26-session-coach-rpe-quick{');
  assert.ok(start>=0);
  const block=css.slice(start,start+1800);
  assert.match(block,/min-height:2\.8rem/u);
  assert.match(block,/button\[aria-pressed="true"\]/u);
  assert.doesNotMatch(block,/pointer-events\s*:\s*none|display\s*:\s*none|visibility\s*:\s*hidden/iu);
});
