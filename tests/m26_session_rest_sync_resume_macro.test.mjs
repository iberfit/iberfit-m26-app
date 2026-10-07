import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('la incertidumbre de red difiere el autoavance sin suprimir permanentemente ese descanso',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const start=source.indexOf('coachRestTimer=setTimeout');
  const end=source.indexOf('coachRestAdvancePending=true',start);
  assert.ok(start>=0&&end>start);
  const callback=source.slice(start,end);
  assert.match(callback,/if\(latest\?\.execution\?\.syncStatus!=='clean'\)return;/u);
  assert.doesNotMatch(callback,/syncStatus!=='clean'[\s\S]{0,140}coachRestSuppressedSignature=signature/u);
});

test('background y corrección manual siguen suprimiendo el autoavance de forma intencional',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const start=source.indexOf('coachRestTimer=setTimeout');
  const end=source.indexOf('coachRestAdvancePending=true',start);
  const callback=source.slice(start,end);
  assert.match(callback,/visibilityTarget\?\.visibilityState==='hidden'/u);
  assert.match(callback,/restCorrectionInProgress\(\)/u);
  assert.match(callback,/coachRestSuppressedSignature=signature/u);
});