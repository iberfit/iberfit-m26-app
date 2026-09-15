import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  advanceExecution,
  createExecution,
  currentStep,
  executionResultForStep,
  previousSetDraftValues,
  recordSet,
  repeatPreviousSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createSessionController,dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';

const exercise={
  id:'exercise-1',
  name_es:'Sentadilla de prueba',
  pattern:'squat',
  cues:[],
};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  search(){return [];},
};

function makeSession(){
  return {
    id:'session-1',
    clientId:'client-1',
    title:'Sesión de prueba',
    durationMinutes:45,
    status:'published',
    blocks:[{
      type:'exercise',
      id:'block-1',
      exerciseId:exercise.id,
      sets:2,
      reps:'10',
      restSeconds:60,
      tempo:'3-1-1',
      targetRpe:7,
      targetRir:3,
    }],
  };
}

function executionOnSecondSet(){
  const session=makeSession();
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-1'});
  startExecution(execution);
  recordSet(execution,session,{
    reps:10,
    load:'80 kg',
    rpe:8,
    rir:2,
    notes:'Nota específica que no debe copiarse',
  });
  advanceExecution(execution);
  return {session,execution};
}

test('previousSetDraftValues exposes reusable metrics without copying notes',()=>{
  const {execution}=executionOnSecondSet();
  assert.deepEqual(previousSetDraftValues(execution),{
    reps:'10',
    seconds:'',
    load:'80 kg',
    rpe:'8',
    rir:'2',
  });
  assert.equal(Object.hasOwn(previousSetDraftValues(execution),'notes'),false);
});

test('previousSetDraftValues is unavailable on the first set',()=>{
  const session=makeSession();
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-first'});
  startExecution(execution);
  assert.equal(previousSetDraftValues(execution),null);
});

test('Session Live offers review reuse to Client and one-tap completion only to Coach',()=>{
  const {session,execution}=executionOnSecondSet();
  const html=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});
  assert.match(html,/data-session-previous-set/);
  assert.match(html,/type="button" data-session-action="reuse-previous-set"/);
  assert.match(html,/aria-label="Usar los datos de la serie anterior y revisarlos antes de confirmar"/);
  assert.doesNotMatch(html,/data-session-action="repeat-previous-set"/);
  assert.match(html,/10 reps/);
  assert.match(html,/80 kg/);
  assert.match(html,/RPE 8/);
  assert.match(html,/RIR 2/);
  assert.doesNotMatch(html,/Nota específica que no debe copiarse/);

  const coachHtml=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'coach'});
  assert.match(coachHtml,/data-session-action="reuse-previous-set"/);
  assert.match(coachHtml,/data-session-action="repeat-previous-set"/);
  assert.match(coachHtml,/data-rest-seconds="60"/);
  assert.match(coachHtml,/Repetir y completar/);
  assert.match(coachHtml,/Acción rápida del Coach · no copia notas/);

  const firstExecution=createExecution({session,clientId:session.clientId,executionId:'execution-first-ui'});
  startExecution(firstExecution);
  const firstHtml=renderGuidedExecution({execution:firstExecution,session,catalog,mediaMap:null,role:'coach'});
  assert.doesNotMatch(firstHtml,/data-session-action="reuse-previous-set"/);
  assert.doesNotMatch(firstHtml,/data-session-action="repeat-previous-set"/);
});

test('Session Live preserves RIR 0 in the reusable previous-set summary',()=>{
  const session=makeSession();
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-rir-zero'});
  startExecution(execution);
  recordSet(execution,session,{
    reps:10,
    load:'80 kg',
    rpe:10,
    rir:0,
  });
  advanceExecution(execution);

  assert.equal(previousSetDraftValues(execution)?.rir,'0');
  const html=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});
  assert.match(html,/data-session-previous-set/);
  assert.match(html,/RIR 0/);
});

