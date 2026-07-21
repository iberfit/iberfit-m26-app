import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProductionState} from '../src/m26/production-state.js';
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
const outDir=path.join(__dirname,'rc16_visual_cases');
fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(outDir,{recursive:true});
const css=fs.readFileSync(path.join(root,'src/m26/shell/shell.css'),'utf8');
const logo=fs.readFileSync(path.join(root,'public/isotipo-iberfit.png')).toString('base64');
const logoUri=`data:image/png;base64,${logo}`;
const records=JSON.parse(fs.readFileSync(path.join(root,'baseline_m25_2/exercise-catalog-m25.json'),'utf8'));
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'rc16_visual_cases.json'),'utf8'));
const now=new Date('2026-07-19T16:00:00Z');
const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const otherClientId='91d73166-2fc5-4a96-a27a-b6f71e24d93c';

function stateFor(role,activeArea,scenario='normal'){
  const isClient=role==='client';
  const pending=scenario==='conflict'?[{operationId:'op-pending',type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'exec-1',clientId,status:'pending',retryable:true}]:[];
  const conflicts=scenario==='conflict'?[{operationId:'op-conflict',type:'PLAN_PUBLICAR',entityType:'planning',entityId:'plan-1',clientId,status:'conflict',retryable:false,errorCode:'REVISION_CONFLICT'}]:[];
  const rejected=scenario==='conflict'?[{operationId:'op-rejected',type:'CITA_CANCELAR',entityType:'appointment',entityId:'appointment-1',clientId,status:'rejected',retryable:false,errorCode:'ROLE_FORBIDDEN'}]:[];
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:now.toISOString(),serverTime:now.toISOString()},
    identity:isClient?{id:'61227666-d8b4-4d1e-aa08-2405ad2000db',role:'client',clientId,name:'Cliente QA M26'}:{id:'2425747b-93aa-44ed-86f3-334919a1f832',role:'coach',name:'Coach QA M26'},
    environment:{name:'QA visual local',commandRegistry:M26_EXTENDED_COMMAND_REGISTRY},
    canary:{active:true,scope:'allowlist',version:'26.0.0-hardening-candidate.16'},selectedClientId:clientId,activeArea,
    collections:{...createProductionState().collections,
      clients:isClient?[{id:clientId,name:'Cliente Prueba IBERFIT',modality:'Híbrido',status:'activo'}]:[{id:clientId,name:'Cliente Prueba IBERFIT',modality:'Híbrido',status:'activo'},{id:otherClientId,name:'Cliente Online Seguimiento',modality:'Online',status:'activo'}],
      clientProfiles:[{id:'profile-1',clientId,objective:'Fuerza, salud y autonomía',status:'activo'}],clientAccess:[{id:'access-1',clientId,status:'activo'}],
      iriAssessments:[{id:'iri-2',clientId,evaluatedAt:'2026-07-18T10:00:00Z',score:72,quality:'alta',classification:'Buen nivel funcional',status:'completado'},{id:'iri-1',clientId,evaluatedAt:'2026-06-01T10:00:00Z',score:67,quality:'alta',classification:'Nivel funcional medio',status:'completado'}],
      reports:[{id:'report-1',clientId,title:'Informe IRI',status:'publicado',createdAt:'2026-07-18T12:00:00Z'}],trainingCycles:[{id:'cycle-1',clientId,name:'Ciclo base de fuerza',status:'activo'}],sessions:[{id:'session-1',clientId,title:'Fuerza global · Sesión A',status:'publicado'}],
      sessionExecutions:[{id:'exec-1',clientId,completedAt:'2026-07-16T11:00:00Z',status:'completed',results:[{reps:10,loadKg:10,rpe:7},{reps:8,loadKg:12,rpe:8}]},{id:'exec-0',clientId,completedAt:'2026-07-09T11:00:00Z',status:'completed',results:[{reps:10,loadKg:9,rpe:7}]}],
      appointments:[{id:'appointment-1',clientId,title:'Sesión presencial',startAt:'2026-07-19T18:00:00Z',status:'confirmado',location:'Las Condes'},{id:'appointment-2',clientId,title:'Sesión guiada en app',startAt:'2026-07-22T18:00:00Z',status:'confirmado',location:'Online'},...(!isClient?[{id:'appointment-3',clientId:otherClientId,title:'Sesión online',startAt:'2026-07-19T20:00:00Z',status:'confirmado',location:'Online'}]:[])],
      checkins:[{id:'checkin-1',clientId,createdAt:'2026-07-18T09:00:00Z',energy:4,sleep:4,stress:8,pain:6,notes:'Sueño interrumpido'},{id:'checkin-2',clientId,createdAt:'2026-07-11T09:00:00Z',energy:7,sleep:7,stress:4,pain:1,notes:'Buena recuperación'}],
      habits:[{id:'habit-1',clientId,title:'Caminar 30 minutos',description:'Frecuencia semanal',status:'activo',createdAt:'2026-07-01T09:00:00Z'}],habitLogs:[{id:'habit-log-1',clientId,habitId:'habit-1',completed:true,recordedAt:'2026-07-18T20:00:00Z',status:'confirmado'}],
      privateNotes:[{id:'note-1',clientId,title:'Revisar tolerancia de carga',body:'Mantener observación de recuperación y técnica.',status:'activo',updatedAt:'2026-07-18T13:00:00Z'}],intelligenceRuns:[],domainEvents:[],coachAvailability:[],m26Entities:[]},
    pendingOperations:pending,conflicts,rejectedOperations:rejected,
  });
}

