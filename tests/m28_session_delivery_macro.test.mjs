import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionDraft,addCatalogExercise,updateSessionDraft,acceptSessionPreview,buildPublishSessionCommand,validateSessionDraft} from '../src/m26/workflows/session-builder.js';
import {createReusableSessionDraft,sessionTemplateSnapshot,createDraftFromSessionTemplate} from '../src/m26/productivity/session-reuse.js';
import {resolveSessionExperience} from '../src/m26/domain/modality.js';
import {actorCanExecuteSession,sessionDeliveryModality,sessionDeliveryOwnership,sessionVisibilityLevel,clientSessionProjection} from '../src/m26/rc39/session-policy.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const exercise={id:'ex1',name_es:'Sentadilla',name:'Sentadilla',pattern:'sentadilla'};
const catalog={
  get:(id)=>id==='ex1'?exercise:null,
  has:(id)=>id==='ex1',
  search:()=>[],
  list:()=>[],
};
function draft(modality){
  const item=createSessionDraft({clientId:'c1',title:'Fuerza IBERFIT',deliveryModality:modality});
  addCatalogExercise(item,'ex1',catalog,{sets:3,reps:'10',restSeconds:90,targetRpe:7,targetRir:3});
  return item;
}
function published(modality){
  const source=draft(modality);
  acceptSessionPreview(source,catalog);
  return buildPublishSessionCommand(source,catalog).payload.patch;
}
test('Coach explicitly selects per-session delivery, even inside the same hybrid plan',()=>{
  const presencial=draft('presencial');
  const guiada=draft('guiada_en_app');
  assert.equal(presencial.deliveryModality,'presencial');
  assert.equal(guiada.deliveryModality,'guiada_en_app');
  assert.equal(validateSessionDraft(presencial,catalog).ok,true);
  updateSessionDraft(presencial,'deliveryModality','guiada_en_app');
  assert.equal(presencial.deliveryModality,'guiada_en_app');
  assert.equal(presencial.previewAccepted,false);
  assert.throws(()=>updateSessionDraft(presencial,'deliveryModality','online'),/M28_SESSION_DELIVERY_INVALID/u);
  assert.throws(()=>createSessionDraft({clientId:'c1',deliveryModality:'online'}),/M28_SESSION_DELIVERY_INVALID/u);
});
test('Publication persists distinct execution owner and client visibility; never duplicating the session',()=>{
  const inPerson=published('presencial');
  const autonomous=published('guiada_en_app');
  assert.equal(inPerson.deliveryOwnership,'coach_led');
  assert.equal(inPerson.clientVisibilityLevel,'summary_only');
  assert.equal(inPerson.visibleToClient,true);
  assert.equal(autonomous.deliveryOwnership,'guided_in_app');
  assert.equal(autonomous.clientVisibilityLevel,'full');
  assert.equal(autonomous.visibleToClient,true);
  assert.equal(inPerson.blocks.length,autonomous.blocks.length);
  assert.equal(inPerson.blocks[0].exerciseId,autonomous.blocks[0].exerciseId);
});
test('Client never starts presencial; Coach retains control; hybrid guided remains fully executable',()=>{
  const presencial=published('presencial'),guided=published('guiada_en_app');
  assert.equal(actorCanExecuteSession({role:'client',session:presencial}),false);
  assert.equal(actorCanExecuteSession({role:'coach',session:presencial}),true);
  assert.equal(actorCanExecuteSession({role:'client',session:guided}),true);
  assert.equal(actorCanExecuteSession({role:'admin',session:guided}),false);
  const one=clientSessionProjection(presencial);
  const two=clientSessionProjection(guided);
  assert.equal(one.visible,true);
  assert.equal(one.canClientExecute,false);
  assert.equal(one.visibility,'summary_only');
  assert.equal(two.visible,true);
  assert.equal(two.canClientExecute,true);
  assert.equal(two.visibility,'full');
  const hybrid=resolveSessionExperience({contractModality:'hibrido',deliveryModality:one.modality,
    ownership:one.ownership,clientCanExecute:true,role:'client',isPublished:true,hasFullContent:true});
  assert.equal(hybrid.clientLiveWorkout,false);
  const hybridGuided=resolveSessionExperience({contractModality:'hibrido',deliveryModality:two.modality,
    ownership:two.ownership,clientCanExecute:true,role:'client',isPublished:true,hasFullContent:true});
  assert.equal(hybridGuided.clientLiveWorkout,true);
  assert.equal(hybridGuided.offlineEligible,true);
});
test('Conflicting and unauthorized visibility values never grant Client access',()=>{
  for(const s of [
    {...published('presencial'),deliveryOwnership:'client_autonomous',clientVisibilityLevel:'full'},
    {...published('guiada_en_app'),deliveryOwnership:'coach_led',clientVisibilityLevel:'full'},
    {...published('guiada_en_app'),deliveryModality:'unknown'},
    {...published('guiada_en_app'),visibleToClient:false,clientVisibilityLevel:'full'},
    {...published('presencial'),visibleToClient:false,clientVisibilityLevel:'full'},
  ]){
    assert.equal(actorCanExecuteSession({role:'client',session:s}),false);
  }
  assert.equal(sessionVisibilityLevel({...published('presencial'),visibleToClient:false}),'hidden');
  assert.equal(sessionDeliveryModality({...published('guiada_en_app'),deliveryModality:'bogus'}),'unknown');
  assert.equal(sessionDeliveryOwnership({...published('presencial'),deliveryOwnership:'client_autonomous'}),'coach_led');
});
test('Copies and reusable templates preserve per-session mode without copying an execution',()=>{
  const source=published('presencial');
  const reused=createReusableSessionDraft(source,{clientId:'c1',catalog});
  assert.equal(reused.deliveryModality,'presencial');
  assert.equal(reused.status,'draft');
  assert.equal(reused.previewAccepted,false);
  assert.notEqual(reused.id,source.id);
  const template=sessionTemplateSnapshot(reused);
  assert.equal(template.deliveryModality,'presencial');
  const loaded=createDraftFromSessionTemplate({name:'Fuerza',snapshot:template},{clientId:'c2',catalog});
  assert.equal(loaded.clientId,'c2');
  assert.equal(loaded.deliveryModality,'presencial');
  assert.notEqual(loaded.id,reused.id);
  assert.deepEqual(loaded.blocks.map(x=>x.exerciseId),reused.blocks.map(x=>x.exerciseId));
});
test('Mode is obvious in Coach constructor and obligatory review before publishing',()=>{
  const html=renderSessionBuilder({draft:draft('presencial'),catalog,role:'coach'});
  assert.match(html,/data-session-draft-field="deliveryModality"/u);
  assert.match(html,/Presencial · dirigida por Coach/u);
  assert.match(html,/Guiada autónoma · desde la app/u);
  assert.match(html,/Elige el tipo de esta sesión/u);
  const preview=draft('presencial');
  acceptSessionPreview(preview,catalog);
  const review=renderSessionBuilder({draft:preview,catalog,role:'coach'});
  assert.match(review,/data-session-delivery-review/u);
  assert.match(review,/El Coach registra la ejecución/u);
  assert.match(review,/data-session-action="publish"/u);
});
test('Direct Client start action cannot bypass presencial policy, including offline',()=>{
  const session=published('presencial');
  for(const online of [true,false]){
    assert.throws(()=>dispatchSessionAction({action:'start',session,execution:{id:'e1',clientId:'c1',sessionId:session.id,status:'ready'},actor:{role:'client'},online}),/M28_SESSION_COACH_LED_CLIENT_START_FORBIDDEN/u);
  }
});
test('Interface keeps future live-online unavailable and preserves Android/offline machinery',()=>{
  const ui=readFileSync('src/m26/modules/route-render.js','utf8');
  const app=readFileSync('src/m26/app/application.js','utf8');
  const css=readFileSync('src/m26/design/premium-ux.css','utf8');
  assert.match(ui,/<option value="online" disabled>Online en directo · opción futura/u);
  // B24: the player now receives a canonical security-preserving snapshot,
  // not an inline extraction that drops legacy delivery/visibility fields.
  assert.match(app,/const normalizePublishedSession=normalizePublishedSessionForExecution;/u);
  const policy=readFileSync('src/m26/rc39/session-policy.js','utf8');
  assert.match(policy,/export function normalizePublishedSessionForExecution/u);
  assert.match(css,/m26-session-delivery-select/u);
  assert.match(css,/min-height:44px/u);
});

