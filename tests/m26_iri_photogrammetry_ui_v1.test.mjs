import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  iriPhotoAnalysisMatchesCapture,
  iriPhotoMutationRequiresReload,
  iriPhotoLoadStillCurrent,
  iriPhotoAutoLoadEligible,
  iriPhotoAutomaticLoadDecision,
  iriPhotoLoadStatusMarkup,
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

test('photogrammetry observer ignores self-renders and reloads for route/context mutations',()=>{
  const child={kind:'workspace-child'};
  const outside={kind:'route-shell'};
  const host={contains:(node)=>node===child};

  assert.equal(iriPhotoMutationRequiresReload([{target:host}],host),false);
  assert.equal(iriPhotoMutationRequiresReload([{target:child}],host),false);
  assert.equal(iriPhotoMutationRequiresReload([{target:outside}],host),true);
  assert.equal(iriPhotoMutationRequiresReload([{target:outside}],null),true);
});

test('optional IRI photography does not prefetch Supabase while stage 7 is hidden',()=>{
  const step={
    hidden:true,
    hasAttribute:(name)=>name==='hidden',
    getAttribute:(name)=>name==='data-iri-step'?'fotografia':null,
  };
  const host={isConnected:true,closest:()=>step};
  assert.equal(iriPhotoAutoLoadEligible(host),false,'initial step must not fetch photos');
  step.hidden=false;
  step.hasAttribute=()=>false;
  assert.equal(iriPhotoAutoLoadEligible(host),true,'first explicit photo stage opens the load');
  step.hidden=true;
  step.hasAttribute=(name)=>name==='hidden';
  assert.equal(iriPhotoAutoLoadEligible(host),false,'leaving the step suspends background reads');
  assert.equal(iriPhotoAutoLoadEligible({...host,isConnected:false}),false,'detached DOM cannot load');
  assert.equal(iriPhotoAutoLoadEligible(null),false);
  assert.equal(iriPhotoAutoLoadEligible({closest:()=>null}),true,'legacy standalone host is supported');
  assert.equal(iriPhotoAutoLoadEligible({closest:()=>({...step,hidden:false,
    hasAttribute:()=>false,getAttribute:()=> 'revision'})}),false,
  'photo reads must not start from an unrelated IRI step');
});

test('IRI photo auto-load never retries a failed view or subscribes twice to one in-flight GET',()=>{
  const step={hidden:false,hasAttribute:()=>false,getAttribute:()=> 'fotografia'};
  const host={isConnected:true,closest:()=>step};
  const key='coach:client-A:iri-A';
  const base={hostNode:host,contextKey:key,nextKey:key};
  assert.equal(iriPhotoAutomaticLoadDecision(base),'ready');
  assert.equal(iriPhotoAutomaticLoadDecision({...base,loadError:'No se pudo cargar'}),'explicit-retry',
    'an error requires an explicit retry instead of another read on every DOM rerender');
  assert.equal(iriPhotoAutomaticLoadDecision({...base,loadError:'No se pudo cargar',nextKey:'coach:client-B:iri-B'}),'ready',
    'switching dossier scopes permits an independent read, never reuses old private state');
  assert.equal(iriPhotoAutomaticLoadDecision({...base,loadInFlight:true,loadInFlightKey:key,
    loadInFlightHost:host}),'in-flight');
  assert.equal(iriPhotoAutomaticLoadDecision({...base,loadInFlight:true,loadInFlightKey:key,
    loadInFlightHost:{}}),'ready','a replaced host can recover independently');
  step.hidden=true;
  step.hasAttribute=(name)=>name==='hidden';
  assert.equal(iriPhotoAutomaticLoadDecision({...base,loadError:'No se pudo cargar'}),'hidden');
});

test('photogrammetry subscription detects hidden stage transitions and retains explicit operations',()=>{
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  const route=fs.readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(route,/iriStep\(6,'fotografia','Fotogrametría · opcional'/u);
  assert.match(route,/index===0\?' is-active':''/u);
  assert.match(controller,/if\(!iriPhotoAutoLoadEligible\(host\(\)\)\)return;/u);
  assert.match(controller,/if\(!force&&!iriPhotoAutoLoadEligible\(node\)\)return null;/u);
  assert.match(controller,/if\(!force&&loadError&&contextKey===key\)/u);
  assert.match(controller,/if\(decision==='explicit-retry'\)\{render\(\);return;\}/u);
  assert.match(controller,/attributeFilter:\['hidden'\]/u);
  assert.match(controller,/const snapshot=await service\.state\(token,\{assessmentId:requested\}\)/u,
    'consent-gated on-demand PDF reads remain reachable from other IRI steps');
  assert.match(controller,/if\(retry\)/u);
  assert.match(controller,/void load\(\{force:true\}\)\.catch\(reportLoadError\)/u,
    'explicit recovery remains available');
});

test('photogrammetry load is single-flight per dossier context',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  assert.match(source,/loadInFlight&&loadInFlightKey===key/u);
  assert.match(source,/return loadInFlight/u);
  assert.match(source,/if\(loadInFlight===run\)\{loadInFlight=null;loadInFlightKey='';loadInFlightHost=null;\}/u);
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
  assert.match(source,/getIriPhotogrammetryReport:\(assessmentId,\{variant='client'\}=\{\}\)=>iriPhotogrammetry\.clientSnapshotForPdf\(assessmentId,\{audience:variant==='coach'\?'coach':'client'\}\)/u);
  assert.match(source,/iriPhotogrammetry\?\.destroy\?\.\(\)/u);
});

