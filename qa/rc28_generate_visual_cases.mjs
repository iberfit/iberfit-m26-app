import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProductionState,stateFromBootstrap} from '../src/m26/production-state.js';
import {createShellViewModel} from '../src/m26/shell/shell-view-model.js';
import {renderM26Shell} from '../src/m26/shell/shell-render.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderRouteView} from '../src/m26/modules/route-render.js';
import {M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,addTrainingGroup,closeTrainingGroup} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,advanceExecution,pauseExecution} from '../src/m26/workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {auditInteractiveMarkup} from '../src/m26/ui/interactive-audit.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const outDir=path.join(__dirname,'rc28_visual_cases');
fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(outDir,{recursive:true});
const css=fs.readFileSync(path.join(root,'src/m26/shell/shell.css'),'utf8');
const logo=fs.readFileSync(path.join(root,'public/isotipo-iberfit.png')).toString('base64');
const logoUri=`data:image/png;base64,${logo}`;
const records=JSON.parse(fs.readFileSync(path.join(root,'baseline_m25_2/exercise-catalog-m25.json'),'utf8'));
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'rc28_visual_cases.json'),'utf8'));
const now=new Date('2026-07-19T16:00:00Z');
const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const otherClientId='91d73166-2fc5-4a96-a27a-b6f71e24d93c';