test('Wrapped published sessions show separate guided and presencial experiences in planning and Hoy',()=>{
 const make=(mode)=>({id:'wrapped-'+mode,clientId:'c1',status:'published',visibleToClient:true,body:{id:'wrapped-'+mode,clientId:'c1',status:'published',title:'Fuerza IBERFIT',deliveryModality:mode,blocks:[{type:'exercise',exerciseId:'ex1',sets:3,reps:'10'}]}});
 const guided=clientSessionProjection(make('guiada_en_app')),presencial=clientSessionProjection(make('presencial'));
 const html=renderRc39Route({kind:'planificacion',role:'client',selectedClient:{modality:'hibrido'},rc39:{planningItems:[presencial,guided]}});
 assert.match(html,/data-session-experience-card="hybrid_coach_led"/u);
 assert.match(html,/data-session-experience-card="hybrid_autonomous"/u);
 assert.equal((html.match(/data-workflow-action="start-published-session"/gu)||[]).length,1);
 assert.match(html,/Esta sesión la dirige tu Coach/u);
 assert.match(html,/Preparar entrenamiento/u);
 const today=renderHoyRoute({role:'client',clients:[{id:'c1',name:'Cliente',serviceActive:true}],appointments:[{id:'a1',sessionId:guided.id,statusRaw:'confirmada',status:'Confirmada',title:'Fuerza IBERFIT'}],proposals:[],upcoming:[{id:'a1',sessionId:guided.id,statusRaw:'confirmada',status:'Confirmada',title:'Fuerza IBERFIT'}],operations:{pending:0,conflicts:0,rejected:0},rc39:{sessionProjections:[presencial,guided]}});
 assert.match(today,/Entrenar ahora/u);
 assert.match(today,/data-entity-id="wrapped-guiada_en_app"/u);
});

