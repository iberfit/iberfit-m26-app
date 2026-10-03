import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  IRI_PHOTO_LANDMARK_SCHEMA_V2,
  IRI_PHOTO_PROTOCOL_VERSION_V2,
  calibrationPixelsPerCm,
  calculatePhotogrammetryMeasurementsV2,
  horizontalDifferenceCm,
  normalizePhotoCalibration,
  segmentDistanceCm,
  verticalDifferenceCm,
} from '../src/m26/workflows/iri-photogrammetry-v2.js';
import {buildIriPhotogrammetryDecisionSupport} from '../src/m26/workflows/iri-evidence-engine.js';

const dimensions={widthPx:1000,heightPx:2000};
const calibration={
  knownLengthCm:100,
  pointA:{x:.1,y:.1},
  pointB:{x:.1,y:.6},
  label:'Referencia 100 cm',
};
const landmarks={
  front:{shoulderLeft:{x:.25,y:.25},shoulderRight:{x:.75,y:.30},pelvisLeft:{x:.35,y:.55},pelvisRight:{x:.65,y:.57}},
  back:{shoulderLeft:{x:.25,y:.25},shoulderRight:{x:.75,y:.30},pelvisLeft:{x:.35,y:.55},pelvisRight:{x:.65,y:.57}},
  left:{ear:{x:.48,y:.12},shoulder:{x:.50,y:.25},hip:{x:.50,y:.58},ankle:{x:.50,y:.90}},
  right:{ear:{x:.52,y:.12},shoulder:{x:.50,y:.25},hip:{x:.50,y:.58},ankle:{x:.50,y:.90}},
};

test('v2 calibration converts only from an explicit known reference',()=>{
  assert.equal(IRI_PHOTO_PROTOCOL_VERSION_V2,'iri-photogrammetry-2026.10-v2');
  assert.equal(IRI_PHOTO_LANDMARK_SCHEMA_V2,'manual-calibrated-4-point-v2');
  assert.deepEqual(normalizePhotoCalibration(calibration),calibration);
  assert.equal(calibrationPixelsPerCm(calibration,dimensions),10);
  assert.equal(segmentDistanceCm({x:.1,y:.1},{x:.1,y:.2},calibration,dimensions),20);
  assert.equal(horizontalDifferenceCm({x:.1,y:.1},{x:.2,y:.1},calibration,dimensions),10);
  assert.equal(verticalDifferenceCm({x:.1,y:.1},{x:.1,y:.2},calibration,dimensions),20);
  assert.equal(segmentDistanceCm({x:.1,y:.1},{x:.1,y:.2},null,dimensions),null);
});

test('v2 measurements preserve angles and add cm only for calibrated views',()=>{
  const result=calculatePhotogrammetryMeasurementsV2(landmarks,{
    dimensionsByView:Object.fromEntries(['front','back','left','right'].map((view)=>[view,dimensions])),
    calibrationByView:{front:calibration,left:calibration},
  });
  assert.equal(result.schema,'iri-photogrammetry-measurements-v2');
  assert.equal(result.medicalDiagnosis,null);
  assert.equal(result.summaries.calibratedViews,2);
  assert.ok(result.metrics.some((item)=>item.id==='front.shoulderTilt'&&item.unit==='deg'));
  assert.ok(result.metrics.some((item)=>item.id==='front.shoulderHeightDifference'&&item.unit==='cm'));
  assert.ok(!result.metrics.some((item)=>item.id==='back.shoulderHeightDifference'));
  assert.equal(result.geometryBasis.front.calibrated,true);
  assert.equal(result.geometryBasis.back.calibrated,false);
});

test('decision support is deterministic, non-medical and strengthens repeated evidence with movement context',()=>{
  const measurements=calculatePhotogrammetryMeasurementsV2(landmarks,{
    dimensionsByView:Object.fromEntries(['front','back','left','right'].map((view)=>[view,dimensions])),
  });
  const support=buildIriPhotogrammetryDecisionSupport({
    measurements,
    quality:{level:'completa',validated:true},
    draft:{mobility:{ankle:{asymmetryCm:2.5},assistedSquat:{lateralShift:'Desplazamiento lateral visible'}}},
  });
  assert.equal(support.available,true);
  assert.equal(support.medicalDiagnosis,null);
  assert.ok(support.findings.some((item)=>item.id==='pelvis-tilt-reproduced'&&item.support==='multi_source'));
  assert.ok(support.findings.some((item)=>item.id==='ankle-asymmetry-context'));
  assert.match(support.limitations.join(' '),/no emite diagnóstico médico/i);
});

test('decision support fails closed without validated complete capture',()=>{
  const support=buildIriPhotogrammetryDecisionSupport({
    measurements:{metrics:[]},
    quality:{level:'parcial',validated:false},
    draft:{},
  });
  assert.equal(support.available,false);
  assert.equal(support.findings.length,0);
  assert.equal(support.medicalDiagnosis,null);
});

test('v2 SQL is additive, immutable by revision and separates client-report photo permission',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261003190000_iri_photogrammetry_decision_engine_v2.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists public\.iri_photogrammetry_analyses_v2/u);
  assert.match(sql,/unique \(assessment_id,revision\)/u);
  assert.match(sql,/create table if not exists public\.iri_photo_report_permissions_v1/u);
  assert.match(sql,/iberfit_record_iri_photo_report_permission_v1/u);
  assert.match(sql,/iberfit_save_iri_photogrammetry_analysis_v2/u);
  assert.doesNotMatch(sql,/drop\s+(?:table|constraint|policy|trigger)/iu);
  assert.doesNotMatch(sql,/alter table public\.iri_consents_v1/iu);
  assert.doesNotMatch(sql,/update\s+public\.iri_photogrammetry_analyses_v1/iu);
  assert.doesNotMatch(sql,/delete\s+from/iu);
  assert.doesNotMatch(sql,/medicalDiagnosis[^\n]*[^n]ull/iu);
});
