import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExecution,
  plannedSetDraftValues,
  suggestedSetDraftValues,
  recordSet,
  advanceExecution,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {assertActionAllowed,M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const exercise={id:'exercise-plan',name_es:'Sentadilla',pattern:'squat',cues:[]};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  search(){return [];},
};

function session(overrides={}){
  return {
    id:'session-plan-review',
    clientId:'client-plan-review',
    title:'Fuerza',
    blocks:[{
      id:'block-plan-review',
      type:'exercise',
      exerciseId:exercise.id,
      sets:2,
      reps:'10',
      plannedLoad:'40 kg',
      restSeconds:75,
      targetRpe:7,
      targetRir:3,
      ...overrides,
    }],
  };
}

test('plannedSetDraftValues reuses objective work only and never turns target effort into observed RPE/RIR',()=>{
  const strength=session();
  const execution=createExecution({session:strength,clientId:strength.clientId,executionId:'execution-plan-1'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  assert.deepEqual(plannedSetDraftValues(execution,strength),{
    reps:'10',
    seconds:'',
    load:'40 kg',
    rpe:'',
    rir:'',
  });

  const timed=session({reps:'30 s',plannedLoad:''});
  const timedExecution=createExecution({session:timed,clientId:timed.clientId,executionId:'execution-plan-2'});
  startExecution(timedExecution,{actor:{role:'coach',userId:'coach-1'}});
  assert.deepEqual(plannedSetDraftValues(timedExecution,timed),{
    reps:'',
    seconds:'30',
    load:'',
    rpe:'',
    rir:'',
  });

  const ranged=session({reps:'8-10'});
  const rangedExecution=createExecution({session:ranged,clientId:ranged.clientId,executionId:'execution-plan-3'});
  startExecution(rangedExecution,{actor:{role:'coach',userId:'coach-1'}});
  assert.deepEqual(plannedSetDraftValues(rangedExecution,ranged),{
    reps:'',
    seconds:'',
    load:'40 kg',
    rpe:'',
    rir:'',
  });
});

test('suggestedSetDraftValues selects the safe planned draft on the first set',()=>{
  const s=session();
  const execution=createExecution({session:s,clientId:s.clientId,executionId:'execution-plan-suggested'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  assert.deepEqual(suggestedSetDraftValues(execution,s),{
    source:'planned',
    values:{reps:'10',seconds:'',load:'40 kg',rpe:'',rir:''},
  });
});

test('Coach Live explains automatic safe completion without implying confirmation',()=>{
  const s=session();
  const execution=createExecution({session:s,clientId:s.clientId,executionId:'execution-guided-copy'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  const html=renderGuidedExecution({execution,session:s,catalog,role:'coach'});
  assert.match(html,/IBERFIT completa automáticamente lo seguro/);
  assert.match(html,/registra el RPE real/);
  assert.doesNotMatch(html,/confirmada automáticamente|completada automáticamente/u);
});

test('Coach gets planned-draft shortcut only when no previous set is available',()=>{
  const s=session();
  const execution=createExecution({session:s,clientId:s.clientId,executionId:'execution-plan-ui'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});

  const coach=renderGuidedExecution({execution,session:s,catalog,role:'coach'});
  assert.match(coach,/data-session-planned-set/);
  assert.match(coach,/data-session-action="reuse-planned-set"/);
  assert.match(coach,/Usar objetivo y revisar/);
  assert.match(coach,/Solo completa el borrador/);

  const client=renderGuidedExecution({execution,session:s,catalog,role:'client'});
  assert.doesNotMatch(client,/data-session-planned-set/);
  assert.doesNotMatch(client,/reuse-planned-set/);

  recordSet(execution,s,{reps:9,load:'38 kg',rpe:8,rir:2,actor:{role:'coach',userId:'coach-1'}});
  advanceExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  const later=renderGuidedExecution({execution,session:s,catalog,role:'coach'});
  assert.match(later,/data-session-previous-set/);
  assert.match(later,/reuse-previous-set/);
  assert.doesNotMatch(later,/data-session-planned-set/);
});

test('planned shortcut is Coach-only UI coordination, not a domain mutation command',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['reuse-planned-set'],{
    roles:['coach'],
    domain:'execution',
  });
  assert.equal(assertActionAllowed('reuse-planned-set','coach'),true);
  assert.equal(assertActionAllowed('reuse-planned-set','client'),false);
  assert.equal(assertActionAllowed('reuse-planned-set','admin'),false);
});

test('planned shortcut translations cover supported surface languages',()=>{
  assert.equal(iberfitSurfaceTranslate('Usar objetivo y revisar',{language:'en'}),'Use target and review');
  assert.equal(iberfitSurfaceTranslate('Usar objetivo y revisar',{language:'fr'}),'Utiliser l’objectif et vérifier');
  assert.equal(iberfitSurfaceTranslate('Usar objetivo y revisar',{language:'pt'}),'Usar objetivo e rever');
});

test('guided automatic preparation copy is translated across supported surface languages',()=>{
  const es='IBERFIT completa automáticamente lo seguro. Revisa los datos y registra el RPE real.';
  assert.equal(iberfitSurfaceTranslate(es,{language:'en'}),'IBERFIT automatically fills what is safe. Review the data and record the real RPE.');
  assert.equal(iberfitSurfaceTranslate(es,{language:'fr'}),'IBERFIT remplit automatiquement ce qui est sûr. Vérifiez les données et enregistrez le RPE réel.');
  assert.equal(iberfitSurfaceTranslate(es,{language:'pt'}),'A IBERFIT preenche automaticamente o que é seguro. Reveja os dados e registe o RPE real.');
});

function controllerHarness(role='coach'){
  const listeners=[];
  const s=session();
  const execution=createExecution({session:s,clientId:s.clientId,executionId:'execution-plan-controller'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  let renderCalls=0;
  let persistCalls=0;
  const fields=new Map();
  for(const [name,value] of [
    ['reps',''],
    ['seconds',''],
    ['load',''],
    ['rpe',''],
    ['rir',''],
    ['notes','Mantener nota manual'],
  ]){
    fields.set(name,{
      value,
      focusCalls:0,
      getAttribute(attribute){return attribute==='data-set-field'?name:null;},
      focus(){this.focusCalls+=1;},
    });
  }
  const actionState={status:'idle',message:''};
  const button={
    disabled:false,
    getAttribute(name){return name==='data-session-action'?'reuse-planned-set':null;},
  };
  const root={
    ownerDocument:{activeElement:null},
    addEventListener(type,fn,capture=false){listeners.push({type,fn,capture:Boolean(capture)});},
    removeEventListener(){},
    querySelector(selector){
      const match=selector.match(/^\[data-set-field="([^"]+)"\]$/);
      return match?fields.get(match[1])||null:null;
    },
    querySelectorAll(selector){
      if(selector==='[data-set-field]')return [...fields.values()];
      if(selector==='[data-session-action="set-rpe-quick"]')return [];
      if(selector==='[data-session-live-state]')return [];
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
      session:s,
      catalog,
      actor:{role,userId:`${role}-1`},
      recoveryCoordinator,
      actionState,
    }),
    render:()=>{renderCalls+=1;},
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
    clockTarget:{setInterval(){return 1;},clearInterval(){}},
  });
  controller.mount();
  const click=listeners.find((item)=>item.type==='click'&&!item.capture)?.fn;
  const event={
    target:{closest:(selector)=>selector==='[data-session-action]'?button:null},
    preventDefault(){},
  };
  return {controller,execution,fields,actionState,click,event,get renderCalls(){return renderCalls;},get persistCalls(){return persistCalls;}};
}

test('automatic set preparation is Coach-only and never silently fills Client observations',()=>{
  const harness=controllerHarness('client');
  assert.equal(harness.fields.get('reps').value,'');
  assert.equal(harness.fields.get('seconds').value,'');
  assert.equal(harness.fields.get('load').value,'');
  assert.equal(harness.fields.get('rpe').value,'');
  assert.equal(harness.fields.get('rir').value,'');
  assert.equal(harness.execution.activeSetDraft,undefined);
  harness.controller.destroy();
});

test('Coach receives a safe automatic planned draft and explicit review focuses the human decision',async()=>{
  const harness=controllerHarness();

  assert.equal(harness.fields.get('reps').value,'10');
  assert.equal(harness.fields.get('seconds').value,'');
  assert.equal(harness.fields.get('load').value,'40 kg');
  assert.equal(harness.fields.get('rpe').value,'');
  assert.equal(harness.fields.get('rir').value,'');
  assert.equal(harness.fields.get('notes').value,'Mantener nota manual');
  assert.equal(harness.fields.get('reps').focusCalls,0);
  assert.equal(harness.fields.get('rpe').focusCalls,0);
  assert.equal(harness.execution.activeSetDraft?.values?.load,'40 kg');
  assert.equal(harness.execution.activeSetDraft?.values?.rpe,'');
  assert.equal(harness.execution.activeSetDraft?.values?.rir,'');
  assert.deepEqual(harness.execution.results,{});
  assert.equal(harness.actionState.status,'idle');
  assert.equal(harness.actionState.message,'');

  await harness.click(harness.event);

  assert.equal(harness.renderCalls,0);
  assert.equal(harness.fields.get('reps').focusCalls,0);
  assert.equal(harness.fields.get('rpe').focusCalls,1);
  assert.deepEqual(harness.execution.results,{});
  assert.equal(harness.execution.setIndex,0);
  assert.match(harness.actionState.message,/Revísalo antes de confirmar/);

  await new Promise((resolve)=>setTimeout(resolve,80));
  assert.ok(harness.persistCalls>=1);
  harness.controller.destroy();
});
