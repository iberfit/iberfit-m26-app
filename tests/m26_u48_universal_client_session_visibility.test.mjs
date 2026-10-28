import test from 'node:test';
import assert from 'node:assert/strict';
import {buildClientPlanningItems} from '../src/m26/rc39/session-policy.js';
import {prioritizeClientPublishedSessions,renderRc39Route} from '../src/m26/rc39/route-render.js';

const clientId='qa-client-u48';
const sports=['running','strength','swimming','walking','cycling','mobility','mixed',
  'circuito','biserie','triserie','amrap','tabata'];
const published=(sport,i,opts={})=>({
  id:'session-'+i,clientId,title:'Sesión '+sport,
  status:opts.status||'disponible',visibleToClient:opts.visible??true,
  deliveryModality:opts.onsite?'presencial':'guiada_en_app',
  deliveryOwnership:opts.onsite?'coach_led':'guided_in_app',
  clientVisibilityLevel:opts.onsite?'summary_only':'full',
  publishedAt:opts.publishedAt||new Date(Date.UTC(2026,9,1,8,i)).toISOString(),
  blocks:[{id:'block-'+i,type:'exercise',exerciseId:'exercise-'+i,
    name:'Ejercicio '+sport,sets:1,reps:'8',restSeconds:0}],
});
const project=(sessions)=>buildClientPlanningItems({sessions,appointments:[],
  now:'2026-10-28T15:00:00-03:00'});
const vm=(kind,projections,serviceActive=true)=>({
  role:'client',kind,serviceActive,selectedClient:{modality:'hibrida'},
  clientAppointments:[],sessionPreviewAssets:{catalog:[]},
  rc39:{role:'client',planningItems:projections,sessionProjections:projections,
    appointments:[],confirmationOpen:0,changeRequests:0},
});
const cardIds=html=>[...html.matchAll(/data-rc39-session="([^"]+)"/gu)].map(x=>x[1]);
test('U48: newest authorized session of every sport is FIRST, regardless of historical order',()=>{
 for(const sport of sports){
   const old=sports.filter(x=>x!==sport).slice(0,8).map((name,i)=>published(name,i+1));
   const fresh=published(sport,100,{publishedAt:'2026-10-28T17:00:00.000Z'});
   const projections=project([...old,fresh]);
   const ordered=prioritizeClientPublishedSessions(projections,{contractModality:'hibrida'});
   assert.equal(ordered.length,old.length+1);
   assert.equal(ordered[0].id,'session-100',sport+' must not be hidden in historical archive');
   assert.deepEqual(new Set(ordered.map(x=>x.id)),new Set(projections.map(x=>x.id)));
   for(const kind of ['sesion','planificacion']){
     const html=renderRc39Route(vm(kind,projections));
     const visible=html.split('data-signature-'+(kind==='sesion'?'session':'planning')+'-archive')[0];
     const ids=cardIds(visible);
     assert.ok(ids.includes('session-100'),sport+' must be above collapsed archive in '+kind);
     assert.equal(ids[0],'session-100',sport+' is the first actionable card in '+kind);
     assert.equal(cardIds(html).filter(x=>x==='session-100').length,1,
       'No duplicate session cards or duplicate play buttons');
     assert.match(html,/data-workflow-action="start-published-session"/u);
   }
 }
});
test('U48: unauthorized, draft, cancelled and supervised do not inherit a Client Play action',()=>{
 const draft=published('draft',50,{status:'draft'});
 const privateSession=published('private',51,{visible:false});
 const supervised=published('onsite',52,{onsite:true});
 const cancelled=published('cancelled',53,{status:'cancelada'});
 const valid=published('running',54);
 const projections=project([supervised,draft,privateSession,cancelled,valid]);
 const ordered=prioritizeClientPublishedSessions(projections);
 assert.equal(ordered[0].id,'session-54');
 assert.equal(ordered.find(x=>x.id==='session-52')?.ownership,'coach_led');
 assert.equal(ordered.some(x=>x.id==='session-50'),false);
 assert.equal(ordered.some(x=>x.id==='session-51'),false);
 for(const kind of ['sesion','planificacion']){
   const html=renderRc39Route(vm(kind,projections));
   assert.doesNotMatch(html,/data-rc39-session="session-50"|data-rc39-session="session-51"/u);
   assert.doesNotMatch(html,/data-workflow-action="start-published-session" data-entity-id="session-52"/u);
   assert.doesNotMatch(html,/data-workflow-action="start-published-session" data-entity-id="session-53"/u);
   assert.match(html,/data-workflow-action="start-published-session" data-entity-id="session-54"/u);
 }
});
test('U48: service pause retains session visibility but does not create an executable CTA',()=>{
 const projections=project([published('running',1),published('strength',2)]);
 assert.deepEqual(prioritizeClientPublishedSessions(projections,{serviceActive:false})
   .map(x=>x.id),projections.map(x=>x.id));
 for(const kind of ['sesion','planificacion']){
   const html=renderRc39Route(vm(kind,projections,false));
   assert.equal(cardIds(html).length,2);
   assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
 }
});
test('U48: equal or malformed publication timestamps preserve deterministic original order',()=>{
 const sessions=[published('running',1),published('strength',2),published('swimming',3)];
 for(const item of sessions)item.publishedAt='not-a-date';
 const projections=project(sessions);
 assert.deepEqual(prioritizeClientPublishedSessions(projections).map(x=>x.id),
   projections.map(x=>x.id));
});

