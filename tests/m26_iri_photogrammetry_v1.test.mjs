import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  IRI_PHOTO_LANDMARK_SCHEMA,
  IRI_PHOTO_PROTOCOL_VERSION,
  angleDegrees,
  calculatePhotogrammetryMeasurements,
  median,
  percentAsymmetry,
  photogrammetryDataQuality,
  segmentFromVerticalDegrees,
  segmentTiltDegrees,
  validateManualLandmarks,
} from '../src/m26/workflows/iri-photogrammetry.js';

const landmarks={
  front:{
    shoulderLeft:{x:.25,y:.25},shoulderRight:{x:.75,y:.30},
    pelvisLeft:{x:.35,y:.55},pelvisRight:{x:.65,y:.55},
  },
  back:{
    shoulderLeft:{x:.25,y:.30},shoulderRight:{x:.75,y:.25},
    pelvisLeft:{x:.35,y:.56},pelvisRight:{x:.65,y:.56},
  },
  left:{
    ear:{x:.48,y:.12},shoulder:{x:.50,y:.25},hip:{x:.50,y:.58},ankle:{x:.50,y:.90},
  },
  right:{
    ear:{x:.52,y:.12},shoulder:{x:.50,y:.25},hip:{x:.50,y:.58},ankle:{x:.50,y:.90},
  },
};

test('manual photogrammetry geometry is deterministic and factual',()=>{
  assert.equal(IRI_PHOTO_PROTOCOL_VERSION,'iri-photogrammetry-2026.10-v1');
  assert.equal(IRI_PHOTO_LANDMARK_SCHEMA,'manual-4-point-v1');
  assert.equal(segmentTiltDegrees({x:0,y:0},{x:1,y:0}),0);
  assert.equal(segmentFromVerticalDegrees({x:.5,y:.2},{x:.5,y:.8}),0);
  assert.equal(angleDegrees({x:0,y:.5},{x:.5,y:.5},{x:.5,y:0}),90);
  assert.equal(median([5,1,3]),3);
  assert.equal(median([1,3]),2);
  assert.equal(percentAsymmetry(10,12),18.2);

  const result=calculatePhotogrammetryMeasurements(landmarks);
  assert.equal(result.interpretation,null);
  assert.equal(result.medicalDiagnosis,null);
  assert.ok(result.metrics.some((item)=>item.id==='front.shoulderTilt'));
  assert.ok(result.metrics.some((item)=>item.id==='left.trunkInclination'));
  assert.equal(result.summaries.lateralTrunkAsymmetryPercent,0);
});

test('geometry corrects normalized coordinates with the real image aspect ratio',()=>{
  assert.equal(segmentTiltDegrees({x:0,y:0},{x:.5,y:.5}),45);
  assert.equal(
    segmentTiltDegrees({x:0,y:0},{x:.5,y:.5},{widthPx:1000,heightPx:2000}),
    63.4
  );
  assert.equal(
    segmentFromVerticalDegrees({x:.5,y:.1},{x:.5,y:.9},{widthPx:1200,heightPx:1800}),
    0
  );
  const result=calculatePhotogrammetryMeasurements(landmarks,{
    dimensionsByView:{
      front:{widthPx:1200,heightPx:1800},
      back:{widthPx:1200,heightPx:1800},
      left:{widthPx:1200,heightPx:1800},
      right:{widthPx:1200,heightPx:1800},
    },
  });
  assert.equal(result.geometryBasis.front.aspectCorrected,true);
  assert.equal(result.geometryBasis.front.widthPx,1200);
  assert.equal(result.geometryBasis.front.heightPx,1800);
});

test('manual landmarks are editable coordinates and validation fails closed on missing points',()=>{
  const complete=validateManualLandmarks(landmarks,['front','left']);
  assert.equal(complete.ok,true);
  assert.deepEqual(complete.completeViews,['front','left']);

  const incomplete=structuredClone(landmarks);
  delete incomplete.front.pelvisRight;
  const result=validateManualLandmarks(incomplete,['front']);
  assert.equal(result.ok,false);
  assert.deepEqual(result.missing,['front.pelvisRight']);
});

