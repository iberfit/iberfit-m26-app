import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COACH_PRODUCTIVITY_SCHEMA_VERSION,
  COACH_PRODUCTIVITY_MAX_TASK_SAMPLES,
  COACH_PRODUCTIVITY_TASKS,
  buildCoachCommandEntries,
  rankCoachCommandEntries,
  createCoachProductivityController,
  __coachProductivityInternals,
} from '../src/m26/productivity/coach-productivity.js';
import {resolveCoachActionNavigation} from '../src/m26/shell/shell-controller.js';
import {createProductionState} from '../src/m26/production-state.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';

function coachState(){
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:'2026-09-13T20:00:00Z',serverTime:'2026-09-13T20:00:00Z'},
    identity:{id:'coach-time-1',role:'coach',name:'Coach Time QA'},
    environment:'QA',
    canary:{active:true,scope:'allowlist',version:'TIME-TO-ACTION-V1'},
    selectedClientId:null,
    activeArea:'hoy',
    collections:{
      ...createProductionState().collections,
      clients:[{id:clientId,name:'Ana Demo',modality:'presencial',profile:{primaryObjective:'fuerza'}}],
    },
  });
}

function memoryStorage(seed=null){
  const data=new Map();
  if(seed)data.set('seed',JSON.stringify(seed));
  return {
    data,
    getItem(key){return data.get(key)??null;},
    setItem(key,value){data.set(key,String(value));},
    removeItem(key){data.delete(key);},
  };
}

test('Coach recibe tres acciones compuestas por cliente; Admin conserva catálogo sin atajos Coach',()=>{
  const base={
    areas:[{area:'hoy',label:'Hoy'},{area:'clientes',label:'Clientes'}],
    clients:[{id:clientId,name:'Ana Demo',modality:'presencial',profile:{primaryObjective:'fuerza'}}],
    selectedClientId:null,
  };
  const coach=buildCoachCommandEntries({...base,role:'coach'});
  const admin=buildCoachCommandEntries({...base,role:'admin'});
  const legacy=buildCoachCommandEntries(base);

  const tasks=coach.filter((item)=>item.type==='coach-action');
  assert.equal(tasks.length,3);
  assert.deepEqual(tasks.map((item)=>item.taskKey).sort(),Object.keys(COACH_PRODUCTIVITY_TASKS).sort());
  assert.deepEqual(tasks.map((item)=>item.area).sort(),['agenda','planificacion','sesion']);
  assert.equal(rankCoachCommandEntries(coach,'preparar ana')[0]?.taskKey,'prepare-session');
  assert.equal(admin.some((item)=>item.type==='coach-action'),false);
  assert.equal(legacy.some((item)=>item.type==='coach-action'),false);
});

test('acción compuesta reutiliza navegación segura cliente + área en una sola decisión',()=>{
  const state=coachState();
  const prepare=resolveCoachActionNavigation(state,{clientId,targetArea:'sesion'});
  const agenda=resolveCoachActionNavigation(state,{clientId,targetArea:'agenda'});
  const plan=resolveCoachActionNavigation(state,{clientId,targetArea:'planificacion'});

  assert.deepEqual(prepare,{clientId,area:'sesion'});
  assert.deepEqual(agenda,{clientId,area:'agenda'});
  assert.deepEqual(plan,{clientId,area:'planificacion'});

  const admin={...state,identity:{...state.identity,role:'admin'}};
  assert.throws(
    ()=>resolveCoachActionNavigation(admin,{clientId,targetArea:'sesion'}),
    /M26_COACH_ACTION_FORBIDDEN/u,
  );
});

test('markup de atajo usa contrato Coach existente y no inventa navegación paralela',()=>{
  const [entry]=buildCoachCommandEntries({
    role:'coach',
    clients:[{id:clientId,name:'Ana Demo'}],
  }).filter((item)=>item.taskKey==='prepare-session');
  const html=__coachProductivityInternals.renderCommandResult(entry);
  assert.match(html,/data-m26-coach-action="true"/u);
  assert.match(html,new RegExp(`data-m26-client-id="${clientId}"`,'u'));
  assert.match(html,/data-m26-target-area="sesion"/u);
  assert.match(html,/data-coach-task-key="prepare-session"/u);
  assert.doesNotMatch(html,/onclick=|location\.|window\.location/iu);
});

