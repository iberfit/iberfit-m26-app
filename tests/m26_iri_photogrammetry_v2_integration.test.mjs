import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('IRI photogrammetry v2 is wired end-to-end without deleting v1 fallback',()=>{
  const service=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-service.js',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  const application=fs.readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const workflow=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(service,/iri_photogrammetry_analyses_v2/u);
  assert.match(service,/analysis:analysisV2\|\|analysisV1/u);
  assert.match(service,/iri_photo_report_permissions_v1/u);
  assert.match(service,/saveAnalysisV2/u);
  assert.match(controller,/calculatePhotogrammetryMeasurementsV2/u);
  assert.match(controller,/buildIriPhotogrammetryDecisionSupport/u);
  assert.match(controller,/data-iri-photo-calibrate/u);
  assert.match(controller,/setReportPermission/u);
  assert.match(controller,/audience='client'/u);
  assert.match(application,/audience:variant==='coach'\?'coach':'client'/u);
  assert.match(workflow,/getIriPhotogrammetryReport\(draft\.assessmentId,\{variant\}\)/u);
});

test('client-report image permission is independent from private photography consent',()=>{
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  const report=fs.readFileSync(new URL('../src/m26/workflows/iri-report-visuals.js',import.meta.url),'utf8');
  assert.match(controller,/photosAllowed=targetAudience==='coach'\|\|snapshot\.reportPermission\?\.status==='granted'/u);
  assert.match(controller,/const urls=photosAllowed\?await signedUrlsFor\(snapshot,token\):\{\}/u);
  assert.match(report,/Análisis sin imágenes publicadas/u);
  assert.match(report,/fotografías no están autorizadas/u);
});

test('workspace exposes live segments and calibrated measurements while remaining non-medical',()=>{
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  const geometry=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-v2.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.css',import.meta.url),'utf8');
  assert.match(controller,/data-iri-photo-segment/u);
  assert.match(geometry,/Diferencia vertical/u);
  assert.match(controller,/Escala física opcional/u);
  assert.match(controller,/Sin diagnóstico médico automático/u);
  assert.match(css,/\.m26-photo-segment line/u);
  assert.match(css,/\.m26-photo-calibration/u);
  assert.match(css,/touch-action:pan-y pinch-zoom/u);
});
