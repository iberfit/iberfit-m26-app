import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder,renderSessionExerciseResults,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createExecution,startExecution,pauseExecution} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {__applicationInternals} from '../src/m26/app/application.js';

const makeSession=(id,status,extra={})=>({
  id,clientId:'client-1',title:`Sesión ${id}`,status,
  visibleToClient:true,
  deliveryOwnership:'client_autonomous',
  deliveryModality:'guiada_en_app',
  blocks:[{id:'b1',type:'exercise',exerciseId:'press',sets:3,reps:'8',restSeconds:60}],
  ...extra,
});
const sessions=[
  makeSession('vigente','published'),
  makeSession('retirada','withdrawn'),
  makeSession('borrador','draft'),
  makeSession('sin-visibilidad','published',{visibleToClient:false}),
  makeSession('oculta','published',{clientVisibilityLevel:'hidden'}),
  makeSession('dirigida','published',{deliveryOwnership:'coach_led',deliveryModality:'presencial'}),
  makeSession('contradictoria','withdrawn',{body:{id:'contradictoria',status:'published'}}),
];

test('Cliente solo recibe sesiones publicadas y visibles y no puede iniciar sesiones dirigidas',()=>{
  const state={
    identity:{role:'client',clientId:'client-1'},
    selectedClientId:'client-1',
    collections:{sessions,appointments:[],sessionExecutions:[]},
    environment:{},
  };
  const shell={activeArea:'sesion',identity:{role:'client'},page:{title:'Sesiones'}};
  const vm=createRouteViewModel(shell,state,new Date('2026-10-15T18:00:00Z'));
  const ids=vm.sessions.map((s)=>s.id);
  assert.deepEqual(ids,['vigente','dirigida']);
  assert.equal(vm.sessions[0].canClientExecute,true);
  assert.equal(vm.sessions[1].canClientExecute,false);
  const html=renderSessionsRoute(vm);
  assert.match(html,/Sesión vigente/);
  assert.match(html,/Sesión dirigida/);
  assert.doesNotMatch(html,/Sesión retirada|Sesión borrador|Sesión sin-visibilidad|Sesión contradictoria/);
  assert.match(html,/Tu entrenador dirigirá la sesión/);
  assert.equal((html.match(/data-entity-id="vigente"/g)||[]).length,1);
  assert.doesNotMatch(html,/data-entity-id="dirigida"/);
});

test('Top-level de Supabase manda sobre un body obsoleto; visibilidad falsa revoca',()=>{
  const {normalizePublishedSession,publishedSessionForClient}=__applicationInternals;
  assert.equal(normalizePublishedSession(makeSession('e','withdrawn',{body:{id:'e',status:'published',blocks:[{id:'x'}]}})).status,'withdrawn');
  assert.deepEqual(publishedSessionForClient([makeSession('a','published',{visibleToClient:false}),makeSession('b','withdrawn',{body:{status:'published'}})],'client-1'),null);
});

const exerciseRecords=Array.from({length:45},(_,index)=>({
  id:`ex-${index}`,name_es:index%3===0?`Press de pecho ${index}`:index%3===1?`Prensa de piernas ${index}`:`Sentadilla controlada ${index}`,
  pattern:'fuerza',equipment:'mancuernas',tags:[],aliases:[],
}));
const catalog=createExerciseCatalog(exerciseRecords);
test('Buscador incremental P → PR filtra y prioriza coincidencias de nombre sin recortar a 24',()=>{
  const empty=renderSessionExerciseResults({catalog,query:'',limit:36});
  assert.match(empty,/45 ejercicios encontrados/);
  assert.match(empty,/Ver más ejercicios \(9 restantes\)/);
  const p=renderSessionExerciseResults({catalog,query:'P',limit:36});
  const pr=renderSessionExerciseResults({catalog,query:'PR',limit:36});
  assert.match(pr,/30 ejercicios encontrados/);
  assert.match(pr,/Empuje de pecho/);
  assert.match(pr,/Prensa de piernas/);
  assert.doesNotMatch(pr,/Sentadilla controlada/);
  assert.match(pr,/data-session-action="add-exercise"/);
  assert.match(p,/30 ejercicios encontrados/);
  const all=renderSessionExerciseResults({catalog,query:'PR',limit:72});
  assert.doesNotMatch(all,/Ver más ejercicios/);
  assert.equal((all.match(/data-session-action="add-exercise"/g)||[]).length,30);
  const spaced=renderSessionExerciseResults({catalog,query:'pr',limit:36});
  assert.match(spaced,/30 ejercicios encontrados/);
});

test('Constructor permite descartar con confirmación integrada y conserva búsqueda accesible',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'ex-0',catalog);
  const html=renderSessionBuilder({draft,catalog,query:''});
  assert.match(html,/data-session-action="discard-draft"/);
  assert.match(html,/Eliminará este borrador/);
  assert.match(html,/data-session-search-results/);
  assert.match(html,/data-session-action="show-more-results"/);
});

test('Entrenamiento guiado permite guardar y salir sin bloquear todo con un modal',()=>{
  const draft=createSessionDraft({clientId:'client-1'});
  addCatalogExercise(draft,'ex-0',catalog);
  const execution=createExecution({session:draft,clientId:'client-1'});
  startExecution(execution);
  assert.match(renderGuidedExecution({execution,session:draft,catalog}),/Guardar y salir/);
  pauseExecution(execution);
  assert.match(renderGuidedExecution({execution,session:draft,catalog}),/Guardar y salir/);
});

test('Al escribir letras sucesivas no se desmonta el input de búsqueda del Coach',()=>{
  const listeners=new Map();
  const results={innerHTML:''};
  const search={
    value:'',
    closest(selector){return selector==='[data-session-search]'?this:null;},
  };
  const root={
    addEventListener(type,fn){listeners.set(type,fn);},
    removeEventListener(type){listeners.delete(type);},
    querySelector(selector){return selector==='[data-session-search-results]'?results:null;},
  };
  let query='',searchLimit=36,fullRenders=0;
  const draft=createSessionDraft({clientId:'client-1'});
  const ctrl=createSessionController({
    root,
    liveTelemetryController:{stop:async()=>{}},
    getContext:()=>({
      draft,catalog,query,searchLimit,role:'coach',
      setQuery(next){query=next;},
      setSearchLimit(next){searchLimit=next;},
    }),
    render:()=>{fullRenders++;},
  });
  ctrl.mount();
  for(const value of ['P','PR','PRE']){
    search.value=value;
    listeners.get('input')({target:search});
    assert.match(results.innerHTML,/ejercicios encontrados/);
    assert.equal(query,value);
    assert.equal(fullRenders,0,'El shell no se re-renderiza con cada letra');
    assert.ok(listeners.has('input'),'El evento sigue escuchando el input original');
  }
  assert.match(results.innerHTML,/Prensa de piernas/);
  ctrl.destroy();
});