test('métricas locales guardan solo milisegundos por tipo y limitan la historia a 30',()=>{
  const storage=memoryStorage();
  const insight={textContent:''};
  const root={
    addEventListener(){},
    querySelector(selector){return selector==='[data-coach-command-insights]'?insight:null;},
  };
  const store={getState:()=>({identity:{role:'coach'},collections:{clients:[]}})};
  const controller=createCoachProductivityController({root,store,ownerId:'coach-time-1',storage});

  for(let index=0;index<35;index+=1){
    assert.equal(controller.recordTaskSample('prepare-session',1000+index*10),true);
  }
  controller.recordTaskSample('client-agenda',2500);

  const raw=[...storage.data.values()].map((value)=>JSON.parse(value))[0];
  assert.equal(raw.schemaVersion,COACH_PRODUCTIVITY_SCHEMA_VERSION);
  assert.equal(raw.taskMetrics['prepare-session'].length,COACH_PRODUCTIVITY_MAX_TASK_SAMPLES);
  assert.equal(raw.taskMetrics['client-agenda'][0],2500);
  assert.deepEqual(Object.keys(raw.taskMetrics).sort(),Object.keys(COACH_PRODUCTIVITY_TASKS).sort());
  assert.equal(JSON.stringify(raw).includes('Ana Demo'),false);
  assert.equal(JSON.stringify(raw).includes('pain'),false);
  assert.equal(JSON.stringify(raw).includes('health'),false);
  assert.match(insight.innerHTML,/Mediana en este dispositivo/u);
});

test('mediana y migración de workspace anterior son deterministas',()=>{
  assert.equal(__coachProductivityInternals.median([900,100,500]),500);
  assert.equal(__coachProductivityInternals.median([100,300]),200);
  assert.equal(__coachProductivityInternals.median([]),null);

  const storage={
    value:JSON.stringify({
      schemaVersion:'iberfit.coach-productivity.v1',
      savedViews:[],
      recents:['client-a'],
    }),
    getItem(){return this.value;},
    setItem(_key,value){this.value=value;},
  };
  const workspace=__coachProductivityInternals.readWorkspace(storage,'legacy');
  assert.equal(workspace.schemaVersion,COACH_PRODUCTIVITY_SCHEMA_VERSION);
  assert.deepEqual(workspace.recents,['client-a']);
  assert.deepEqual(workspace.taskMetrics,{
    'prepare-session':[],
    'client-agenda':[],
    'client-plan':[],
  });
});

test('paleta Coach expone insight local y mantiene Ctrl/Cmd+K, foco y superficie móvil',()=>{
  const shell=fs.readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
  const productivity=fs.readFileSync(new URL('../src/m26/productivity/coach-productivity.js',import.meta.url),'utf8');
  const native=fs.readFileSync(new URL('../src/m26/ui/native-workspace.js',import.meta.url),'utf8');

  assert.match(shell,/data-coach-command-insights/u);
  assert.match(shell,/vm\.identity\?\.role\|\|''\)==='coach'/u);
  assert.match(productivity,/key==='k'&&\(event\.ctrlKey\|\|event\.metaKey\)/u);
  assert.match(productivity,/paletteOpenedAt=Number\(now\(\)\)/u);
  assert.match(productivity,/recordTaskSample\(taskKey,Math\.max\(0,Number\(now\(\)\)-paletteOpenedAt\)\)/u);
  assert.match(native,/\.m26-coach-command-insights/u);
  assert.match(native,/@media\(max-width:620px\).*\.m26-coach-command-insights/su);
});

test('la medición permanece local y no crea una segunda telemetría ni toca backend',()=>{
  const source=fs.readFileSync(new URL('../src/m26/productivity/coach-productivity.js',import.meta.url),'utf8');
  assert.match(source,/globalThis\.localStorage/u);
  assert.doesNotMatch(source,/supabase|commandBus|transport\.execute|fetch\(|sendBeacon|telemetryRemote/iu);
  assert.match(source,/taskMetrics/u);
  assert.match(source,/elapsedMs/u);
});


test('Coach Today ejecuta cliente + destino en un solo gesto usando el guard existente',()=>{
  const html=renderHoyRoute({
    role:'coach',
    appointments:[],
    proposals:[],
    upcoming:[],
    clients:[{
      id:clientId,
      name:'Ana Demo',
      nextAction:{label:'Crear planificación',area:'planificacion',reason:'IRI confirmado'},
    }],
    coachCockpit:{
      attentionCount:1,
      riskFocus:null,
      items:[{
        kind:'process',
        clientId,
        clientName:'Ana Demo',
        reason:'IRI confirmado',
        actionCtaLabel:'Crear planificación',
        nextAction:{label:'Crear planificación',area:'planificacion'},
      }],
    },
    operations:{pending:0,conflicts:0,rejected:0},
  });

  assert.match(html,/data-m26-coach-action="true"/u);
  assert.match(html,new RegExp(`data-m26-select-client="${clientId}"`,'u'));
  assert.match(html,new RegExp(`data-m26-client-id="${clientId}"`,'u'));
  assert.match(html,/data-m26-target-area="planificacion"/u);
  assert.match(html,/>Crear planificación<\/button>/u);
});
