import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {syncIriSkippedGroup} from '../src/m26/app/workflow-controller.js';
import {normalizeFirstSessionDraft} from '../src/m26/workflows/iri-first-session.js';
import {buildIriReportHtml,openIriReportPrint} from '../src/m26/workflows/iri-report-document.js';
import {renderActivityRoute,renderClientsRoute,renderExpedienteRoute,renderHoyRoute,renderIriRoute,renderIntelligenceRoute,renderLibraryRoute,renderProgressRoute} from '../src/m26/modules/route-render.js';
import {createExerciseSearchIndex} from '../src/m26/exercises/search.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {generateSessionProposal} from '../src/m26/intelligence/session-engine.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function field({required=false,checked=false}={}){
  return {
    required,checked,disabled:false,dataset:{},attributes:new Map(),
    setAttribute(name,value=''){this.attributes.set(name,String(value));if(name==='required')this.required=true;},
    removeAttribute(name){this.attributes.delete(name);if(name==='required')this.required=false;},
  };
}
function formOf(entries){const map=new Map(Object.entries(entries));return {elements:{namedItem:(name)=>map.get(name)||null}};}

function validReportDraft(){
  return normalizeFirstSessionDraft({
    assessmentDate:'2026-07-27',birthDate:'1992-04-11',sexForNorms:'female',email:'qa@example.com',phone:'+56 9 1111 2222',modality:'hibrido',trainingAddress:'Dirección QA',primaryObjective:'Mejorar fuerza general',trainingExperience:'Intermedia',availability:'Dos días',screeningAccepted:'on',
    weightKg:'64',heightCm:'166',bodyFatPercent:'27',
    ankleLeft1:'8',ankleLeft2:'8.2',ankleLeft3:'8.1',ankleRight1:'7.5',ankleRight2:'7.7',ankleRight3:'7.6',posteriorLeft1:'24',posteriorLeft2:'25',posteriorLeft3:'24.5',posteriorRight1:'22',posteriorRight2:'22.5',posteriorRight3:'22.2',hipRotationResult:'Simétrica',squatDepth:'Paralela',
    chairStand30s:'18',chairStandValid:'on',pushVariant:'standard',pushUps:'12',pushValid:'on',trxRowRepetitions:'15',trxValid:'on',frontPlankSeconds:'55',
    cardioProtocol:'ymca-3min-standard',stepHeightCm:'30.5',cadenceBpm:'96',cardioDurationSeconds:'180',stepFinalHr:'156',stepOneMinuteHr:'127',cardioValid:'on',
    diagnosisStrengths:'Buena tolerancia',diagnosisPriorities:'Mejorar tracción',coachInterpretation:'Interpretación profesional suficiente para la evaluación.',initialPlan:'Plan inicial progresivo de cuatro semanas con seguimiento.',reviewAccepted:'on',
  },{id:'IRI-RC35'},'CLIENT-RC35');
}

test('No realizada desactiva mediciones, exige motivo y restaura obligatoriedad',()=>{
  const toggle=field({checked:true}),measurement=field({required:true}),optional=field(),reason=field();
  const form=formOf({skip:toggle,measurement,optional,reason});
  assert.equal(syncIriSkippedGroup(form,{toggleName:'skip',fieldNames:['measurement','optional'],reasonName:'reason'}),true);
  assert.equal(measurement.disabled,true);assert.equal(measurement.required,false);assert.equal(optional.disabled,true);
  assert.equal(reason.disabled,false);assert.equal(reason.required,true);
  toggle.checked=false;
  assert.equal(syncIriSkippedGroup(form,{toggleName:'skip',fieldNames:['measurement','optional'],reasonName:'reason'}),false);
  assert.equal(measurement.disabled,false);assert.equal(measurement.required,true);assert.equal(optional.required,false);
  assert.equal(reason.disabled,true);assert.equal(reason.required,false);
});

