import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHoyRoute,renderPlanningRoute,renderProgressRoute} from '../src/m26/modules/route-render.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {clientSessionProjection} from '../src/m26/rc39/session-policy.js';
const client=(other={})=>({id:'c1',name:'Cliente QA',serviceActive:true,cycle:{name:'Plan activo'},iri:{confirmed:true},...other});
const appt=(id,sessionId)=>({id,sessionId,statusRaw:'confirmada',status:'Confirmada',title:'Entrenamiento',dateLabel:'18:00',modality:'Presencial'});
const proj=(id,other={})=>({id,visible:true,canClientStart:true,session:{title:'Fuerza guiada'},...other});
const today=(other={})=>({role:'client',serviceKind:'training',clients:[client()],appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{},...other});
const count=(html,s)=>html.split(s).length-1;
test('B2 older confirmed appointment cannot start from Client Today',()=>{
 const past=appt('past','s1');const h=renderHoyRoute(today({appointments:[past],rc39:{sessionProjections:[proj('s1')]}}));
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
 assert.match(h,/data-client-home-training-state="published"/u);
});
test('B2 genuine upcoming confirmed appointment retains exact one canonical start',()=>{
 const a=appt('next','s1');const h=renderHoyRoute(today({appointments:[a],upcoming:[a],rc39:{sessionProjections:[proj('s1')]}}));
 assert.equal(count(h,'data-workflow-action="start-published-session"'),1);
 assert.match(h,/data-entity-id="s1"/u);
 assert.match(h,/data-client-home-training-state="start-ready"/u);
});
test('B2 future appointment not part of today never inherits today Start CTA',()=>{
 const a=appt('tomorrow','s1');const h=renderHoyRoute(today({upcoming:[a],rc39:{sessionProjections:[proj('s1')]}}));
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
});
test('B2 stale legacy session projection with omitted appointment link remains guarded',()=>{
 const a=appt('old','s1');const h=renderHoyRoute(today({appointments:[a],rc39:{sessionProjections:[proj('s1',{appointmentId:null})]}}));
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
});
test('B2 independent guided workout still starts without any appointment',()=>{
 const h=renderHoyRoute(today({rc39:{sessionProjections:[proj('free')]}}));
 assert.match(h,/data-workflow-action="start-published-session" data-entity-id="free"/u);
});
test('B2 paused training never starts even when cached upcoming confirmed',()=>{
 const a=appt('next','s1');const h=renderHoyRoute(today({clients:[client({serviceActive:false})],appointments:[a],upcoming:[a],rc39:{sessionProjections:[proj('s1')]}}));
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
 assert.match(h,/Entrenamiento en pausa/u);
});
test('B2 Solo IRI never fabricates a training journey or Start',()=>{
 const h=renderHoyRoute(today({serviceKind:'iri_only',clients:[client({cycle:null})],rc39:{sessionProjections:[proj('s1')]}}));
 assert.match(h,/data-client-home-training-state="without-training"/u);
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
});
const plan=(other={})=>({role:'client',serviceKind:'training',serviceActive:true,sessions:[],cycles:[],currentCycle:null,periodization:null,profile:{},canEdit:false,cycleCounts:{},sessionCounts:{published:0},...other});
test('B2 Client plan empty has one next wellbeing action without bypassing publication',()=>{
 const h=renderPlanningRoute(plan());
 assert.match(h,/data-client-plan-next data-m26-area="actividad"/u);
 assert.match(h,/Registrar cómo estoy/u);
});
test('B2 Client plan with sessions links to their real route, not a synthetic Start',()=>{
 const h=renderPlanningRoute(plan({sessions:[{id:'s1',title:'Fuerza'}]}));
 assert.match(h,/data-client-plan-next data-m26-area="sesion"/u);
 assert.doesNotMatch(h,/data-client-plan-next[^>]*data-workflow-action="start-published-session"/u);
});
test('B2 paused Client plan links only to historical sessions',()=>{
 const h=renderPlanningRoute(plan({serviceActive:false}));
 assert.match(h,/data-client-plan-next data-m26-area="sesion"/u);
});
test('B2 Client no sessions prefers wellbeing and leaves planning discoverable',()=>{
 const h=renderRc39Route({kind:'sesion',role:'client',serviceActive:true,rc39:{sessionProjections:[]}});
 assert.match(h,/data-client-session-state="empty"/u);
 assert.ok(h.indexOf('data-m26-area="actividad"')<h.indexOf('data-m26-area="planificacion"'));
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
});
test('B2 confirmed progress offers Sessions continuity without mixing IRI diagnosis',()=>{
 const summary={days:28,dataQuality:'media',adherence:.5,completedSessions:2,plannedSessions:4,checkins:2,checkinAverage:{},iriBaseline:{baselineAssessmentId:'iri1'},wearable:{metrics:{},daysWithData:0},unconfirmedExecutions:0};
 const h=renderProgressRoute({role:'client',serviceKind:'training',summary,signal:{label:'Al día',level:'neutral'},timeline:[],longitudinal:null,alerts:[],planExecution:null,exerciseProgress:{totalExercises:0,exercises:[]},exercisePerformance:[]});
 assert.match(h,/m26-client-progress-continuity/u);
 assert.match(h,/data-m26-area="sesion">Ver mis sesiones/u);
 assert.match(h,/Punto de partida IRI/u);
 assert.doesNotMatch(h,/data-workflow-action="start-published-session"/u);
});
test('B2 scope and accessibility: Client only, 44px touch, reduced motion, forced colors',()=>{
 const css=fs.readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
 const start=css.indexOf('SIGNATURE B2: Client session');const end=css.indexOf('/* SIGNATURE B2 / Atelier Cliente',start);
 assert.ok(start>=0&&end>start,'ambos bloques B2 coexisten y conservan su delimitación');
 const part=css.slice(start,end);const flagship=css.slice(end);
 for(const name of ['m26-client-plan-next','m26-client-sessions-empty','m26-client-progress-continuity'])assert.ok(part.includes(name),name);
 assert.match(part,/min-height:44px/u);assert.match(part,/@media\(max-width:520px\)/u);
 assert.match(part,/@media\(prefers-reduced-motion:reduce\)/u);assert.match(part,/@media\(forced-colors:active\)/u);
 assert.doesNotMatch(part,/!important|position:fixed|pointer-events:none/u);
 assert.doesNotMatch(flagship,/!important|position:fixed/u);
 // Decorative 3px status stripes may be click-through; no interactive component may suppress events.
 const withoutDecorativeStripes=flagship.replace(/::before\{[^}]*pointer-events:none;[^}]*\}/gu,'');
 assert.doesNotMatch(withoutDecorativeStripes,/pointer-events:none/u);
});

test('B2 canonical Client Plan counts genuinely startable guided sessions, never visibility alone',()=>{
 const session={id:'guided',clientId:'c1',title:'Fuerza',status:'publicado',visibleToClient:true,deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',blocks:[{id:'b1',type:'exercise',exerciseId:'ex1',sets:3,reps:'10'}]};
 const projection=clientSessionProjection(session);
 const unready={...projection,canClientStart:false};
 const model={kind:'planificacion',role:'client',selectedClient:{modality:'hibrido'},serviceActive:true,rc39:{planningItems:[unready]}};
 const view=renderRc39Route(model);
 assert.match(view,/data-m30-planning-state="published"/u);
 assert.match(view,/<span>En app<\/span><strong>0<\/strong>/u);
 const paused=renderRc39Route({...model,serviceActive:false,rc39:{planningItems:[projection]}});
 assert.match(paused,/<span>En app<\/span><strong>0<\/strong>/u);
});
