import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  iriPhotoAnalysisMatchesCapture,
  landmarksForLatestCaptures,
} from '../src/m26/workflows/iri-photogrammetry-controller.js';

test('landmarks validated for an old original are discarded when a view is replaced',()=>{
  const analysis={
    frontCaptureId:'11111111-1111-4111-8111-111111111111',
    validatedLandmarks:{
      front:{
        shoulderLeft:{x:.2,y:.3},
        shoulderRight:{x:.8,y:.3},
        pelvisLeft:{x:.3,y:.6},
        pelvisRight:{x:.7,y:.6},
      },
    },
  };
  const oldCapture={id:'11111111-1111-4111-8111-111111111111',view:'front',status:'active'};
  const replacement={id:'22222222-2222-4222-8222-222222222222',view:'front',status:'active'};
  assert.equal(iriPhotoAnalysisMatchesCapture(analysis,oldCapture,'front'),true);
  assert.equal(iriPhotoAnalysisMatchesCapture(analysis,replacement,'front'),false);
  assert.deepEqual(landmarksForLatestCaptures(analysis,{front:replacement}),{});
  assert.ok(landmarksForLatestCaptures(analysis,{front:oldCapture}).front.shoulderLeft);
});

test('IRI route exposes optional four-view workspace and explicit physical consent',()=>{
  const source=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(source,/name="physicalAssessmentConsent"/u);
  assert.match(source,/iriStep\(6,'fotografia','Fotogrametría · opcional'/u);
  assert.match(source,/data-iri-photogrammetry-host/u);
  assert.match(source,/Fotografía','Revisión/u);
  assert.match(source,/Proceso guiado de 8 etapas/u);
});

test('authenticated application mounts and destroys photogrammetry controller',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(source,/createIriPhotogrammetryController/u);
  assert.match(source,/name:'iri-photogrammetry',controller:iriPhotogrammetry/u);
  assert.match(source,/ensureIriPhysicalConsent:\(payload\)=>iriPhotogrammetry\.ensurePhysicalConsent\(payload\)/u);
  assert.match(source,/iriPhotogrammetry\?\.destroy\?\.\(\)/u);
});

test('IRI confirmation fails closed without physical consent service',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(source,/assertPhysicalAssessmentConsent/u);
  assert.match(source,/M26_IRI_PHYSICAL_CONSENT_REQUIRED/u);
  assert.match(source,/M26_IRI_PHYSICAL_CONSENT_SERVICE_UNAVAILABLE/u);
  assert.match(source,/ensureIriPhysicalConsent/u);
});

test('photo originals stay outside baseline report contract by default',()=>{
  const report=fs.readFileSync(new URL('../src/m26/workflows/iri-report-document.js',import.meta.url),'utf8');
  assert.doesNotMatch(report,/iri_photogrammetry_captures|iri-photogrammetry|objectPath|signedUrl/iu);
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  assert.match(controller,/No se incluyen en el informe por defecto/u);
});

test('photogrammetry workspace has mobile, keyboard, touch and strict-CSP affordances',()=>{
  const css=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.css',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  assert.match(css,/touch-action:none/u);
  assert.match(css,/:focus-visible/u);
  assert.match(css,/@media\(max-width:640px\)/u);
  assert.match(css,/\.m26-photo-point-hit/u);
  assert.match(controller,/class="m26-photo-point"/u);
  assert.match(controller,/transform="translate\(/u);
  assert.match(controller,/setAttribute\?\.\('transform'/u);
  assert.doesNotMatch(controller,/\.style\.(?:left|top)/u);
});
