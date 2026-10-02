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

test('IRI v4 foundation is backward-compatible while photogrammetry stays private/immutable',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261002031500_iri_initial_photogrammetry_v1.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/iri_assessments_initial_only_v4|iri_assessments_step_v4|iri_one_initial_per_client_v1/u);
  assert.doesNotMatch(sql,/create trigger iri_require_physical_consent_v1/u);
  assert.doesNotMatch(sql,/revoke delete on public\.iri_assessments from authenticated, anon/u);
  assert.doesNotMatch(sql,/\\bALTER\\s+TABLE\\b[^;]*\\bDROP\\s+CONSTRAINT\\b/iu);
  assert.doesNotMatch(sql,/\\bDROP\\s+(?:TRIGGER|POLICY)\\b/iu);
  assert.doesNotMatch(sql,/\\bON\\s+CONFLICT\\b[^;]*\\bDO\\s+UPDATE\\b/iu);
  assert.doesNotMatch(sql,/\\bDO\\s+(?:LANGUAGE\\s+\\w+\\s+)?(?:\\$\\w*\\$|\\$\\$)/iu);
  assert.match(sql,/physical_assessment/u);
  assert.match(sql,/photography/u);
  assert.match(sql,/IRI_V4_PHYSICAL_CONSENT_REQUIRED/u);
  assert.match(sql,/revoke all on function public\.iberfit_require_physical_consent_before_iri_confirm_v1\(\) from public/u);
  assert.match(sql,/public\.iri_photogrammetry_captures_v1/u);
  assert.match(sql,/public\.iri_photogrammetry_analyses_v1/u);
  assert.match(sql,/iberfit-iri-photogrammetry/u);
  assert.match(sql,/iberfit-iri-photogrammetry','iberfit-iri-photogrammetry',false,15000000/u);
  assert.doesNotMatch(sql,/create policy iri_photo_object_(?:update|delete)/u);
  assert.match(sql,/original captures are immutable/u);
  assert.match(sql,/create policy iri_photo_object_read_v1[\s\S]+iberfit_iri_consent_active_v1\([\s\S]+,'photography'[\s\S]+c\.status='active'/u);
  assert.match(sql,/create policy iri_photo_object_insert_v1[\s\S]+c\.status='pending_upload'/u);
  assert.match(sql,/iberfit_prepare_iri_photo_v1/u);
  assert.match(sql,/iberfit_finalize_iri_photo_v1/u);
  assert.match(sql,/IRI_V4_PHOTOGRAMMETRY_VALIDATION_INCOMPLETE/u);
  assert.match(sql,/medicalDiagnosis/u);
  assert.match(sql,/interpretation/u);
  assert.doesNotMatch(sql,/iberfit_register_iri_photo_v1/u);
});

test('IRI photogrammetry hardening removes direct anon EXECUTE granted by project defaults',()=>{
  const sql=fs.readFileSync(new URL('../supabase/migrations/20261002104500_iri_photogrammetry_anon_execute_hardening.sql',import.meta.url),'utf8');
  for(const signature of [
    'iberfit_require_physical_consent_before_iri_confirm_v1\\(\\)',
    'iberfit_can_manage_iri_private_v1\\(uuid\\)',
    'iberfit_iri_consent_active_v1\\(uuid,text\\)',
    'iberfit_record_iri_consent_v1\\(uuid,uuid,text,text,text,text\\)',
    'iberfit_prepare_iri_photo_v1\\(uuid,uuid,uuid,text,text,text,bigint,text,integer,integer,text,timestamptz,text\\)',
    'iberfit_finalize_iri_photo_v1\\(uuid,uuid,uuid\\)',
    'iberfit_save_iri_photogrammetry_analysis_v1\\(uuid,uuid,bigint,uuid,uuid,uuid,uuid,jsonb,jsonb,boolean\\)',
    'iberfit_photo_path_uuid_part_v1\\(text,integer\\)',
    'iberfit_photo_path_view_v1\\(text\\)',
    'iberfit_photo_path_is_canonical_v1\\(text\\)',
  ]){
    assert.match(sql,new RegExp(`revoke all on function public\\.${signature} from anon`,'u'));
  }
  assert.doesNotMatch(sql,/grant execute[\s\S]+to anon/iu);
  const triggerHardening=fs.readFileSync(new URL('../supabase/migrations/20261002110500_iri_physical_consent_trigger_internal_only.sql',import.meta.url),'utf8');
  assert.match(triggerHardening,/revoke all on function public\.iberfit_require_physical_consent_before_iri_confirm_v1\(\) from authenticated/u);
});

test('physical consent guard also protects legacy IRI rows already in revisión',()=>{
  const foundation=fs.readFileSync(new URL('../supabase/migrations/20261002031500_iri_initial_photogrammetry_v1.sql',import.meta.url),'utf8');
  const repair=fs.readFileSync(new URL('../supabase/migrations/20261002112000_iri_physical_consent_protected_status_guard_v1.sql',import.meta.url),'utf8');
  for(const sql of [foundation,repair]){
    assert.match(sql,/new\.status in \('revisión','aprobado','publicado'\)[\s\S]+IRI_V4_PHYSICAL_CONSENT_REQUIRED/u);
    assert.doesNotMatch(sql,/old\.status='borrador'/u);
  }
  assert.match(repair,/revoke all on function public\.iberfit_require_physical_consent_before_iri_confirm_v1\(\) from public,anon,authenticated/u);
});

test('physical consent DB enforcement contracts only after the new frontend is live',()=>{
  const foundation=fs.readFileSync(new URL('../supabase/migrations/20261002031500_iri_initial_photogrammetry_v1.sql',import.meta.url),'utf8');
  const enforce=fs.readFileSync(new URL('../supabase/migrations/20261002113000_iri_physical_consent_enforcement.sql',import.meta.url),'utf8');
  assert.doesNotMatch(foundation,/create trigger iri_require_physical_consent_v1|iri_assessments_initial_only_v4|iri_one_initial_per_client_v1/u);
  assert.match(enforce,/iri_assessments_initial_only_v4/u);
  assert.match(enforce,/iri_assessments_step_v4/u);
  assert.match(enforce,/create unique index if not exists iri_one_initial_per_client_v1/u);
  assert.match(enforce,/revoke delete on public\.iri_assessments from authenticated, anon/u);
  assert.match(enforce,/create trigger iri_require_physical_consent_v1[\s\S]+iberfit_require_physical_consent_before_iri_confirm_v1/u);
  assert.doesNotMatch(enforce,/\bdo\s+\$|drop trigger|drop table|delete from|truncate|update\s+public\.iri_assessments/iu);
});

test('photogrammetry source contains no automated diagnosis or automatic landmark inference',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/tensorflow|mediapipe|pose detector|diagnose|diagnóstico automático/iu);
  assert.match(source,/manual-4-point-v1/u);
  assert.match(source,/medicalDiagnosis:null/u);
});
