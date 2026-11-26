import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {recoveryObservations,bodyMeasurements,measuredNumber} from '../src/m26/workflows/iri-report-measurements.js';
import {renderEffortCurve} from '../src/m26/workflows/iri-report-visuals.js';
test('shared IRI measurement contract parity',()=>assert.equal(readFileSync('src/m26/workflows/iri-report-measurements.js','utf8'),readFileSync('supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-report-measurements.js','utf8')));
test('recovery phases and missing minutes are never connected',()=>{
 const g=recoveryObservations({restingHr:70,finalHr:150,twoMinuteHr:100});
 assert.deepEqual(g.points.map(p=>p.index),[0,1,3]);assert.equal(g.segments.length,0);
 assert.equal(recoveryObservations({finalHr:150,oneMinuteHr:110,twoMinuteHr:100}).segments.length,2);
 assert.equal(recoveryObservations({skipped:true,finalHr:150,oneMinuteHr:110}).points.length,0);
 assert.equal(recoveryObservations({finalHr:'0x80',oneMinuteHr:0,twoMinuteHr:999}).points.length,0);
 const html=renderEffortCurve({restingHr:70,finalHr:150,twoMinuteHr:100});assert.doesNotMatch(html,/<path /);assert.match(html,/1 min/);
});
test('body composition does not conflate muscle and lean mass or fabricate skipped results',()=>{
 const b=bodyMeasurements({weightKg:80,bodyFatPercent:25,muscleMassKg:30,leanMassKg:95});
 assert.equal(b.fatMassKg,20);assert.equal(b.leanMassKg,60);assert.equal(b.muscleMassKg,30);assert.equal(b.leanMassDerived,true);
 assert.equal(bodyMeasurements({weightKg:80,muscleMassKg:30}).leanMassKg,null);
 assert.equal(bodyMeasurements({skipped:true,weightKg:80,bodyFatPercent:25}).weightKg,null);
 assert.equal(bodyMeasurements({bodyFatPercent:101,weightKg:'0x50'}).bodyFatPercent,null);
 assert.equal(measuredNumber('8,5'),8.5);assert.equal(measuredNumber(false),null);
});
