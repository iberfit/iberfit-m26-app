import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('IRI final experience keeps product hierarchy distinct from generic SaaS card density',()=>{
  const route=read('src/m26/modules/route-render.js');
  const css=read('src/m26/shell/shell.css');
  assert.match(route,/m26-iri-context-glance/u);
  assert.match(route,/Mesa de decisión/u);
  assert.match(route,/Contexto confirmado/u);
  assert.match(css,/IRI FINAL EXPERIENCE V1/u);
  assert.match(css,/\.m26-report-choice\{gap:0;border-top/u);
  assert.match(css,/\.m26-review-summary>div\{[^}]*border:0;border-top:2px/u);
});

test('photogrammetry behaves as one active technical study view with explicit revision state',()=>{
  const controller=read('src/m26/workflows/iri-photogrammetry-controller.js');
  const css=read('src/m26/workflows/iri-photogrammetry.css');
  const qa=read('qa/coach-iri-document-privileged/iri-document-privileged.spec.mjs');
  assert.match(controller,/activeView='front'/u);
  assert.match(controller,/data-iri-photo-view-select/u);
  assert.match(controller,/data-iri-analysis-revision/u);
  assert.match(css,/IRI PHOTOGRAMMETRY STUDIO V3/u);
  assert.match(css,/grid-template-areas:"head head" "stage actions"/u);
  assert.doesNotMatch(qa,/match\(\/\(\\d\+\)\/u\)/u);
  assert.match(qa,/data-iri-analysis-revision/u);
});
