import test from 'node:test';
import assert from 'node:assert/strict';
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