test('Coach one-tap repeat copy is translated across supported surface languages',()=>{
  const cases=[
    ['Repetir y completar','Repeat and complete','Répéter et terminer','Repetir e concluir'],
    ['Usar y revisar','Use and review','Utiliser et vérifier','Usar e rever'],
    ['Acción rápida del Coach · no copia notas.','Coach quick action · notes are not copied.','Action rapide du Coach · les notes ne sont pas copiées.','Ação rápida do Coach · as notas não são copiadas.'],
    ['Repetir los datos de la serie anterior y completar esta serie','Repeat previous set data and complete this set','Répéter les données de la série précédente et terminer cette série','Repetir os dados da série anterior e concluir esta série'],
  ];
  for(const [es,en,fr,pt] of cases){
    assert.equal(iberfitSurfaceTranslate(es,{language:'en'}),en);
    assert.equal(iberfitSurfaceTranslate(es,{language:'fr'}),fr);
    assert.equal(iberfitSurfaceTranslate(es,{language:'pt'}),pt);
  }
});

test('previous-set actions keep review reuse shared but one-tap completion Coach-only',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['reuse-previous-set'],{
    roles:['coach','client'],
    domain:'execution',
  });
  assert.deepEqual(M26_ACTION_REGISTRY['repeat-previous-set'],{
    roles:['coach'],
    domain:'execution',
  });
  assert.equal(assertActionAllowed('reuse-previous-set','client'),true);
  assert.equal(assertActionAllowed('reuse-previous-set','coach'),true);
  assert.equal(assertActionAllowed('repeat-previous-set','client'),false);
  assert.equal(assertActionAllowed('repeat-previous-set','coach'),true);
  assert.equal(assertActionAllowed('repeat-previous-set','admin'),false);
});

test('repeatPreviousSet is Coach-only, copies metrics without notes and starts planned rest',()=>{
  const {session,execution}=executionOnSecondSet();
  const beforeEvents=execution.events.length;
  repeatPreviousSet(execution,session,{
    restSeconds:60,
    actor:{role:'coach',userId:'coach-1'},
  });
  const step=currentStep(execution,session);
  const result=executionResultForStep(execution,step);
  assert.equal(result.reps,10);
  assert.equal(result.load,'80 kg');
  assert.equal(result.rpe,8);
  assert.equal(result.rir,2);
  assert.equal(result.notes,'');
  assert.ok(new Date(execution.restUntil).getTime()>Date.now());
  assert.equal(execution.events.length,beforeEvents+3);
  assert.equal(execution.events.at(-1)?.type,'SET_REPEATED_FROM_PREVIOUS');
  assert.deepEqual(execution.events.at(-1)?.payload,{
    sourceSetNumber:1,
    targetSetNumber:2,
    restSeconds:60,
  });
  assert.equal(execution.events.at(-1)?.actor?.role,'coach');
});

test('repeatPreviousSet rejects Client actor without mutating current set',()=>{
  const {session,execution}=executionOnSecondSet();
  const step=currentStep(execution,session);
  assert.equal(executionResultForStep(execution,step),null);
  assert.throws(
    ()=>repeatPreviousSet(execution,session,{restSeconds:60,actor:{role:'client',userId:'client-1'}}),
    /M26_EXECUTION_COACH_ACTION_REQUIRED/,
  );
  assert.equal(executionResultForStep(execution,step),null);
  assert.equal(execution.restUntil,null);
});

test('controller dispatches Coach one-tap repeat through the normal execution progress path',()=>{
  const {session,execution}=executionOnSecondSet();
  const outcome=dispatchSessionAction({
    action:'repeat-previous-set',
    execution,
    session,
    catalog,
    payload:{restSeconds:60},
    actor:{role:'coach',userId:'coach-1'},
    commandBus:null,
  });
  assert.equal(outcome.kind,'execution');
  const step=currentStep(execution,session);
  assert.equal(executionResultForStep(execution,step)?.load,'80 kg');
  assert.equal(execution.events.at(-1)?.type,'SET_REPEATED_FROM_PREVIOUS');
});