test('wizard IRI incluye protocolos, límites, audio y bloquea informes antes de confirmar',()=>{
  const html=renderIriRoute({current:{id:'IRI-RC35'},currentSummary:null,profile:{birthDate:'1992-04-11',sexForNorms:'female',sexForNormsLabel:'Mujer'},canEdit:true,history:[]});
  assert.match(html,/Rodilla a pared · ver protocolo/);assert.match(html,/Silla 30 segundos · ver protocolo/);
  assert.match(html,/name="bodyFatPercent"/);assert.doesNotMatch(html,/name="bodyFatPercent"[^>]*required/);assert.match(html,/name="bodyCompositionMethod"/);assert.match(html,/name="measurementConditions"/);
  assert.match(html,/Temporizador con avisos sonoros/);assert.match(html,/data-iri-timer-action="start"/);
  assert.match(html,/generate-client-iri-report" disabled aria-disabled="true"/);
  assert.match(html,/El IRI puede confirmarse cuando existan al menos dos dominios objetivos completos/);
  assert.match(html,/Objetivo principal <span class="m26-required"/);assert.match(html,/name="primaryObjective"[^>]*required/);
  assert.match(html,/Interpretación del Coach <span class="m26-required"/);assert.match(html,/name="coachInterpretation"[^>]*required/);
  assert.doesNotMatch(html,/Performance|80\/100|Puntuación 80/);
});

test('informe IRI es autocontenido y no depende de CSS externo en URL blob',()=>{
  const html=buildIriReportHtml({draft:validReportDraft(),variant:'client',clientName:'Cliente QA',coachName:'Coach QA',logoUrl:'/public/isotipo-iberfit.png'});
  assert.match(html,/<style>\s*@page\{size:A4/);assert.doesNotMatch(html,/<link[^>]+iri-report\.css/);
  assert.match(html,/class="pdf-page/);assert.match(html,/overflow:hidden/);
});

test('persistencia crítica verifica IRI, ciclo, sesión y nota antes de anunciar éxito',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  const session=read('src/m26/workflows/session-controller.js');
  const engagement=read('src/m26/engagement/engagement-controller.js');
  const application=read('src/m26/app/application.js');
  assert.match(workflow,/M26_IRI_CONFIRM_NOT_PERSISTED/);assert.match(workflow,/M26_PLAN_CONFIRM_NOT_PERSISTED/);
  assert.match(workflow,/refreshAndFind\('iriAssessments'/);assert.match(workflow,/refreshAndFind\('trainingCycles'/);
  assert.match(workflow,/focusIriValidationError/);assert.match(workflow,/scrollIntoView/);assert.match(workflow,/aria-invalid/);
  const sessionUi=read('src/m26/workflows/session-ui.js');
  assert.match(session,/action==='exit-session'[\s\S]*persistContext\(context\)/);
  assert.match(session,/case 'save-draft'/);
  assert.match(sessionUi,/data-session-action="save-draft"/);
  assert.match(engagement,/refreshState\(\{reason:'private-note-created'\}\)/);assert.match(engagement,/M26_PRIVATE_NOTE_NOT_PERSISTED/);
  assert.match(application,/createEngagementController\(\{[\s\S]*refreshState:/);
});



test('sesión guarda cambios por botón y bloquea la salida hasta completar la persistencia',async()=>{
  const listeners=new Map();
  const root={
    addEventListener(type,handler){listeners.set(type,handler);},
    removeEventListener(){},
    querySelectorAll(){return [];},
    querySelector(){return null;},
  };
  let saves=0,exited=false,releaseSave=null;
  const context={draft:{id:'SES-RC35',clientId:'CLIENT-RC35',title:'Sesión QA',blocks:[]},actionState:null,autosaveDraft:async()=>{saves++;}};
  const controller=createSessionController({root,getContext:()=>context,render:()=>{},onError:(error)=>{throw error;},autosaveDelayMs:50});
  controller.mount();
  const button=(action)=>({disabled:false,getAttribute(name){if(name==='data-session-action')return action;if(name==='aria-disabled')return null;return null;},setAttribute(){},removeAttribute(){},closest(selector){return selector==='[data-session-action]'?this:null;}});
  const click=(action)=>listeners.get('click')({target:button(action),preventDefault(){}});
  await click('save-draft');
  assert.equal(saves,1);
  context.autosaveDraft=()=>new Promise((resolve)=>{saves++;releaseSave=resolve;});
  context.onExit=()=>{exited=true;};
  const leaving=click('exit-session');
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(exited,false);
  assert.equal(saves,2);
  releaseSave();
  await leaving;
  assert.equal(exited,true);
});

test('Progreso y proyección Cliente no reconstruyen la puntuación global histórica',()=>{
  const progress=read('src/m26/engagement/progress-engine.js');
  const projection=read('src/m26/security/role-projection.js');
  const scoring=read('src/m26/norms/iri-scoring.js');
  assert.doesNotMatch(progress,/function iriScore/);assert.doesNotMatch(progress,/Puntuación \$\{/);
  assert.match(progress,/de 3 dominios registrados/);assert.doesNotMatch(projection,/\['score',\['score','puntuacion'/);
  assert.match(scoring,/compositeScore:null/);assert.match(scoring,/aggregation:'per_test_only'/);
});

test('shell usa un único scroll documental y conserva navegación móvil visible',()=>{
  const css=read('src/m26/shell/shell.css');
  assert.match(css,/\.m26-shell \{[\s\S]*height: auto;[\s\S]*overflow: visible;/);
  assert.match(css,/\.m26-sidebar \{[\s\S]*overflow: visible;/);
  assert.match(css,/\.m26-main \{ min-height: 0; overflow: visible;/);
  assert.match(css,/\.m26-mobile-nav \{ display: grid; position: sticky; bottom: 0;/);
  assert.doesNotMatch(css,/\.m26-shell \{[\s\S]{0,140}height: 100dvh;[\s\S]{0,80}overflow: hidden;/);
});

test('Agenda limpia errores al editar y la Inteligencia acepta una pregunta deliberada',()=>{
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/syncAppointmentFormState\(form,root=form\?\.ownerDocument\|\|null\)\{[\s\S]*clearStatus\(root,'appointment'\)/);
  assert.match(workflow,/coachQuestion=String\(raw\.coachQuestion/);assert.match(workflow,/Criterio del entrenador/);
  const html=renderIntelligenceRoute({canGenerate:true,ageYears:null,alerts:[],runs:[]});
  assert.match(html,/Pregunta o criterio del entrenador/);assert.match(html,/No hay fecha de nacimiento confirmada/);
  assert.doesNotMatch(html,/generate-intelligence" disabled/);
});

test('Inteligencia genera una propuesta sin edad y conserva la ausencia como null',()=>{
  const patterns=['sentadilla','bisagra','empuje','tracción','core','locomoción'];
  const exercises=patterns.flatMap((pattern,index)=>[
    {id:'IBF-'+index+'-A',name_es:'Ejercicio '+pattern+' A',pattern,equipment:'TRX',difficulty:'intermedio'},
    {id:'IBF-'+index+'-B',name_es:'Ejercicio '+pattern+' B',pattern,equipment:'TRX',difficulty:'intermedio'},
  ]);
  const catalog={count:367,list:()=>exercises,get:(id)=>exercises.find((item)=>item.id===id)||null};
  const proposal=generateSessionProposal({
    clientId:'CLIENT-RC35',
    goal:'fuerza',
    durationMinutes:50,
    experience:'intermedio',
    modality:'hibrido',
    ageYears:null,
    equipment:['TRX'],
    restrictions:[],
    painAreas:[],
    contraindications:[],
  },catalog);
  assert.equal(proposal.rationale.ageYears,null);
  assert.equal(proposal.exercises.length,6);
  assert.equal(proposal.qualityChecks.allFromCatalog,true);
  const workflow=read('src/m26/app/workflow-controller.js');
  assert.match(workflow,/Faltan datos de la propuesta\. Revisa objetivo, duración, experiencia y modalidad\./);
});

test('Biblioteca conserva los 367 IDs y expone filtros operativos',()=>{
  const media=JSON.parse(read('public/vendor/repdb/iberfit-canonical-media-map-v1.json'));
  assert.equal(media.items.length,367);assert.equal(new Set(media.items.map((item)=>item.iberfit_id)).size,367);
  const catalog=Array.from({length:367},(_,index)=>({id:`IBF-${index}`,name_es:`Ejercicio ${index}`,pattern:'sentadilla',equipment:'TRX'}));
  const html=renderLibraryRoute({catalog,total:367,mediaMap:null,role:'coach'});
  assert.match(html,/data-library-filter="equipment"/);assert.match(html,/data-library-filter="pattern"/);assert.match(html,/data-library-filter="visual"/);assert.match(html,/Mostrando los 367 ejercicios/);
});


test('Hoy prioriza una acción real y Clientes muestra filtros, estado IRI y acceso explícito',()=>{
  const client={id:'c1',name:'Cliente QA',modality:'Híbrida',status:'Estado no informado',access:'Sin acceso',accessKnown:false,iri:{coverageCount:1,status:'En progreso',confirmed:false},cycle:null,nextAppointment:null,profile:{primaryObjective:'Mejorar fuerza',weeklyFrequency:2}};
  const hoy=renderHoyRoute({role:'coach',clients:[client],proposals:[],appointments:[],upcoming:[],operations:{pending:0,conflicts:0,rejected:0}});
  assert.match(hoy,/Siguiente acción/);assert.match(hoy,/Abrir diagnóstico IRI/);assert.match(hoy,/Sin cita programada/);
  assert.doesNotMatch(hoy,/>Conflictos<|>Sin bloqueos</);
  const clientes=renderClientsRoute({clients:[client],selectedClientId:'c1',canCreate:false});
  assert.match(clientes,/data-client-filter="iri"/);assert.match(clientes,/data-client-filter="modality"/);assert.match(clientes,/data-client-sort/);
  assert.match(clientes,/Abrir expediente/);assert.match(clientes,/Siguiente: Continuar diagnóstico IRI/);assert.match(clientes,/Expediente activo/);
  assert.doesNotMatch(clientes,/Cartera autorizada|Clientes visibles/);
});

test('búsqueda de ejercicios prioriza coincidencias directas y excluye resultados débiles',()=>{
  const index=createExerciseSearchIndex([
    {id:'directa',name_es:'Sentadilla Goblet',pattern:'sentadilla',equipment:'mancuerna'},
    {id:'debil',name_es:'Extensión de rodilla en máquina',pattern:'extensión',equipment:'máquina',tags:['sentadilla']},
    {id:'trx',name_es:'Sentadilla con TRX',pattern:'sentadilla',equipment:'TRX'},
  ]);
  assert.deepEqual(index.search('sentadilla').map((item)=>item.id),['directa','trx']);
  assert.deepEqual(index.search('sentadilla con trx').map((item)=>item.id),['trx']);
});

test('tarjeta de biblioteca explica la ausencia de imagen y muestra protocolo y metadatos',()=>{
  const catalog=[{id:'e1',name_es:'Sentadilla QA',pattern:'sentadilla',equipment:'TRX',difficulty:'inicial',primary_muscles:['cuádriceps'],secondary_muscles:['glúteos'],instructions_es:['Ajusta las correas','Desciende con control'],precautions:['Detener ante dolor'],units:['repeticiones']}];
  const html=renderLibraryRoute({catalog,total:1,mediaMap:null,role:'coach'});
  assert.match(html,/Sin referencia visual/);assert.match(html,/Consulta la ejecución escrita/);assert.match(html,/Protocolo y detalles/);
  assert.match(html,/Dificultad/);assert.match(html,/Músculos principales/);assert.match(html,/Músculos secundarios/);assert.match(html,/Precauciones/);
});


test('informe directo carga CSS same-origin, verifica la maquetación y solo entonces permite imprimir',async()=>{
  let openedUrl='';let written='';let printed=0;let closed=0;let focused=0;
  const listeners={};
  const stylesheet={sheet:{},addEventListener:(event,handler)=>{listeners[`style-${event}`]=handler;}};
  const printButton={disabled:true,addEventListener:(event,handler)=>{listeners.print=handler;}};
  const closeButton={addEventListener:(event,handler)=>{listeners.close=handler;}};
  const status={textContent:''};
  const firstPage={};
  const controls={
    '[data-iri-report-stylesheet]':stylesheet,
    '[data-iri-report-print]':printButton,
    '[data-iri-report-close]':closeButton,
    '[data-iri-report-status]':status,
    '.pdf-page':firstPage,
  };
  const popup={
    document:{
      documentElement:{dataset:{}},fonts:{ready:Promise.resolve()},images:[],open:()=>{},write:(html)=>{written=html;},close:()=>{},
      querySelector:(selector)=>controls[selector]||null,
    },
    getComputedStyle:()=>({position:'relative',width:'793.7px',height:'1122.5px'}),
    requestAnimationFrame:(callback)=>callback(),
    print:()=>{printed++;},close:()=>{closed++;},focus:()=>{focused++;},
  };
  const result=openIriReportPrint({draft:validReportDraft(),variant:'client',locationLike:{origin:'https://m26-canary.iberfit.cl'},openWindow:(url)=>{openedUrl=url;return popup;}});
  assert.equal(result.mode,'direct-window');assert.equal(result.pages,7);assert.equal(openedUrl,'about:blank');
  assert.match(written,/rel="stylesheet" href="https:\/\/m26-canary\.iberfit\.cl\/m26\/iri-report\.css\?v=m26-rc36-canary-v8"/);
  assert.match(written,/data-iri-report-print disabled/);assert.doesNotMatch(written,/<style>/);
  assert.equal(printButton.disabled,false);assert.equal(status.textContent,'Informe listo');
  await listeners.print();listeners.close();assert.equal(printed,1);assert.equal(closed,1);assert.ok(focused>=2);
  const source=read('src/m26/workflows/iri-report-document.js');const css=read('public/m26/iri-report.css');
  assert.match(source,/openWindow\('about:blank','_blank'\)/);assert.match(source,/document\.write/);assert.match(source,/reportLayoutReady/);assert.doesNotMatch(source,/\/m26\/iri-report\.html#/);
  assert.match(css,/\.pdf-page/);assert.match(css,/\.iri-report-toolbar/);
});

test('Expediente enumera los campos esenciales pendientes y ofrece una acción para completarlos',()=>{
  const html=renderExpedienteRoute({summary:{name:'Cliente QA',modality:'Híbrida',status:'Estado no informado',access:'Acceso no informado',accessKnown:false,counts:{sessions:0,executions:0},profile:{completeness:50,missing:['birthDate','phone','trainingAddress'],sexForNormsLabel:'Sin registro',equipment:[],secondaryObjectives:[]},iri:null,cycle:null,nextAppointment:null},progress:null,alertSignal:null});
  assert.match(html,/Completa el perfil esencial/);assert.match(html,/fecha de nacimiento, teléfono, dirección de entrenamiento/);
  assert.match(html,/Completar en Diagnóstico IRI/);assert.match(html,/data-m26-area="iri"/);assert.match(html,/Estado por definir/);
  assert.match(html,/Datos de contacto/);assert.doesNotMatch(html,/Canales autorizados/);
  assert.doesNotMatch(html,/Sesiones planificadas<\/span><strong>0|Ejecuciones<\/span><strong>0/);
});


test('Actividad prioriza bienestar y hábitos; dispositivos quedan compactos y sin lenguaje técnico',()=>{
  const activity=renderActivityRoute({
    checkins:[{dateLabel:'28/07/2026',body:{energy:8,sleep:7,stress:3,pain:1}}],habits:[],canManageHabits:true,
    capabilities:{checkins:{ready:true},habits:{ready:true}},
    wearables:{summary:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'},connections:[],providers:[{key:'strava',label:'Strava',platform:'web',usableNow:false,policy:{tier:'free_registration',developmentAllowed:true}}],canControl:false},
  });
  assert.match(activity,/Bienestar y hábitos/);assert.match(activity,/0 muy baja · 10 muy alta/);assert.match(activity,/0 ninguno · 10 máximo/);
  assert.match(activity,/<details class="m26-panel m26-optional-section"><summary>Dispositivos e integraciones opcionales/);
  assert.match(activity,/Sin datos de dispositivos confirmados/);assert.match(activity,/Ninguna fuente aparece como conectada/);
  assert.doesNotMatch(activity,/OAuth|canje de tokens|backend|Arquitectura preparada/);
  assert.doesNotMatch(activity,/Función disponible:/);
  const progress=renderProgressRoute({summary:{days:28,dataQuality:'limitada',checkins:1,adherence:.5,completedSessions:2,plannedSessions:4,averageRpe:7,volume:120,iriCurrent:null,iriDelta:null,checkinAverage:{energy:8,sleep:7,stress:3,pain:1},wearable:{metrics:{},providers:[],daysWithData:0,freshness:'sin_datos',quality:'limitada'}},timeline:[],alerts:[],signal:{label:'Seguimiento',level:'neutral'}});
  assert.match(progress,/Resumen visual de adherencia/);assert.match(progress,/<meter min="0" max="1" value="0.5"/);assert.match(progress,/Promedio de bienestar/);assert.match(progress,/Actividad de dispositivo · sin datos confirmados/);
});


test('CI enruta canary/rc35 a la validación y conserva evidencia propia',()=>{
  const workflow=read('.github/workflows/ci.yml');
  assert.match(workflow,/Validar RC35 canary/);assert.match(workflow,/run: npm run validate:rc35:ci/);
  assert.match(workflow,/github\.ref != 'refs\/heads\/canary\/rc35'/);assert.match(workflow,/rc35-evidencia-validacion/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/canary\/rc35'/);
});
