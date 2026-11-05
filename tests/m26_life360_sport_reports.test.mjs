import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPostSessionSportEvidence} from '../src/m26/workflows/report-sport-evidence.js';
test('sport report fails closed with no workout evidence',()=>{assert.deepEqual(buildPostSessionSportEvidence(null,{}),[]);});
test('running pace uses only measured duration and distance',()=>{
  const execution={clientId:'c1',sport:'running',distanceKm:6.5,durationSeconds:2145};
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.equal(rows.length,3);
  assert.equal(rows[2].text,'5:30 min/km');
});
test('swimming report labels a globally measured pace',()=>{
  const row={clientId:'c1',sport:'swimming',distanceMeters:1000,durationSeconds:1800};
  const data=buildPostSessionSportEvidence(row,{clientId:'c1'});
  assert.equal(data[0].text,'1000 m');
  assert.match(data[2].text,/3:00 min/);
});