test('IRI confirmation fails closed without physical consent service',()=>{
  const source=fs.readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(source,/assertPhysicalAssessmentConsent/u);
  assert.match(source,/M26_IRI_PHYSICAL_CONSENT_REQUIRED/u);
  assert.match(source,/M26_IRI_PHYSICAL_CONSENT_SERVICE_UNAVAILABLE/u);
  assert.match(source,/ensureIriPhysicalConsent/u);
});

test('report generation uses consent-gated photogrammetry without exposing storage paths',()=>{
  const report=fs.readFileSync(new URL('../src/m26/workflows/iri-report-document.js',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(report,/renderPhotogrammetryReport/u);
  assert.match(report,/REGISTRO FOTOGRÁFICO/u);
  assert.doesNotMatch(report,/iri_photogrammetry_captures_v1|object_path/iu);
  assert.match(controller,/clientSnapshotForPdf/u);
  assert.match(controller,/photographyConsent/u);
  assert.match(controller,/const urls=photosAllowed\?await signedUrlsFor\(snapshot,token\):\{\}/u);
  assert.match(app,/getIriPhotogrammetryReport:\(assessmentId,\{variant='client'\}=\{\}\)=>iriPhotogrammetry\.clientSnapshotForPdf\(assessmentId,\{audience:variant==='coach'\?'coach':'client'\}\)/u);
});

test('photogrammetry workspace has mobile, keyboard, touch and strict-CSP affordances',()=>{
  const css=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.css',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  assert.match(css,/touch-action:pan-y pinch-zoom/u);
  assert.match(css,/\.m26-photo-point\{[^}]*touch-action:none/u);
  assert.match(css,/:focus-visible/u);
  assert.match(css,/@media\(max-width:640px\)/u);
  assert.match(css,/\.m26-photo-point-hit/u);
  assert.match(controller,/class="m26-photo-point"/u);
  assert.match(controller,/transform="translate\(/u);
  assert.match(controller,/setAttribute\?\.\('transform'/u);
  assert.doesNotMatch(controller,/\.style\.(?:left|top)/u);
  assert.match(controller,/data-iri-photo-canvas/u);
  assert.match(controller,/data-iri-photo-view-select/u);
  assert.match(controller,/data-iri-analysis-revision/u);
  assert.match(css,/\.m26-photo-view-selector/u);
  assert.match(css,/\.m26-photo-view\.is-active/u);
  assert.match(controller,/stagePoint\(canvas,event\)/u);
  assert.match(css,/\.m26-photo-canvas\{position:relative/u);
});

test('stale optional IRI loads never masquerade as live Coach errors, but active timeouts remain observable',()=>{
  const hostA={},hostB={};
  const ctx={role:'coach',clientId:'client-A',assessmentId:'iri-A',canManage:true};
  const input={mounted:true,originalHost:hostA,currentHost:hostA,originalKey:'coach:client-A:iri-A',currentKey:'coach:client-A:iri-A',currentContext:ctx};
  assert.equal(iriPhotoLoadStillCurrent(input),true,'active panel must retain genuine HTTP timeout reporting');
  assert.equal(iriPhotoLoadStillCurrent({...input,currentHost:null}),false,'navigated-away route');
  assert.equal(iriPhotoLoadStillCurrent({...input,currentHost:hostB}),false,'remounted panel with same ids');
  assert.equal(iriPhotoLoadStillCurrent({...input,currentContext:{...ctx,assessmentId:'iri-B'}}),false,'switched IRI assessment');
  assert.equal(iriPhotoLoadStillCurrent({...input,currentContext:{...ctx,clientId:'client-B'}}),false,'switched client');
  assert.equal(iriPhotoLoadStillCurrent({...input,currentContext:{...ctx,canManage:false}}),false,'privilege lost');
  assert.equal(iriPhotoLoadStillCurrent({...input,currentKey:'coach:client-A:iri-B'}),false,'a newer async load owns the panel');
  assert.equal(iriPhotoLoadStillCurrent({...input,mounted:false}),false,'destroyed controller/logout');
});

test('IRI photo failed initial load visibly recovers without a perpetual loading spinner or data leaks',()=>{
  const loading=iriPhotoLoadStatusMarkup();
  assert.match(loading,/role="status"/u);
  assert.match(loading,/Cargando evidencia fotográfica privada/u);
  const failure=iriPhotoLoadStatusMarkup('La conexión se interrumpió. Puedes reintentar.');
  assert.match(failure,/role="alert"/u);
  assert.match(failure,/data-iri-photo-retry/u);
  assert.match(failure,/Reintentar carga privada/u);
  assert.doesNotMatch(failure,/Cargando evidencia fotográfica privada/u);
  assert.equal(iriPhotoLoadStatusMarkup('<script>private</script>').includes('<script>'),false);
  assert.match(iriPhotoLoadStatusMarkup('<script>'),/&lt;script&gt;/u);
  const source=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry-controller.js',import.meta.url),'utf8');
  assert.match(source,/loadError=friendlyIriPhotoError\(error\)/u);
  assert.match(source,/void load\(\{force:true\}\)\.catch\(reportLoadError\)/u);
  assert.match(source,/if\(!mounted\|\|loadInFlight\)return/u);
  assert.match(source,/loadError='';signedUrls/u);
  assert.match(source,/loadError=friendlyIriPhotoError\(error\);\s*render\(\);\s*throw error/u);

  const css=fs.readFileSync(new URL('../src/m26/workflows/iri-photogrammetry.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-photo-recovery\{display:flex/u);
  assert.match(css,/\.m26-photo-recovery button:focus-visible/u);
  assert.match(css,/@media\(max-width:640px\)\{\.m26-photo-recovery\{flex-direction:column/u);
});
