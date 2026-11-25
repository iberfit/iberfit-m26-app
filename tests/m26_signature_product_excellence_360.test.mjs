import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedScheduledCompletion,scheduledCompletionCopy} from '../src/m26/engagement/progress-continuity.js';
import {renderAthleticClientEvidence} from '../src/m26/design/athletic-client-evidence.js';
import {deriveClientDayNextAction} from '../src/m26/experience/client-day-context.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
import {coachCapacityEvidence,deriveAdminCommandCenter} from '../src/m26/admin/command-center.js';
import {buildCoach360Rows} from '../src/m26/admin/view-model.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

test('Client home distinguishes canonical zero scheduled completions from missing evidence',()=>{
  const base={completedSessions:0,plannedSessions:3,adherence:0,checkins:0};
  assert.equal(renderAthleticClientEvidence(base),'');
  const html=renderAthleticClientEvidence({...base,scheduledCompletedSessions:0});
  assert.match(html,/0 \/ 3<\/strong><span>Citas cumplidas/u);
  assert.doesNotMatch(html,/data-verified-volume-chart/u);
  assert.equal(renderAthleticClientEvidence({...base,scheduledCompletedSessions:4}),'');
});
test('Client chart never interprets null dates as January 1970',()=>{
  const html=renderAthleticClientEvidence({completedSessions:2,plannedSessions:2,adherence:1,volumeDelta:5,
    comparableVolumeSeries:[{date:null,volume:20},{date:'2026-11-24T12:00:00Z',volume:21}]});
  assert.doesNotMatch(html,/data-verified-volume-chart/u);
});
test('Client wellbeing keeps the daily action available after a prior-day check-in',()=>{
  assert.equal(deriveClientDayNextAction({wellbeing:{status:'recent'}}).area,'actividad');
  assert.equal(deriveClientDayNextAction({wellbeing:{status:'today'}}).area,'progreso');
});
const coachVm=(overrides={})=>({role:'coach',clients:[{id:'a',name:'Cliente A',serviceActive:true},{id:'b',name:'Cliente B',serviceActive:true}],
  appointments:[],upcoming:[],operations:{},proposals:[],...overrides});
test('Coach without a verified attention snapshot must not report a clear portfolio',()=>{
  const html=renderHoyRoute(coachVm());
  assert.match(html,/El estado de atención de la cartera aún no está disponible/u);
  assert.doesNotMatch(html,/Tu cartera está al día|Cartera al día/u);
  assert.match(html,/data-m26-area="clientes"/u);
});
test('Coach quick portfolio prioritizes known upcoming clients without duplicating them',()=>{
  const html=renderHoyRoute(coachVm({coachCockpit:{attentionCount:0,totalClients:2,items:[]},
    upcoming:[{id:'one',clientId:'b'},{id:'two',clientId:'b'},{id:'foreign',clientId:'other'}]}));
  const section=html.match(/<div class="m26-coach-home-client-grid">([\s\S]*?)<\/section>/u)?.[1];
  assert.ok(section);
  assert.ok(section.indexOf('Cliente B')<section.indexOf('Cliente A'));
  assert.equal((section.match(/data-iberfit-avatar-client="b"/gu)||[]).length,1);
  assert.doesNotMatch(section,/data-iberfit-avatar-client="other"/u);
});
test('Admin uses one capacity contract for missing, invalid and genuine zero hours',()=>{
  for(const assignedHours of [undefined,null,'','  ',false,-1,Infinity]){
    const coach={id:'c',userId:'c',capacityHours:20,assignedHours};
    const evidence=coachCapacityEvidence(coach);
    assert.equal(evidence.assignedHours,null);
    assert.equal(evidence.loadPercent,null);
    const command=deriveAdminCommandCenter({coaches:[coach]}).coachLoad[0];
    assert.equal(command.status,'unknown');
    assert.equal(command.loadPercent,null);
    assert.equal(buildCoach360Rows({coaches:[coach]})[0].loadPercent,null);
  }
  assert.equal(coachCapacityEvidence({capacityHours:20,assignedHours:0}).loadPercent,0);
  assert.equal(coachCapacityEvidence({capacityHours:20,assignedHours:'18'}).loadPercent,90);
  assert.equal(coachCapacityEvidence({capacityHours:0,assignedHours:0}).loadPercent,null);
  assert.equal(coachCapacityEvidence({capacityHours:-20,assignedHours:10}).loadPercent,null);
});
test('New visible copy has four-locale translations',()=>{
  for(const label of ['Citas cumplidas','El estado de atención de la cartera aún no está disponible.','Horas asignadas sin confirmar'])
    for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(label,{language}),label);
});

test('Booked adherence and standalone activity stay separate across summaries',()=>{
  const summary={completedSessions:4,plannedSessions:2,scheduledCompletedSessions:1,adherence:0.5};
  assert.deepEqual(confirmedScheduledCompletion(summary),{planned:2,completed:1,adherence:0.5});
  assert.equal(scheduledCompletionCopy(summary),'Citas cumplidas: 1 / 2');
  const home=renderAthleticClientEvidence({...summary,checkins:0});
  assert.match(home,/1 \/ 2<\/strong><span>Citas cumplidas/u);
  assert.match(home,/4<\/strong><span>Sesiones completadas/u);
  for(const patch of [{scheduledCompletedSessions:null},{scheduledCompletedSessions:3},{adherence:1},{plannedSessions:0},{plannedSessions:'2'}]){
    assert.equal(confirmedScheduledCompletion({...summary,...patch}),null);
    assert.equal(scheduledCompletionCopy({...summary,...patch}),'Sin base suficiente para calcular adherencia');
  }
  assert.ok(confirmedScheduledCompletion({plannedSessions:3,scheduledCompletedSessions:1,adherence:0.333}));
  for(const language of ['en','fr','pt']){
    assert.notEqual(iberfitSurfaceTranslate('Citas cumplidas: 1 / 2 · 28 días',{language}),'Citas cumplidas: 1 / 2 · 28 días');
  }
});
