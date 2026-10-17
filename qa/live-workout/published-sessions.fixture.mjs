/* Isolated, synthetic published-session QA. No credentials, business writes or remote APIs.
 * Renders production Client route/policy, then hands an approved entry to the
 * real session execution/controller modules. Not a substitute for a remote ACK test. */
import {renderRc39Route} from '../../src/m26/rc39/route-render.js';
import {
  clientSessionProjection,actorCanExecuteSession,sessionReadyToStart,
  sessionHasExecutableBlocks,sessionIdOf,
} from '../../src/m26/rc39/session-policy.js';
import {createExecution} from '../../src/m26/workflows/session-execution.js';
import {createSessionController} from '../../src/m26/workflows/session-controller.js';
import {renderGuidedExecution} from '../../src/m26/workflows/session-ui.js';
import {createActionState} from '../../src/m26/ui/action-state.js';

const params=new URLSearchParams(location.search);
const scenario=['mixed','summary','revoked','paused','empty'].includes(params.get('scenario'))
  ?params.get('scenario'):'mixed';
const role=params.get('role')==='coach'?'coach':'client';
const root=document.querySelector('#qa-root');
const route=document.querySelector('#qa-published-route');
const workout=document.querySelector('#qa-workout');
if(!root||!route||!workout)throw new Error('SIGNATURE_QA_ROOT_MISSING');
const CLIENT='22222222-2222-4222-8222-222222222222';
const ID_GUIDED='qa-published-guided';
const ID_COACH='qa-published-supervised';
const CATALOG=Object.freeze([
  {id:'qa-press',name_es:'Press de pecho',equipment:'Mancuernas',cues:['Control escapular'],instructions_es:['Bajada controlada']},
  {id:'qa-row',name_es:'Remo TRX',equipment:'TRX',cues:['Mantén la espalda estable']},
]);
const catalog={
  get(id){return CATALOG.find(x=>x.id===id)||null;},
  has(id){return CATALOG.some(x=>x.id===id);},
  list(){return [...CATALOG];},
  search(term=''){return CATALOG.filter(x=>x.name_es.toLowerCase().includes(String(term).toLowerCase()));},
};
const blocks=[
  {id:'qa-block-press',type:'exercise',exerciseId:'qa-press',sets:1,reps:'8-12',
   restSeconds:60,plannedLoad:'12 kg',targetRpe:7,targetRir:3,
   prescriptionNotes:'Entrena sin dolor.',tempo:'3-1-1'},
  {id:'qa-block-row',type:'exercise',exerciseId:'qa-row',sets:1,reps:'10',
   restSeconds:45,targetRpe:7,targetRir:3},
];
const makeGuided=()=>({
  id:ID_GUIDED,clientId:CLIENT,title:'Fuerza autónoma · Sesión publicada',
  status:scenario==='revoked'?'borrador':scenario==='paused'?'en_curso':'disponible',
  visibleToClient:true,deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  clientVisibilityLevel:scenario==='summary'?'summary_only':'full',
  durationMinutes:45,startAt:'2026-10-20T15:00:00Z',
  blocks,internalNotes:'QA_PRIVATE_COACH_NOTE_NEVER_CLIENT',
});
const makeSupervised=()=>({
  id:ID_COACH,clientId:CLIENT,title:'Fuerza presencial con Coach',
  status:'publicada',visibleToClient:true,deliveryModality:'presencial',
  deliveryOwnership:'coach_led',clientVisibilityLevel:'summary_only',
  durationMinutes:50,startAt:'2026-10-21T15:00:00Z',
  blocks,internalNotes:'QA_PRIVATE_SUPERVISED_NEVER_CLIENT',
});
const guided=makeGuided(),supervised=makeSupervised();
const projected=scenario==='empty'?[]:[clientSessionProjection(guided),clientSessionProjection(supervised)]
  .filter(item=>item.visible);
const view={kind:'sesion',role,serviceActive:true,selectedClient:{id:CLIENT,modality:'hibrido'},
  sessionPreviewAssets:{catalog:CATALOG,mediaMap:null},
  rc39:{role,sessionProjections:projected,appointments:[]},executions:[]};
route.innerHTML=renderRc39Route(view);
const errors=[],attempts=[],persisted=[];
let controller=null,execution=null,launchCount=0;
function allowed(item){
  return Boolean(role==='client'&&item&&item.visible===true&&item.visibility==='full'&&
    item.canClientExecute===true&&item.canClientStart===true&&
    sessionIdOf(item.session)===String(item.id||'')&&
    actorCanExecuteSession({role:'client',session:item.session,appointment:item.appointment})&&
    sessionReadyToStart(item.session)&&sessionHasExecutableBlocks(item.session));
}
function launch(item){
  launchCount++;
  // Production navigation replaces the preview route with the live workout;
  // don't mount both tall screens, which causes overlapping sticky controls.
  route.hidden=true;
  route.style.display='none';
  root.dataset.signatureQaPhase='live';
  execution=createExecution({session:item.session,clientId:CLIENT,
    executionId:'qa-published-integration-execution'});
  const context={
    session:item.session,execution,catalog,actionState:createActionState(),
    actor:{role:'client',clientId:CLIENT},appointmentId:null,sessionRevision:1,
    online:true,onExit(){},
    recoveryCoordinator:{
      async persist(value){persisted.push(structuredClone(value));},
      async settle(){},
      async synchronize(){return {online:true,flushed:0,deferred:0,remaining:0};},
    },
  };
  const render=()=>{workout.innerHTML=renderGuidedExecution({
    execution,session:item.session,catalog,actionState:context.actionState,role:'client',mediaMap:null,
  });};
  render();
  controller=createSessionController({
    root:workout,getContext:()=>context,render,
    onError(error){errors.push(String(error?.message||error));},
    autosaveDelayMs:60,lifecycleTarget:globalThis,visibilityTarget:document,
  });
  controller.mount();
}
route.addEventListener('click',(event)=>{
  const button=event.target?.closest?.('[data-workflow-action="start-published-session"]');
  if(!button)return;
  event.preventDefault();
  const id=button.getAttribute('data-entity-id');
  const item=projected.find(x=>x.id===id);
  const ok=allowed(item);
  attempts.push({id,ok});
  if(ok&&!controller)launch(item);
});
globalThis.__IBERFIT_PUBLISHED_SESSIONS_QA__=Object.freeze({
  mounted:true,syntheticQa:true,role,scenario,
  state(){
    return structuredClone({
      projectedIds:projected.map(x=>x.id),launchCount,attempts,
      status:execution?.status||'not_started',
      results:execution?.results||{},events:execution?.events||[],
      saved: persisted.length,errors,
    });
  },
});
