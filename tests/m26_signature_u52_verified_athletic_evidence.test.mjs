import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAthleticClientEvidence} from '../src/m26/design/athletic-client-evidence.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
test('No confirmed evidence means no fabricated athletic chart',()=>{
 assert.equal(renderAthleticClientEvidence(null),'');
 assert.equal(renderAthleticClientEvidence({completedSessions:0,plannedSessions:4,adherence:0,checkins:0,iriBaseline:{score:100}}),'');
});
test('Sessions, adherence and comparable delta use factual values',()=>{
 const h=renderAthleticClientEvidence({completedSessions:3,plannedSessions:4,adherence:.75,volumeDelta:11.3,checkins:0});
 assert.match(h,/Sesiones completadas/u);assert.match(h,/75%/u);assert.match(h,/\+11\.3%/u);
 assert.match(h,/data-m26-area="progreso"/u);assert.doesNotMatch(h,/start-published-session|data-m26-area="sesion"/u);
});
test('Wellbeing dials only from valid numeric last check-in values',()=>{
 const h=renderAthleticClientEvidence({checkins:1,latestCheckinAt:'2026-10-27T12:00:00Z',latestCheckin:{energy:8,sleep:6,stress:3,motivation:7}});
 assert.equal((h.match(/class="m26-athletic-dial"/gu)||[]).length,4);
 assert.match(h,/Último registro/u);assert.doesNotMatch(h,/Sesiones completadas/u);
 const i=renderAthleticClientEvidence({checkins:1,latestCheckin:{energy:99,sleep:'7',stress:5,motivation:-1}});
 assert.equal((i.match(/class="m26-athletic-dial"/gu)||[]).length,1);
});

test('Authenticated Client Today prioritizes confirmed progress before secondary plan context',()=>{
 const h=renderHoyRoute({role:'client',serviceKind:'training',clients:[{id:'c1',name:'Cliente QA',serviceActive:true}],appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{},
 clientProgressSummary:{completedSessions:2,plannedSessions:2,adherence:1,volumeDelta:null,checkins:0}});
 const progress=h.indexOf('data-client-confirmed-evidence');
 const glance=h.indexOf('class="m26-client-home-glance"');
 assert.ok(progress>0&&glance>progress);
 assert.equal(h.split('data-workflow-action="start-published-session"').length-1,0);
});


test('U53 only plots confirmed comparable time ordered volume series in vector SVG',()=>{
  const base={completedSessions:2,plannedSessions:2,adherence:1,volumeDelta:12.5,checkins:0};
  const rows=[
    {date:'2026-10-21T12:00:00.000Z',volume:320},
    {date:'2026-10-28T12:00:00.000Z',volume:360},
  ];
  const h=renderAthleticClientEvidence({...base,comparableVolumeSeries:rows});
  assert.match(h,/data-verified-volume-chart/u);
  assert.match(h,/<svg viewBox="0 0 370 180"/u);
  assert.match(h,/kg·rep/u);
  assert.match(h,/360 kg × repeticiones/u);
  assert.match(h,/escala desde cero/u);
  assert.match(h,/aria-label="Volumen confirmado/u);
  assert.ok(h.includes('line')&&h.includes('polyline'));
  assert.ok(h.indexOf('data-verified-volume-chart')>h.indexOf('Sesiones completadas'));
  assert.doesNotMatch(h,/linearGradient|data-workflow-action="start-published-session"/u);
  assert.doesNotMatch(renderAthleticClientEvidence({...base,volumeDelta:null,comparableVolumeSeries:rows}),/data-verified-volume-chart/u);
  assert.doesNotMatch(renderAthleticClientEvidence({...base,comparableVolumeSeries:[rows[1],rows[0]]}),/data-verified-volume-chart/u);
  assert.doesNotMatch(renderAthleticClientEvidence({...base,comparableVolumeSeries:[{date:'not a date',volume:30},rows[1]]}),/data-verified-volume-chart/u);
  assert.doesNotMatch(renderAthleticClientEvidence({...base,comparableVolumeSeries:[{date:rows[0].date,volume:-10},rows[1]]}),/data-verified-volume-chart/u);
});
test('U53 home continuity never inserts using a nested node from the new editorial hero',()=>{
 const source=readFileSync('src/m26/ui/progress-continuity.js','utf8');
 const engine=readFileSync('src/m26/engagement/progress-engine.js','utf8');
 const css=readFileSync('src/m26/design/iberfit-premium-v3.css','utf8');
 assert.match(source,/node\?\.parentNode===host/u,'insertBefore reference must be owned by its parent');
 assert.match(source,/host\.querySelector\?\.\(':scope > \.m26-athletic-evidence'\)/u);
 assert.doesNotMatch(source,/host\.insertBefore\(section,anchor\.nextSibling\);\s*else if\(anchor\)/u);
 assert.match(engine,/const comparableVolumeSeries=comparableVolumes/u);
 assert.match(engine,/volumeSeries\.slice\(-16\)/u);
 assert.match(css,/shape-rendering:geometricPrecision/u);
 assert.match(css,/vector-effect:non-scaling-stroke/u);
});

test('U56 high-density SVG keeps five honest grid lines and last confirmed observation',()=>{
 const h=renderAthleticClientEvidence({
  completedSessions:2,plannedSessions:2,adherence:1,volumeDelta:12.5,checkins:0,
  comparableVolumeSeries:[{date:'2026-10-21T12:00:00.000Z',volume:320},{date:'2026-10-28T12:00:00.000Z',volume:360}],
 });
 assert.equal((h.match(/<line class="m26-athletic-chart-grid/g)||[]).length,5);
 assert.match(h,/class="m26-athletic-chart-last-halo"/u);
 assert.match(h,/Último <strong>360<\/strong> kg·rep/u);
 assert.match(h,/text-anchor="end">180<\/text>/u);
 assert.doesNotMatch(h,/linearGradient|filter="url|iriBaseline/u);
});
