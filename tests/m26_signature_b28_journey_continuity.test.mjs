import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveJourneyContinuity,renderJourneyContinuity} from '../src/m26/experience/journey-continuity.js';

const id='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const nav=(keys)=>({primary:keys.map(key=>({key})),context:[],tools:[]});
const make=(role,activeArea,keys,{selected=true,language='es',mode='authenticated'}={})=>({
  mode,activeArea,identity:{role},language,navigation:nav(keys),
  selectedClient:selected?{id,name:'Lucía del Valle'}:null,
});

test('Cliente: plan lleva a entrenamiento, pero no atribuye sesiones completadas',()=>{
  const vm=make('client','planificacion',['hoy','planificacion','sesion','progreso']);
  const model=deriveJourneyContinuity(vm);
  assert.equal(model.next.area,'sesion');
  assert.deepEqual(model.steps.map(s=>s.active),[false,true,false,false]);
  const html=renderJourneyContinuity(vm);
  assert.match(html,/data-m26-area="sesion"/);
  assert.match(html,/aria-current="step"/);
  assert.doesNotMatch(html,/✓|data-m26-action="start"/i);
});

test('Cliente: no invade el reproductor inmersivo ni Inicio ya guiado',()=>{
  const keys=['hoy','planificacion','sesion','progreso'];
  assert.equal(renderJourneyContinuity(make('client','hoy',keys)),'');
  assert.equal(renderJourneyContinuity(make('client','sesion',keys)),'');
});

test('Coach: espacio de persona conserva contexto y acceso al ciclo IRI → plan → revisión',()=>{
  const keys=['hoy','clientes','expediente','iri','planificacion','sesion','progreso','notas'];
  const model=deriveJourneyContinuity(make('coach','iri',keys));
  assert.deepEqual(model.steps.map(s=>s.area),['expediente','iri','planificacion','sesion','progreso']);
  assert.equal(model.next.area,'planificacion');
  assert.equal(model.person,'Lucía del Valle');
  assert.equal(renderJourneyContinuity(make('coach','sesion',keys)),'');
});

test('No muestra flujos de persona sin expediente ni contexto confirmado',()=>{
  const keys=['clientes','expediente','iri','planificacion','sesion','progreso'];
  assert.equal(deriveJourneyContinuity(make('coach','expediente',keys,{selected:false})),null);
  assert.equal(deriveJourneyContinuity(make('client','planificacion',keys,{selected:false})),null);
  assert.equal(deriveJourneyContinuity(make('coach','expediente',keys,{mode:'access'})),null);
});

test('Filtra rutas no visibles por permiso o tipo de servicio, sin enlaces de acceso indebido',()=>{
  const model=deriveJourneyContinuity(make('coach','iri',['hoy','clientes','expediente','iri','informes']));
  assert.deepEqual(model.steps.map(s=>s.area),['expediente','iri']);
  assert.equal(model.next,null);
  const html=renderJourneyContinuity(make('coach','iri',['hoy','clientes','expediente','iri','informes']));
  assert.doesNotMatch(html,/data-m26-area="planificacion"|data-m26-area="sesion"/);
});

test('Admin distingue navegación operativa de expediente sin sugerir un cierre ficticio',()=>{
  const ops=deriveJourneyContinuity(make('admin','admin-operaciones',['admin-clientes','admin-operaciones','admin-auditoria']));
  assert.equal(ops.kind,'sections');
  assert.equal(ops.next,null);
  const person=deriveJourneyContinuity(make('admin','admin-iri',['admin-expediente','admin-iri','admin-informes','admin-notas']));
  assert.equal(person.kind,'sections');
  assert.equal(person.person,'Lucía del Valle');
  assert.equal(person.next,null);
  assert.equal(deriveJourneyContinuity(make('admin','admin-iri',['admin-expediente','admin-iri'],{selected:false})),null);
});

test('Escapa nombre de usuario y mantiene todos los textos localizados',()=>{
  for(const language of ['es','en','fr','pt']){
    const vm=make('coach','expediente',['expediente','iri','planificacion'],{language});
    vm.selectedClient.name='A <img src=x onerror=alert(1)> & B';
    const html=renderJourneyContinuity(vm);
    assert.doesNotMatch(html,/<img/);
    assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt; &amp; B/);
    assert.match(html,/data-m26-area="iri"/);
  }
});

test('No muestra pasos de otros roles aunque el modelo llegue alterado',()=>{
  const html=renderJourneyContinuity(make('client','planificacion',['hoy','planificacion','sesion','progreso','admin-auditoria','iri']));
  assert.doesNotMatch(html,/data-m26-area="admin-auditoria"|data-m26-area="iri"/);
});


