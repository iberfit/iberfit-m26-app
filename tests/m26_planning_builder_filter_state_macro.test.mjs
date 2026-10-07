import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=()=>fs.readFileSync('src/m26/app/application.js','utf8');
const controller=()=>fs.readFileSync('src/m26/workflows/session-controller.js','utf8');

test('los filtros viven en sessionUi y nunca dentro del draft persistido',()=>{
  const source=app();
  assert.match(source,/sessionUi=\{draft,query:'',filters:\{\}/u);
  assert.match(source,/filters:sessionUi\.filters\|\|\{\}/u);
  assert.match(source,/setFilter:\(key,value\)=>\{/u);
  assert.match(source,/\['pattern','equipment','difficulty','intent'\]/u);
  assert.doesNotMatch(source,/draft\.filters\s*=/u);
  assert.doesNotMatch(source,/filters:\s*draft\.filters/u);
});

test('cambiar una faceta rerenderiza y recupera foco sin autosave del borrador',()=>{
  const source=controller();
  const match=source.match(/const filter=event\.target\.closest\?\.\('\[data-session-filter\]'\);([\s\S]*?)return;/u);
  assert.ok(match,'falta rama dedicada de filtros');
  const branch=match[1];
  assert.match(branch,/context\.setFilter\?\.\(key,filter\.value\)/u);
  assert.match(branch,/renderSession\(\)/u);
  assert.match(branch,/replacement\?\.focus/u);
  assert.doesNotMatch(branch,/queueAutosave/u);
  assert.doesNotMatch(branch,/autosaveDraft/u);
});