function stateFor(role,activeArea,scenario='normal'){
  if(scenario==='loading')return createProductionState({hydration:{status:'loading',error:null},identity:null,activeArea:'acceso'});
  if(scenario==='access_error')return createProductionState({hydration:{status:'error',error:'Acceso no confirmado'},identity:null,activeArea:'acceso'});
  const isClient=role==='client';
  const user=isClient?{id:'61227666-d8b4-4d1e-aa08-2405ad2000db',role:'client',clientId,name:'Cliente IBERFIT'}:{id:'2425747b-93aa-44ed-86f3-334919a1f832',role:'coach',name:'Entrenador IBERFIT'};
  const pending=['conflict','retry'].includes(scenario)?[{operationId:'op-pending',type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'exec-1',clientId,status:'pending',retryable:true,attempts:scenario==='retry'?2:0,nextRetryAt:scenario==='retry'?'2026-07-19T16:05:00Z':null,errorCode:scenario==='retry'?'M26_NETWORK_UNAVAILABLE':null}]:[];
  const conflicts=scenario==='conflict'?[{operationId:'op-conflict',type:'PLAN_PUBLICAR',entityType:'planning',entityId:'plan-approved',clientId,status:'conflict',retryable:false,errorCode:'REVISION_CONFLICT'}]:[];
  const rejected=scenario==='conflict'?[{operationId:'op-rejected',type:'CITA_CANCELAR',entityType:'appointment',entityId:'appointment-1',clientId,status:'rejected',retryable:false,errorCode:'ROLE_FORBIDDEN'}]:[];
  const data={
    clients:[{id:clientId,name:'Cliente IBERFIT',modality:'Híbrido',status:'activo',internalNote:'NO-COMPARTIR-CLIENTE'},...(!isClient?[{id:otherClientId,name:'Cliente de seguimiento',modality:'En línea',status:'activo'}]:[])],
    clientProfiles:[{id:'profile-1',clientId,birthDate:'1990-01-01',objective:'Fuerza, salud y autonomía',status:'activo',coachNotes:'NO-COMPARTIR-PERFIL'}],clientAccess:[{id:'access-1',clientId,status:'activo'}],
    iriAssessments:[{id:'iri-2',clientId,evaluatedAt:'2026-07-18T10:00:00Z',assessmentDate:'2026-07-18',score:72,quality:'alta',classification:'Buen nivel funcional',status:'completado',revision:2},{id:'iri-1',clientId,evaluatedAt:'2026-06-01T10:00:00Z',score:67,quality:'alta',classification:'Nivel funcional medio',status:'completado',revision:1}],
    reports:[
      {id:'report-approved',clientId,title:'Informe de evolución pendiente de publicación',status:'aprobado',visibleToClient:false,createdAt:'2026-07-18T12:00:00Z',revision:2},
      {id:'report-published',clientId,title:'Informe IRI de julio',status:'publicado',visibleToClient:true,createdAt:'2026-07-01T12:00:00Z',periodStart:'2026-06-01',periodEnd:'2026-07-01',summary:'Evolución estable durante el periodo revisado.',conclusions:'La tolerancia al trabajo ha mejorado.',recommendations:'Mantener la progresión acordada.',internalNotes:'NO-COMPARTIR-INFORME',revision:3},
      ...(!isClient?[{id:'report-withdrawn',clientId,title:'Informe anterior retirado',status:'retirado',visibleToClient:false,createdAt:'2026-06-01T12:00:00Z',revision:4}]:[])
    ],
    trainingCycles:[
      {id:'plan-review',clientId,name:'Ciclo de fuerza en revisión',title:'Ciclo de fuerza en revisión',status:'validado',visibleToClient:false,revision:1},
      {id:'plan-approved',clientId,name:'Ciclo aprobado',title:'Ciclo aprobado',status:'aprobado',visibleToClient:false,revision:2},
      {id:'plan-published',clientId,name:'Ciclo base de fuerza',title:'Ciclo base de fuerza',goal:'Mejorar fuerza y autonomía.',startDate:'2026-07-01',endDate:'2026-08-31',status:'publicado',visibleToClient:true,privateNotes:'NO-COMPARTIR-PLAN',revision:3},
      ...(!isClient?[{id:'plan-archived',clientId,name:'Ciclo anterior archivado',title:'Ciclo anterior archivado',status:'archivado',visibleToClient:false,revision:4}]:[])
    ],
    sessions:[
      {id:'session-draft',clientId,title:'Fuerza global · Borrador',status:'borrador',visibleToClient:false,revision:1},
      {id:'session-approved',clientId,title:'Fuerza global · Sesión B',status:'aprobado',visibleToClient:false,revision:2},
      {id:'session-published',clientId,title:'Fuerza global · Sesión A',objective:'Trabajo global controlado.',durationMinutes:45,status:'publicado',visibleToClient:true,revision:3,coachNotes:'NO-COMPARTIR-SESION',blocks:[{id:'b1',type:'exercise',exerciseId:records[0].id,name:'Ejercicio guiado',sets:2,reps:'8',restSeconds:60,targetRpe:7,targetRir:3,alternativeId:records[1].id,internalNote:'NO-COMPARTIR-BLOQUE'}]},
      ...(!isClient?[{id:'session-withdrawn',clientId,title:'Sesión anterior retirada',status:'retirado',visibleToClient:false,revision:4}]:[])
    ],
    sessionExecutions:[{id:'exec-1',clientId,completedAt:'2026-07-16T11:00:00Z',status:'completed',results:[{reps:10,loadKg:10,rpe:7},{reps:8,loadKg:12,rpe:8}]},{id:'exec-0',clientId,completedAt:'2026-07-09T11:00:00Z',status:'completed',results:[{reps:10,loadKg:9,rpe:7}]}],
    appointments:[{id:'appointment-1',clientId,title:'Sesión presencial',startAt:'2026-07-19T18:00:00Z',status:'confirmado',location:'Las Condes'},{id:'appointment-2',clientId,title:'Sesión guiada en la aplicación',startAt:'2026-07-22T18:00:00Z',status:'confirmado',location:'En línea'},...(!isClient?[{id:'appointment-3',clientId:otherClientId,title:'Sesión en línea',startAt:'2026-07-19T20:00:00Z',status:'confirmado',location:'En línea'}]:[])],
    checkins:[{id:'checkin-1',clientId,createdAt:'2026-07-18T09:00:00Z',energy:4,sleep:4,stress:8,pain:6,notes:'Sueño interrumpido'},{id:'checkin-2',clientId,createdAt:'2026-07-11T09:00:00Z',energy:7,sleep:7,stress:4,pain:1,notes:'Buena recuperación'}],
    habits:[{id:'habit-1',clientId,title:'Caminar 30 minutos',description:'Frecuencia semanal',status:'activo',createdAt:'2026-07-01T09:00:00Z'}],habitLogs:[{id:'habit-log-1',clientId,habitId:'habit-1',completed:true,recordedAt:'2026-07-18T20:00:00Z',status:'confirmado'}],
    privateNotes:[{id:'note-1',clientId,title:'Revisar tolerancia de carga',body:'Mantener observación de recuperación y técnica.',status:'activo',updatedAt:'2026-07-18T13:00:00Z'}],
    wearableConnections:[{id:'wear-1',clientId,provider:'normalized_file',status:'conectado',lastSyncedAt:'2026-07-19T12:00:00Z',scopes:['steps','sleepMinutes','restingHeartRate']}],
    wearableDailySummaries:[
      {id:'wear-day-1',clientId,provider:'normalized_file',date:'2026-07-17',steps:7200,activeMinutes:38,sleepMinutes:425,restingHeartRate:60,hrvMs:44,activeEnergyKcal:480,workoutMinutes:30,quality:'alta',sourceUpdatedAt:'2026-07-17T22:00:00Z'},
      {id:'wear-day-2',clientId,provider:'normalized_file',date:'2026-07-18',steps:8600,activeMinutes:52,sleepMinutes:455,restingHeartRate:58,hrvMs:49,activeEnergyKcal:590,workoutMinutes:45,quality:'alta',sourceUpdatedAt:'2026-07-18T22:00:00Z'},
      {id:'wear-day-3',clientId,provider:'normalized_file',date:'2026-07-19',steps:7900,activeMinutes:44,sleepMinutes:440,restingHeartRate:59,hrvMs:47,activeEnergyKcal:530,workoutMinutes:35,quality:'alta',sourceUpdatedAt:'2026-07-19T15:00:00Z'}
    ],wearableSyncRuns:[],intelligenceRuns:[],domainEvents:[],coachAvailability:[],m26Entities:[]
  };
  if(scenario==='many_clients'&&!isClient){
    for(let index=0;index<36;index+=1){
      data.clients.push({id:`qa-client-${index+1}`,name:`Cliente de prueba ${String(index+1).padStart(2,'0')}`,modality:index%2===0?'Presencial':'En línea',status:index%5===0?'pausado':'activo'});
    }
  }
  if(scenario==='empty'){
    if(activeArea==='hoy'){data.appointments=[];data.sessions=[];data.habits=[];data.habitLogs=[];}
    if(activeArea==='planificacion')data.trainingCycles=[];
    if(activeArea==='sesion')data.sessions=[];
    if(activeArea==='informes')data.reports=[];
  }
  if(scenario==='no_data'){
    data.checkins=[];data.habits=[];data.habitLogs=[];data.wearableConnections=[];data.wearableDailySummaries=[];data.sessionExecutions=[];data.iriAssessments=[];
  }
  if(scenario==='long_content'){
    const longText='Evolución funcional estable con buena tolerancia al trabajo planificado, manteniendo una ejecución técnica controlada y una recuperación adecuada entre sesiones. '.repeat(8).trim();
    data.reports=data.reports.map((item)=>item.id==='report-published'?{...item,title:'Informe integral de evolución funcional, adherencia, recuperación y recomendaciones individualizadas para el siguiente periodo de entrenamiento',summary:longText,conclusions:longText,recommendations:longText}:item);
  }
  return stateFromBootstrap({serverTime:now.toISOString(),user,environment:{name:'QA visual local',commandRegistry:M26_EXTENDED_COMMAND_REGISTRY},canary:{active:true,scope:'allowlist',version:'26.0.0-cierre-local-maximo.28'},data},createProductionState({selectedClientId:clientId,activeArea,pendingOperations:pending,conflicts,rejectedOperations:rejected}));
}

