import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller=()=>fs.readFileSync('src/m26/workflows/session-controller.js','utf8');

test('el foco del builder se recupera tras mutaciones que rerenderizan',()=>{
  const source=controller();
  assert.match(source,/function focusBuilderBlock\(blockId,\{action=null,scrollOnNarrow=false\}=\{\}\)/u);
  assert.match(source,/if\(outcome\.ok&&builderFocusBlockId\)focusBuilderBlock\(builderFocusBlockId,\{action:builderFocusAction,scrollOnNarrow:builderFocusScroll\}\)/u);
});

test('crear grupo y duplicar identifican el bloque recién creado',()=>{
  const source=controller();
  assert.match(source,/\['add-exercise','add-group','duplicate-block'\]\.includes\(action\)/u);
  assert.match(source,/find\(\(item\)=>item\?\.id&&!builderInsertContext\.blockIds\.has\(item\.id\)\)/u);
});

test('mover mantiene foco en el mismo control para movimientos sucesivos',()=>{
  const source=controller();
  assert.match(source,/\['move-up','move-down'\]\.includes\(action\)&&payload\.blockId/u);
  assert.match(source,/const focusTarget=action\?target\.querySelector\?\./u);
  assert.ok(source.includes('[data-session-action="${action}"]'));
});

test('scroll automático solo se fuerza en inserciones/restauración y ancho estrecho',()=>{
  const source=controller();
  assert.match(source,/if\(scrollOnNarrow&&narrow\)/u);
  assert.match(source,/action==='restore-block'&&payload\.snapshot\?\.block\?\.id/u);
  assert.doesNotMatch(source,/function focusBuilderInsertedBlock/u);
});