function sessionMarkup(kind){
  const catalog=createExerciseCatalog(records);const draft=createSessionDraft({clientId,title:'Fuerza global · Sesión A',durationMinutes:50});
  addCatalogExercise(draft,catalog.list()[0].id,catalog,{sets:3,reps:'8–10',restSeconds:75});addTrainingGroup(draft,'biserie');addCatalogExercise(draft,catalog.list()[1].id,catalog,{sets:3,reps:'10',restSeconds:45});addCatalogExercise(draft,catalog.list()[2].id,catalog,{sets:3,reps:'10',restSeconds:45});closeTrainingGroup(draft);
  if(kind==='builder')return renderSessionBuilder({draft,catalog,query:'sentadilla',actionState:{status:'success',message:'Borrador guardado localmente'}});
  const execution=createExecution({session:draft,clientId});startExecution(execution);if(kind==='paused')pauseExecution(execution);if(kind==='feedback'){while(execution.status==='active'){recordSet(execution,draft,{reps:10,rpe:7,load:'12 kg'});advanceExecution(execution);}}
  return renderGuidedExecution({execution,session:draft,catalog,actionState:{status:'idle',message:''}});
}

for(const item of cases){
  const sessionKinds=new Set(['builder','execution','paused','feedback']);const activeArea=sessionKinds.has(item.route)?'sesion':item.route;const state=stateFor(item.role,activeArea,item.scenario);const shell=createShellViewModel(state);const routeMarkup=sessionKinds.has(item.route)?sessionMarkup(item.route):renderRouteView(createRouteViewModel(shell,state,now));let markup=renderM26Shell(shell,routeMarkup);
  const audit=auditInteractiveMarkup(markup);if(!audit.ok)throw new Error(`${item.name}:${audit.errors.join(',')}`);
  markup=markup.replaceAll('/public/isotipo-iberfit.png',logoUri);
  const html=`<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>${item.name}</title><style>html,body{margin:0;min-width:320px;min-height:100%;background:#07150f}${css}</style></head><body data-qa-status="pass" data-qa-role="${item.role}" data-qa-route="${item.route}" data-qa-scenario="${item.scenario}">${markup}</body></html>`;
  fs.writeFileSync(path.join(outDir,`${item.name}.html`),html);
}
console.log(`Generated ${cases.length} RC16 visual cases`);