function sessionMarkup(kind){
  const catalog=createExerciseCatalog(records);const draft=createSessionDraft({clientId,title:'Fuerza global · Sesión A',durationMinutes:50});
  addCatalogExercise(draft,catalog.list()[0].id,catalog,{sets:3,reps:'8–10',restSeconds:75});addTrainingGroup(draft,'biserie');addCatalogExercise(draft,catalog.list()[1].id,catalog,{sets:3,reps:'10',restSeconds:45});addCatalogExercise(draft,catalog.list()[2].id,catalog,{sets:3,reps:'10',restSeconds:45});closeTrainingGroup(draft);
  if(kind==='builder')return renderSessionBuilder({draft,catalog,query:'sentadilla',actionState:{status:'success',message:'Borrador guardado localmente'}});
  const execution=createExecution({session:draft,clientId});startExecution(execution);if(kind==='paused')pauseExecution(execution);if(kind==='feedback'){while(execution.status==='active'){recordSet(execution,draft,{reps:10,rpe:7,load:'12 kg'});advanceExecution(execution);}}
  return renderGuidedExecution({execution,session:draft,catalog,actionState:{status:'idle',message:''}});
}

for(const item of cases){
  const sessionKinds=new Set(['builder','execution','paused','feedback']);const activeArea=sessionKinds.has(item.route)?'sesion':item.route;const state=stateFor(item.role,activeArea,item.scenario);const shell=createShellViewModel(state);let routeMarkup=shell.mode==='authenticated'?(sessionKinds.has(item.route)?sessionMarkup(item.route):renderRouteView(createRouteViewModel(shell,state,now))):'';if(item.scenario==='preview'){const preview='<section class="m26-wearable-preview" data-wearable-preview aria-live="polite"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Vista previa local</p><h3>Archivo normalizado IBERFIT · 3 días</h3></div><span class="m26-badge is-neutral">3 aceptados · 0 omitidos</span></div><div class="m26-field-grid"><div class="m26-field"><span>Pasos medios</span><strong>7900</strong></div><div class="m26-field"><span>Minutos activos</span><strong>44 min</strong></div><div class="m26-field"><span>Sueño medio</span><strong>440 min</strong></div><div class="m26-field"><span>FC reposo media</span><strong>59 lpm</strong></div></div><p class="m26-notice">Esta vista previa se procesa solo en el navegador. No se ha enviado ni confirmado ningún dato.</p><div class="m26-action-grid m26-wearable-preview-actions"><button type="button" data-wearable-action="use-in-checkin">Añadir resumen al registro de bienestar</button><button type="button" data-wearable-action="download-summary">Descargar resumen</button><button type="button" data-wearable-action="clear-preview">Descartar vista previa</button></div></section>';routeMarkup=routeMarkup.replace(/<section class="m26-wearable-preview" data-wearable-preview hidden aria-live="polite"><\/section>/,preview);}let markup=renderM26Shell(shell,routeMarkup);
  const audit=auditInteractiveMarkup(markup);if(!audit.ok)throw new Error(`${item.name}:${audit.errors.join(',')}`);
  markup=markup.replaceAll('/public/isotipo-iberfit.png',logoUri);
  const html=`<!doctype html><html lang="es-ES"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Auditoría visual IBERFIT</title><style>html,body{margin:0;min-width:320px;min-height:100%;background:#07150f}${css}</style></head><body data-qa-status="pass" data-qa-role="${item.role}" data-qa-route="${item.route}" data-qa-scenario="${item.scenario}">${markup}<script>window.__RC28_QA__={castellano:true,dispositivos:true,soloCosteCero:true};</script></body></html>`;
  fs.writeFileSync(path.join(outDir,`${item.name}.html`),html);
}
console.log(`Generated ${cases.length} RC28 visual cases`);
