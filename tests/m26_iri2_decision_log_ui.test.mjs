import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('IRI route exposes a confirmed-only longitudinal decision log',()=>{
  const vm=read('src/m26/modules/route-view-model.js');
  const render=read('src/m26/modules/route-render.js');

  assert.match(vm,/filter\(\(record\)=>compactIri\(record\)\?\.confirmed\)/u);
  assert.match(vm,/confirmedFirstSessionDraft\(record,clientId\)/u);
  assert.match(vm,/buildIri2DecisionLog\(\{assessments:confirmedDecisionDrafts\}\)/u);
  assert.match(render,/data-iri-decision-log/u);
  assert.match(render,/Historial de decisiones/u);
  assert.match(render,/Qué se decidió y por qué/u);
  assert.match(render,/no los interpreta automáticamente como mejor o peor/u);
});

test('decision log UI remains compact and factual instead of inventing a score or causal judgement',()=>{
  const render=read('src/m26/modules/route-render.js');
  const model=read('src/m26/workflows/iri-2-longitudinal.js');

  assert.match(render,/reverse\(\)\.slice\(0,4\)/u);
  assert.match(render,/Prioridades añadidas:/u);
  assert.match(render,/Plan acordado actualizado/u);
  assert.doesNotMatch(render,/decisionScore|score de decisión|mejoró por|empeoró por/ui);
  assert.doesNotMatch(model,/compositeScore|decisionScore/u);
  assert.match(model,/reviewAccepted===true/u);
  assert.match(model,/clientId===scope/u);
});