// Regression from authenticated QA: U47 was the FIFTH of eight ready sessions.
// The previous 4-item clamp hid its actionable Play under history <details>.
test('U48 postmerge: all eight ready sessions including older running are visible on both Client routes',()=>{
 const ready=Array.from({length:8},(_,i)=>published(i===7?'running':'strength',i+1,{
   publishedAt:new Date(Date.UTC(2026,9,28,20,0-i)).toISOString(),
 }));
 const inactive=Array.from({length:25},(_,i)=>published('onsite',100+i,{onsite:true}));
 const projections=project([...inactive,...ready]);
 for(const kind of ['sesion','planificacion']){
   const html=renderRc39Route(vm(kind,projections));
   const historyMarker='data-signature-'+(kind==='sesion'?'session':'planning')+'-archive';
   const historyAt=html.indexOf(historyMarker);
   assert.ok(historyAt>0,'Review-only history remains discoverable');
   const immediate=html.slice(0,historyAt);
   for(const session of ready){
     assert.match(immediate,new RegExp('data-rc39-session="'+session.id+'"'),session.id+' must not be under history');
     assert.match(immediate,new RegExp('data-workflow-action="start-published-session" data-entity-id="'+session.id+'"'),
       session.id+' retains a direct authorized Play');
   }
   assert.ok(html.indexOf('data-rc39-session="session-8"')<historyAt);
   assert.equal(cardIds(html).length,ready.length+inactive.length,'No sessions dropped or duplicated');
   assert.equal((immediate.match(/data-workflow-action="start-published-session"/gu)||[]).length,ready.length);
 }
});
test('U48 postmerge: more than 24 ready sessions use a named available group, never historical archive',()=>{
 const ready=Array.from({length:30},(_,i)=>published('running',i+1));
 const inactive=Array.from({length:4},(_,i)=>published('onsite',100+i,{onsite:true}));
 const projections=project([...inactive,...ready]);
 for(const kind of ['sesion','planificacion']){
   const html=renderRc39Route(vm(kind,projections));
   const history='data-signature-'+(kind==='sesion'?'session':'planning')+'-archive';
   const overflow='data-signature-ready-overflow';
   assert.ok(html.indexOf(overflow)>0&&html.indexOf(overflow)<html.indexOf(history));
   assert.match(html,/Ver otros 6 entrenamientos disponibles/u);
   assert.ok(html.indexOf('data-rc39-session="session-30"')<html.indexOf(history));
   const startCount=(html.match(/data-workflow-action="start-published-session"/gu)||[]).length;
   assert.equal(startCount,30,'All authorized workouts retain their unique start action');
   assert.equal(cardIds(html).length,34,'Overflow does not duplicate or discard an older session');
 }
});