test('controller copies locally, preserves current notes, persists the active draft and never dispatches reuse as a command',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/workflows/session-controller.js',import.meta.url),
    'utf8',
  );
  const start=source.indexOf("if(action==='reuse-previous-set')");
  const end=source.indexOf("if(action==='exit-session')",start);
  assert.ok(start>=0&&end>start);
  const branch=source.slice(start,end);
  assert.match(branch,/previousSetDraftValues/);
  assert.match(branch,/field==='notes'/);
  assert.match(branch,/updateActiveSetDraft/);
  assert.match(branch,/queueExecutionDraftPersist/);
  assert.match(branch,/Revísalos antes de confirmar/);
  assert.doesNotMatch(branch,/dispatchSessionAction/);
  assert.doesNotMatch(source,/case 'reuse-previous-set'/);
});

function reuseControllerHarness(role='coach'){
  const listeners=[];
  const {session,execution}=executionOnSecondSet();
  let renderCalls=0;
  let persistCalls=0;
  const fields=new Map();
  for(const [name,value] of [
    ['reps',''],
    ['seconds',''],
    ['load',''],
    ['rpe',''],
    ['rir',''],
    ['notes','Mantener esta nota'],
  ]){
    fields.set(name,{
      value,
      focusCalls:[],
      getAttribute(attribute){
        return attribute==='data-set-field'?name:null;
      },
      focus(options){
        this.focusCalls.push(options||null);
      },
    });
  }
  const actionState={status:'idle',message:''};
  const reuseButton={
    disabled:false,
    getAttribute(name){
      return name==='data-session-action'?'reuse-previous-set':null;
    },
  };
  const root={
    ownerDocument:{activeElement:null},
    addEventListener(type,fn,capture=false){
      listeners.push({type,fn,capture:Boolean(capture)});
    },
    removeEventListener(){},
    querySelector(selector){
      const match=selector.match(/^\[data-set-field="([^"]+)"\]$/);
      if(match)return fields.get(match[1])||null;
      return null;
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
      session,
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
  assert.equal(typeof click,'function');
  const event={
    target:{
      closest(selector){
        return selector==='[data-session-action]'?reuseButton:null;
      },
    },
    preventDefault(){},
  };
  return {
    controller,
    execution,
    fields,
    actionState,
    click,
    event,
    get renderCalls(){return renderCalls;},
    get persistCalls(){return persistCalls;},
  };
}

test('Coach reutiliza la serie anterior sin rerender y entra directamente a revisar el primer dato',async()=>{
  const harness=reuseControllerHarness('coach');
  await harness.click(harness.event);

  assert.equal(harness.fields.get('reps').value,'10');
  assert.equal(harness.fields.get('seconds').value,'');
  assert.equal(harness.fields.get('load').value,'80 kg');
  assert.equal(harness.fields.get('rpe').value,'8');
  assert.equal(harness.fields.get('rir').value,'2');
  assert.equal(harness.fields.get('notes').value,'Mantener esta nota');
  assert.equal(harness.renderCalls,0);
  assert.deepEqual(harness.fields.get('reps').focusCalls,[null]);
  assert.equal(harness.fields.get('load').focusCalls.length,0);
  assert.equal(harness.actionState.status,'success');
  assert.match(harness.actionState.message,/Revísalos antes de confirmar/);
  assert.equal(harness.execution.activeSetDraft?.values?.load,'80 kg');

  await new Promise((resolve)=>setTimeout(resolve,80));
  assert.ok(harness.persistCalls>=1);
  harness.controller.destroy();
});

test('Cliente conserva el flujo compartido de reutilización con rerender existente',async()=>{
  const harness=reuseControllerHarness('client');
  await harness.click(harness.event);

  assert.equal(harness.fields.get('reps').value,'10');
  assert.equal(harness.fields.get('load').value,'80 kg');
  assert.equal(harness.renderCalls,1);
  assert.equal(harness.fields.get('reps').focusCalls.length,0);
  assert.equal(harness.actionState.status,'success');

  harness.controller.destroy();
});
