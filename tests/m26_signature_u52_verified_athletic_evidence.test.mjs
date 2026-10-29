import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAthleticClientEvidence} from '../src/m26/design/athletic-client-evidence.js';
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
