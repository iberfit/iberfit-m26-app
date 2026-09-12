import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n?/gu,'\n');

test('tablet portrait metric grids retain two readable columns after the full adaptive cascade',()=>{
  const css=read('src/m26/design/adaptive-layout.css');
  const marker=css.lastIndexOf('P0 · tablet portrait metric legibility');
  assert.ok(marker>=0,'final tablet portrait legibility override must exist');
  const tail=css.slice(marker);
  assert.match(tail,/@media \(orientation: portrait\) and \(min-width: 901px\) and \(max-width: 1100px\)/u);
  assert.match(tail,/\[data-m26-layout="expanded-touch"\] \.m26-stat-grid/u);
  assert.match(tail,/grid-template-columns: repeat\(2,minmax\(0,1fr\)\) !important/u);
});

test('authenticated browser contract checks portrait and landscape tablet density separately',()=>{
  const spec=read('qa/rc64/authenticated-current-contract.spec.mjs');
  assert.match(spec,/authenticated-readonly-tablet-chromium/u);
  assert.match(spec,/Portrait tablet metric grid must use two readable columns/u);
  assert.match(spec,/toBe\(2\)/u);
  assert.match(spec,/authenticated-readonly-tablet-landscape-chromium/u);
  assert.match(spec,/Landscape tablet metric grid should preserve four-column density/u);
  assert.match(spec,/toBe\(4\)/u);
});
