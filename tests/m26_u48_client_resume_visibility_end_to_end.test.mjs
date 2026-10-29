import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCanonicalTrainingCollections} from '../src/m26/domain/canonical-training-collections.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';
import {renderRc39Route,prioritizeClientPublishedSessions} from '../src/m26/rc39/route-render.js';

const client='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const session='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const execution='16145839-2e7d-48e2-bf0c-e94325f5c54c';
const other='57f56a87-d04e-47d5-b1cc-8d4939d7c805';
const block={id:'40000000-0000-4000-8000-000000000475',
 type:'exercise',exerciseId:'IBF-CARRERA-SUAVE',sets:1,reps:'',plannedDistanceKm:6.5};
function fixture(){
 const prescribed={id:session,clientId:client,title:'QA U47 · Running 40738135729-1',
  status:'en_curso',revision:3,visibleToClient:true,clientVisibilityLevel:'full',
  deliveryOwnership:'guided_in_app',deliveryModality:'guiada_en_app',blocks:[block],
  publishedAt:'2026-10-28T12:00:00.000Z'};
 const activeBody={id:execution,clientId:client,sessionId:session,status:'en_curso',
  revision:1,results:{},privateCoachNotes:'PRIVATE-NOT-FOR-CLIENT'};
 const entity=(entityType,entityId,status,revision,body)=>({
  entityType,entityId,clientId:body.clientId,status,revision,body});
 const ready=Array.from({length:32},(_,i)=>({id:'50000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
  clientId:client,title:'Disponible '+i,status:'disponible',revision:1,
  visibleToClient:true,clientVisibilityLevel:'full',deliveryOwnership:'guided_in_app',
  deliveryModality:'guiada_en_app',blocks:[block],
  publishedAt:new Date(Date.UTC(2026,9,29,11,i)).toISOString()}));
 return {raw:{clients:[{id:client,name:'QA A'}],
  sessions:[...ready,{...prescribed,status:'publicado'}],
  sessionExecutions:[{id:execution,client_id:client,session_id:session,execution_status:'activa',
   revision:1,summary:{...activeBody}}],
  m26Entities:[entity('session',session,'en_curso',3,prescribed),
   entity('session_execution',execution,'en_curso',1,activeBody)]},ready};
}
function projected(raw){
 const collections=reconcileCanonicalTrainingCollections(raw);
 const identity={role:'client',clientId:client,id:'20000000-0000-4000-8000-000000000200'};
 const scoped=projectCollectionsForRole(collections,identity,
  ['clients','sessions','sessionExecutions','m26Entities']);
 assertClientProjectionSafe(scoped,identity);
 return {collections:scoped,identity,selectedClientId:client,
  environment:{rc39:{}},hydration:{serverTime:'2026-10-29T10:00:00Z'}};
}
function screen(state,kind){
 const vm={kind,role:'client',serviceActive:true,selectedClient:{modality:'hibrido'},clientAppointments:[]};
 const enriched=augmentRc39ViewModel(vm,{identity:state.identity},state,new Date('2026-10-29T10:00:00Z'));
 return renderRc39Route(enriched);
}
test('U48 real 32-session load: only the owned canonical ACK makes existing running resumable and first',()=>{
 const f=fixture(),state=projected(f.raw);
 const canonical=state.collections.m26Entities.find(r=>r.entityType==='session_execution');
 assert.equal(canonical.entityId,execution);
 assert.equal(canonical.sessionId,session);
 assert.equal(canonical.clientId,client);
 assert.equal(Object.hasOwn(canonical,'body'),false);
 assert.doesNotMatch(JSON.stringify(state.collections),/PRIVATE-NOT-FOR-CLIENT/);
 for(const kind of ['sesion','planificacion']){
  const html=screen(state,kind),target=html.indexOf('data-rc39-session="'+session+'"');
  const history=html.indexOf('data-signature-'+(kind==='sesion'?'session':'planning')+'-archive');
  const overflow=html.indexOf('data-signature-ready-overflow');
  assert.ok(target>=0&&(history<0||target<history)&&(overflow<0||target<overflow),kind+': continue must be first, not archived');
  assert.match(html,new RegExp('data-workflow-action="start-published-session" data-entity-id="'+session+'">Continuar entrenamiento'));
  assert.equal((html.match(new RegExp('data-rc39-session="'+session+'"','gu'))||[]).length,1);
 }
});
test('U48 projection fails closed when active canonical owner/session/revision mismatches',()=>{
 for(const mutate of [
  x=>{x.m26Entities[1].clientId=other;},
  x=>{x.m26Entities[1].body.clientId=other;},
  x=>{x.m26Entities[1].body.sessionId=other;},
  x=>{x.m26Entities[1].body.revision=7;},
  x=>{x.m26Entities.splice(1,1);},
 ]){
  const raw=fixture().raw;mutate(raw);
  const html=screen(projected(raw),'sesion');
  assert.doesNotMatch(html,new RegExp('data-workflow-action="start-published-session" data-entity-id="'+session+'">Continuar entrenamiento'));
 }
});
test('U48 canonical-only ACK remains recoverable when legacy execution table has no duplicate',()=>{
 const raw=fixture().raw;
 raw.sessionExecutions=[];
 const html=screen(projected(raw),'sesion');
 assert.match(html,new RegExp('data-workflow-action="start-published-session" data-entity-id="'+session+'">Continuar entrenamiento'));
});
test('U48 paused service must show no resume CTA despite evidence; no second start',()=>{
 const state=projected(fixture().raw);
 const vm={kind:'sesion',role:'client',serviceActive:false,selectedClient:{modality:'hibrido'},clientAppointments:[]};
 const html=renderRc39Route(augmentRc39ViewModel(vm,{identity:state.identity},state));
 assert.doesNotMatch(html,new RegExp('data-workflow-action="start-published-session" data-entity-id="'+session+'"'));
});