test('New Coach sessions require a conscious per-session choice before preview/publication',()=>{
 const next=draft('guiada_en_app');
 next.deliveryModality=null;next.previewAccepted=false;
 assert.ok(validateSessionDraft(next,catalog).errors.includes('deliveryModality'));
 assert.throws(()=>acceptSessionPreview(next,catalog),/M26_SESSION_DRAFT_INVALID/u);
 assert.throws(()=>buildPublishSessionCommand(next,catalog),/M26_SESSION_DRAFT_INVALID/u);
 const html=renderSessionBuilder({draft:next,catalog,role:'coach'});
 assert.match(html,/option value="" disabled selected>Seleccionar modo de sesión/u);
 updateSessionDraft(next,'deliveryModality','presencial');
 assert.equal(validateSessionDraft(next,catalog).ok,true);
 const app=readFileSync('src/m26/app/application.js','utf8');
 assert.match(app,/if\(!sourceSession&&!saved\)draft.deliveryModality=null/u);
});

test('Legacy presencial execution_type and appointment mode are never autonomous',()=>{
 const legacy={id:'legacy-presencial',clientId:'c1',status:'published',execution_type:'presencial',blocks:[]};
 assert.equal(sessionDeliveryModality(legacy),'presencial');
 assert.equal(sessionDeliveryModality(legacy,{modality:'guiada_en_app'}),'presencial');
 assert.equal(actorCanExecuteSession({role:'client',session:legacy,appointment:{modality:'guiada_en_app'}}),false);
 assert.equal(actorCanExecuteSession({role:'client',session:legacy}),false);
 assert.equal(clientSessionProjection(legacy).ownership,'coach_led');
 const {execution_type:ignored,...withoutExecution}=legacy;
 const appointment={id:'a1',mode:'presencial',status:'confirmada',startAt:'2026-10-15T10:00:00-03:00'};
 assert.equal(sessionDeliveryModality(withoutExecution,appointment),'presencial');
 assert.equal(actorCanExecuteSession({role:'client',session:withoutExecution,appointment}),false);
 assert.equal(clientSessionProjection(withoutExecution,appointment).ownership,'coach_led');
 assert.equal(sessionDeliveryModality({...legacy,deliveryModality:'unknown'}),'unknown');
 assert.equal(actorCanExecuteSession({role:'client',session:{...legacy,deliveryModality:'unknown'}}),false);
 const guided={...legacy,deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app'};
 assert.equal(actorCanExecuteSession({role:'client',session:guided}),true);
});