test('photogrammetry quality distinguishes no photos, captures without analysis, partial and validated four-view analysis',()=>{
  assert.deepEqual(
    photogrammetryDataQuality(),
    {level:'sin_datos',capturedViews:0,analyzedViews:0,validated:false}
  );
  const captures=['front','back','left','right'].map((view)=>({view,status:'active'}));
  assert.equal(photogrammetryDataQuality({captures}).level,'capturas_sin_analisis');
  assert.equal(photogrammetryDataQuality({captures,landmarks:{front:landmarks.front}}).level,'parcial');
  const quality=photogrammetryDataQuality({captures,landmarks,validated:true});
  assert.deepEqual(quality,{level:'completa',capturedViews:4,analyzedViews:4,validated:true});
});

test('IRI v4 migration makes initial diagnosis unique and photogrammetry private/immutable by contract',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261002031500_iri_initial_photogrammetry_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/assessment_type = 'inicial'/u);
  assert.match(sql,/create unique index if not exists iri_one_initial_per_client_v1/u);
  assert.match(sql,/revoke delete on public\.iri_assessments from authenticated, anon/u);
  assert.match(sql,/iri_assessments_initial_only_v4/u);
  assert.match(sql,/iri_assessments_step_v4/u);
  assert.doesNotMatch(sql,/\\bALTER\\s+TABLE\\b[^;]*\\bDROP\\s+CONSTRAINT\\b/iu);
  assert.doesNotMatch(sql,/\\bDROP\\s+(?:TRIGGER|POLICY)\\b/iu);
  assert.doesNotMatch(sql,/\\bON\\s+CONFLICT\\b[^;]*\\bDO\\s+UPDATE\\b/iu);
  assert.doesNotMatch(sql,/\\bDO\\s+(?:LANGUAGE\\s+\\w+\\s+)?(?:\\$\\w*\\$|\\$\\$)/iu);
  assert.match(sql,/physical_assessment/u);
  assert.match(sql,/photography/u);
  assert.match(sql,/IRI_V4_PHYSICAL_CONSENT_REQUIRED/u);
  assert.match(sql,/public\.iri_photogrammetry_captures_v1/u);
  assert.match(sql,/public\.iri_photogrammetry_analyses_v1/u);
  assert.match(sql,/iberfit-iri-photogrammetry/u);
  assert.match(sql,/iberfit-iri-photogrammetry','iberfit-iri-photogrammetry',false,15000000/u);
  assert.match(sql,/allowed_mime_types/u);
  assert.doesNotMatch(sql,/create policy iri_photo_object_(?:update|delete)/u);
  assert.match(sql,/original captures are immutable/u);
  assert.match(sql,/for select to authenticated[\s\S]+iberfit_can_manage_iri_private_v1/u);
  assert.match(sql,/iberfit_iri_consent_active_v1[\s\S]+iberfit_can_manage_iri_private_v1\(c\.client_id\)/u);
  assert.match(sql,/status in \('pending_upload','active','revoked'\)/u);
  assert.match(sql,/iberfit_prepare_iri_photo_v1/u);
  assert.match(sql,/iberfit_finalize_iri_photo_v1/u);
  assert.match(sql,/c\.status='pending_upload'/u);
  assert.match(sql,/v_row\.status='active'/u);
  assert.match(sql,/iberfit_photo_landmarks_complete_v1/u);
  assert.match(sql,/iberfit_photo_measurements_valid_v1/u);
  assert.match(sql,/IRI_V4_PHOTOGRAMMETRY_VALIDATION_INCOMPLETE/u);
  assert.match(sql,/p_front_capture_id is null[\s\S]+p_right_capture_id is null/u);
  assert.match(sql,/medicalDiagnosis/u);
  assert.match(sql,/interpretation/u);
  assert.doesNotMatch(sql,/iberfit_register_iri_photo_v1/u);
});

test('photogrammetry source contains no automated diagnosis or automatic landmark inference',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/tensorflow|mediapipe|pose detector|diagnose|diagnóstico automático/iu);
  assert.match(source,/manual-4-point-v1/u);
  assert.match(source,/medicalDiagnosis:null/u);
});