test('Ayuda en plan cliente es contextual, plegable y permite abrir la guía existente',()=>{
  const html=renderJourneyContinuity(make('client','planificacion',['hoy','planificacion','sesion','progreso']));
  assert.match(html,/<details class="m26-journey-help"><summary>¿Qué hago aquí\?<\/summary>/);
  assert.match(html,/data-m26-client-context-guide-open/);
  assert.match(html,/Tu Coach organiza|ha preparado tu Coach/);
  assert.doesNotMatch(html,/data-m26-guided-tour-open/);
});

test('El guía profesional reutiliza el tour existente sin duplicar controles de negocio',()=>{
  const html=renderJourneyContinuity(make('coach','iri',['expediente','iri','planificacion','sesion','progreso']));
  assert.match(html,/data-m26-guided-tour-open/);
  assert.match(html,/Diagnóstico IRI/);
  assert.doesNotMatch(html,/<script|onclick\s*=|data-workflow-action|data-m26-action="/i);
});

test('Ayuda diferencia diagnóstico inicial IRI de seguimiento longitudinal',()=>{
  const coach=renderJourneyContinuity(make('coach','iri',['expediente','iri','planificacion','sesion','progreso']));
  const client=renderJourneyContinuity(make('client','progreso',['hoy','planificacion','sesion','progreso']));
  assert.match(coach,/diagnóstico de partida/);
  assert.match(client,/punto de partida/);
  assert.match(client,/no una medición de progreso/);
});

test('No enseña ayuda a quien no tiene expediente o ruta visible',()=>{
  const html=renderJourneyContinuity(make('admin','admin-iri',['admin-clientes','admin-iri'],{selected:false}));
  assert.equal(html,'');
  assert.equal(renderJourneyContinuity(make('admin','admin-agenda',['admin-agenda','admin-usuarios'])),'');
});

test('Ayuda de Admin mantiene áreas operativas y expedientes en bloques distintos',()=>{
  const ops=renderJourneyContinuity(make('admin','admin-operaciones',['admin-clientes','admin-operaciones','admin-auditoria']));
  assert.match(ops,/Prioriza incidencias/);
  assert.doesNotMatch(ops,/Diagnóstico IRI/);
  const person=renderJourneyContinuity(make('admin','admin-iri',['admin-iri','admin-expediente','admin-informes']));
  assert.match(person,/trazabilidad del diagnóstico inicial/);
  assert.doesNotMatch(person,/data-m26-area="admin-operaciones"/);
});

test('Navegación opcional se mantiene semánticamente accesible',()=>{
  const html=renderJourneyContinuity(make('coach','progreso',['expediente','iri','planificacion','sesion','progreso']));
  assert.match(html,/<nav class="m26-journey-steps" aria-label="Espacio de la persona">/);
  assert.match(html,/<summary>¿Qué hago aquí\?<\/summary>/);
  assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
  assert.match(html,/id="m26-journey-explanation" class="m26-journey-note"/);
});

test('Ayuda localizada en español, inglés, francés y portugués sin fugas de contenido',()=>{
  const expected={es:'¿Qué hago aquí?',en:'What can I do here?',fr:'Que faire ici ?',pt:'O que faço aqui?'};
  for(const [language,copy] of Object.entries(expected)){
    const html=renderJourneyContinuity(make('client','progreso',['hoy','planificacion','sesion','progreso'],{language}));
    assert.ok(html.includes(copy),language);
    assert.match(html,/data-m26-client-context-guide-open/);
  }
});

import {projectSafeWorkAction,deriveRoleWorkContinuation} from '../src/m26/experience/journey-continuity.js';

function workFixture(role,activeArea,keys,{hydration='ready'}={}){
 const vm=make(role,activeArea,keys);
 vm.identity.clientId=role==='client'?id:null;
 const state={hydration:{status:hydration},identity:{role,clientId:role==='client'?id:null},
  selectedClientId:role==='coach'?id:null,
  collections:{clients:[{id,name:'Lucía del Valle',status:'active'}]},
  pendingOperations:[],conflicts:[],rejectedOperations:[]};
 return {vm,state};
}
test('B29: la siguiente acción exige identidad y cliente coincidentes',()=>{
 const {vm,state}=workFixture('client','progreso',['hoy','planificacion','sesion','progreso']);
 const action={key:'open_autonomous_workout',area:'sesion'};
 assert.equal(projectSafeWorkAction({vm,state,action,experience:{trainingServiceStatus:'active'}})?.area,'sesion');
 vm.selectedClient.id='other';
 assert.equal(projectSafeWorkAction({vm,state,action,experience:{trainingServiceStatus:'active'}}),null);
});
test('B29: jamás propone entrenamiento cuando el servicio está pausado',()=>{
 const {vm,state}=workFixture('client','progreso',['hoy','sesion','progreso']);
 assert.equal(projectSafeWorkAction({vm,state,action:{key:'open_autonomous_workout',area:'sesion'},experience:{trainingServiceStatus:'paused'}}),null);
});
test('B29: protege destinos ocultos y áreas de otros roles',()=>{
 const {vm,state}=workFixture('client','progreso',['hoy','planificacion','progreso']);
 assert.equal(projectSafeWorkAction({vm,state,action:{key:'review_iri',area:'iri'}}),null);
 assert.equal(projectSafeWorkAction({vm,state,action:{key:'open_autonomous_workout',area:'sesion'},experience:{trainingServiceStatus:'active'}}),null);
});
test('B29: sin hidratación real no hay recomendación de trabajo',()=>{
 const {vm,state}=workFixture('coach','expediente',['expediente','planificacion'],{hydration:'loading'});
 assert.equal(projectSafeWorkAction({vm,state,action:{key:'prepare_plan',area:'planificacion'}}),null);
});
test('B29: no hace navegar a la misma pantalla abierta',()=>{
 const {vm,state}=workFixture('coach','planificacion',['expediente','planificacion','sesion']);
 assert.equal(projectSafeWorkAction({vm,state,action:{key:'prepare_plan',area:'planificacion'}}),null);
});
test('B29: fuera del bootstrap no se muestran acciones de cliente',()=>{
 const {vm,state}=workFixture('coach','expediente',['expediente','planificacion']);
 state.collections.clients=[];
 assert.equal(projectSafeWorkAction({vm,state,action:{key:'prepare_plan',area:'planificacion'}}),null);
});
test('B29: los conflictos priorizan revisión de sincronización, nunca guardado ficticio',()=>{
 const {vm,state}=workFixture('coach','expediente',['clientes','expediente','iri','verificacion']);
 state.conflicts=[{operationId:'conflict-1'}];
 const result=deriveRoleWorkContinuation(vm,state);
 assert.equal(result?.area,'verificacion');
 assert.equal(result?.source,'operations');
});
test('B29: continuación profesional localizada en cuatro idiomas',()=>{
 for(const [language,label] of [['es','Preparar planificación'],['en','Prepare the plan'],['fr','Préparer le programme'],['pt','Preparar o plano']]){
  const {vm,state}=workFixture('coach','expediente',['expediente','planificacion']);
  vm.language=language;
  assert.equal(projectSafeWorkAction({vm,state,action:{key:'prepare_plan',area:'planificacion'}})?.label,label);
 }
});
test('B29: Cliente conserva su acción nativa, sin duplicar el CTA sobre la navegación',()=>{
 const vm=make('client','planificacion',['hoy','planificacion','sesion','progreso']);
 const ordinary=renderJourneyContinuity(vm);
 assert.match(ordinary,/m26-journey-steps/);
 assert.doesNotMatch(ordinary,/class="m26-journey-next/);
 vm.workContinuation={area:'progreso',source:'health-summary',heading:'Según tu situación actual',label:'Revisar evolución'};
 const html=renderJourneyContinuity(vm);
 assert.match(html,/data-m26-area="progreso"/);
 assert.doesNotMatch(html,/data-m26-work-continuation/);
 assert.equal((html.match(/class="m26-journey-next/g)||[]).length,0);
});

test('B29: Admin ve resolución prioritaria únicamente ante incidencias reales',()=>{
 const vm=make('admin','admin-clientes',['admin-clientes','admin-operaciones','admin-auditoria'],{selected:false});
 const state={hydration:{status:'ready'},identity:{role:'admin'},collections:{clients:[]},conflicts:[],rejectedOperations:[]};
 assert.equal(deriveRoleWorkContinuation(vm,state),null);
 state.rejectedOperations=[{operationId:'rejected-1'}];
 const action=deriveRoleWorkContinuation(vm,state);
 assert.equal(action?.area,'admin-operaciones');
 assert.equal(action?.source,'operations');
 assert.match(action?.label||'',/incidencias operativas/);
 const html=renderJourneyContinuity({...vm,workContinuation:action});
 assert.match(html,/data-m26-work-continuation="operations"/);
 assert.equal((html.match(/class="m26-journey-next/g)||[]).length,1);
});
test('B29: Admin no accede a tareas ajenas ni sin autorización visible',()=>{
 const vm=make('admin','admin-clientes',['admin-clientes','admin-auditoria'],{selected:false});
 const state={hydration:{status:'ready'},identity:{role:'admin'},collections:{clients:[]},conflicts:[{}],rejectedOperations:[]};
 assert.equal(deriveRoleWorkContinuation(vm,state),null);
 const action=projectSafeWorkAction({vm,state,action:{key:'prepare_plan',area:'planificacion'}});
 assert.equal(action,null);
});

test('B29: evitar doble cálculo de decisiones de Cliente durante navegación de shell',()=>{
 const vmSource=readFileSync(new URL('../src/m26/shell/shell-view-model.js',import.meta.url),'utf8');
 assert.match(vmSource,/authorized\?\.identity\?\.role==='client'/);
 assert.match(vmSource,/\?null:deriveRoleWorkContinuation\(authorized,state\)/);
});
