import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {
  normalizeAppointmentModality,normalizeClientModality,
  appointmentModalityLabel,clientModalityLabel
} from '../src/m26/domain/modality.js';
import {createExerciseSearchIndex} from '../src/m26/exercises/search.js';
import {validateAppointmentDraft,buildAppointmentCommand} from '../src/m26/workflows/agenda-workflow.js';
import {validateIriDraft} from '../src/m26/workflows/iri-workflow.js';
import {createSessionDraft} from '../src/m26/workflows/session-builder.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {auditInteractiveMarkup} from '../src/m26/ui/interactive-audit.js';

const catalog=JSON.parse(readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url),'utf8'));
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

test('RC19 unifica modalidades históricas y etiquetas humanas',()=>{
  assert.equal(normalizeAppointmentModality('Guiada app'),'guiada_en_app');
  assert.equal(normalizeAppointmentModality('online-guiada'),'guiada_en_app');
  assert.equal(normalizeClientModality('Híbrido'),'hibrido');
  assert.equal(appointmentModalityLabel('guiada_app'),'Guiada en la aplicación');
  assert.equal(clientModalityLabel('hibrido'),'Híbrido');
  assert.equal(normalizeAppointmentModality('inventada'),null);
});

test('RC19 exige ubicación presencial y normaliza el comando de agenda',()=>{
  const base={clientId:'client-qa',startAt:'2026-08-10T10:00:00.000Z',endAt:'2026-08-10T11:00:00.000Z'};
  const invalid=validateAppointmentDraft({...base,modality:'presencial',location:'  '});
  assert.equal(invalid.ok,false);assert.ok(invalid.errors.includes('location'));
  const guided=buildAppointmentCommand({...base,modality:'guiada app',location:''});
  assert.equal(guided.payload.appointment.modality,'guiada_en_app');
  assert.equal(guided.payload.appointment.location,'');
  assert.equal(guided.type,'CITA_CREAR');
});

test('RC19 bloquea IRI sin mediciones objetivas de fuerza o composición',()=>{
  const base={clientId:'client-qa',assessmentDate:'2026-08-10',birthDate:'1990-02-20',sexForNorms:'female',stepFinalHr:150,stepOneMinuteHr:120};
  const empty=validateIriDraft({...base,strengthPatterns:{push:null,lower:''},bodyComposition:{bodyFatPercent:null}});
  assert.equal(empty.ok,false);assert.ok(empty.errors.includes('strengthPatterns'));assert.ok(empty.errors.includes('bodyComposition'));
  const complete=validateIriDraft({...base,strengthPatterns:{push:12,lower:18},bodyComposition:{bodyFatPercent:24.5}});
  assert.equal(complete.ok,true,complete.errors.join(','));
});

test('RC19 indexa 367 ejercicios y busca sin depender de tildes',()=>{
  const index=createExerciseSearchIndex(catalog);
  assert.equal(index.size,367);
  const results=index.search('abduccion cadera',{limit:30});
  assert.ok(results.some((item)=>item.id==='IBF-ABDUCCION-DE-CADERA-LATERAL')); // El nombre editorial puede evolucionar; el ID canónico no.
  const aliases=createExerciseSearchIndex([{id:'x',name_es:'Remo',pattern:'tirón',equipment:'TRX',tags:['espalda'],aliases:['row suspension']}]);
  assert.equal(aliases.search('row trx')[0]?.id,'x');
  assert.equal(index.search('',{limit:999}).length,367);
});

test('RC19 mantiene búsqueda interactiva dentro de presupuesto local amplio',()=>{
  const index=createExerciseSearchIndex(catalog);const queries=['sentadilla','trx espalda','movilidad cadera','press mancuerna','sin equipo'];
  const started=performance.now();for(let i=0;i<1000;i++)index.search(queries[i%queries.length]);const elapsed=performance.now()-started;
  assert.ok(elapsed<1000,`exercise search took ${elapsed.toFixed(1)}ms`);
});

test('RC19 debilita escrituras repetidas con autosave debounce y mount idempotente',async()=>{
  const listeners=new Map(),adds=new Map(),removes=new Map();
  const root={
    addEventListener(type,fn){listeners.set(type,fn);adds.set(type,(adds.get(type)||0)+1);},
    removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);removes.set(type,(removes.get(type)||0)+1);},
    querySelectorAll(){return [];},querySelector(){return null;}
  };
  const draft=createSessionDraft({clientId:'client-qa'});let saves=0;
  const context={draft,autosaveDraft:async()=>{saves++;}};
  const controller=createSessionController({root,getContext:()=>context,autosaveDelayMs:50});
  controller.mount();
  assert.equal(adds.get('click'),2);assert.equal(adds.get('input'),1);assert.equal(adds.get('m26:shell-rendered'),1);
  controller.mount();
  assert.equal(adds.get('click'),2);assert.equal(adds.get('input'),1);assert.equal(adds.get('m26:shell-rendered'),1);
  const target={value:'Sesión A',closest(selector){return selector==='[data-session-draft-field]'?this:null;},getAttribute(name){return name==='data-session-draft-field'?'title':null;}};
  listeners.get('input')({target});target.value='Sesión AB';listeners.get('input')({target});target.value='Sesión ABC';listeners.get('input')({target});
  await sleep(90);assert.equal(saves,1);assert.equal(draft.title,'Sesión ABC');
  target.value='Sesión final';listeners.get('input')({target});await controller.flushAutosave(context);assert.equal(saves,2);assert.equal(draft.title,'Sesión final');
  controller.destroy();assert.equal(removes.get('click'),2);assert.equal(removes.get('input'),1);assert.equal(removes.get('m26:shell-rendered'),1);
});


test('RC19 reconoce botones submit explícitos sin relajar el control de tipo',()=>{
  assert.equal(auditInteractiveMarkup('<form><button type="submit" data-workflow-action="complete-iri">Guardar</button></form>').ok,true);
  assert.ok(auditInteractiveMarkup('<button data-workflow-action="complete-iri">Guardar</button>').errors.includes('BUTTON_TYPE_REQUIRED'));
});

test('RC19 conserva PWA segura y formularios accesibles por teclado',()=>{
  const sw=readFileSync(new URL('../public/m26/sw.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const engagement=readFileSync(new URL('../src/m26/engagement/engagement-controller.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
  assert.match(sw,/m26-rc19/);assert.match(sw,/CACHE_FIRST_PATHS/);assert.match(sw,/NEVER_CACHE_PREFIXES/);assert.match(sw,/runtime-config/);
  assert.doesNotMatch(routes,/guiada_app/);assert.match(routes,/name="modality" required/);assert.match(routes,/type="submit"/);assert.match(routes,/bodyFatPercent/);assert.doesNotMatch(routes,/name="bodyFatPercent"[^>]*required/);assert.match(routes,/bodyCompositionMethod/);assert.match(routes,/measurementConditions/);
  assert.match(controller,/addEventListener\('submit',onSubmit\)/);assert.match(controller,/event\.preventDefault/);
  assert.match(engagement,/addEventListener\('submit',onSubmit\)/);assert.match(engagement,/ensureValidForm/);assert.doesNotMatch(routes,/data-engagement-form=\"(?:checkin|habit-definition)\"[^>]*novalidate/);
  assert.match(css,/RC19 · legibilidad/);assert.match(css,/content-visibility:\s*auto/);
});
