import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateCheckinDraft} from '../src/m26/engagement/activity-drafts.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const render=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const css=fs.readFileSync('src/m26/design/premium-ux.css','utf8');

test('check-in usa seis selectores 0-10 y evita teclado numérico repetitivo',()=>{
  for(const name of ['energy','sleep','stress','pain','fatigue','motivation']){
    assert.match(render,new RegExp(`data-checkin-score="${name}"`,'u'));
  }
  assert.match(render,/Array\.from\(\{length:11\}/u);
  assert.match(render,/Fatiga \(0–10\)/u);
  assert.match(render,/Motivación \(0–10\)/u);
  const checkin=render.slice(render.indexOf('data-engagement-form="checkin"'),render.indexOf('data-engagement-status="checkin"'));
  assert.doesNotMatch(checkin,/type="number"[^>]*name="(?:energy|sleep|stress|pain|fatigue|motivation)"/u);
});

test('select conserva 0, 10 y ausencia opcional en el contrato de datos',()=>{
  const required=validateCheckinDraft({
    energy:'0',sleep:'10',stress:'6',pain:'0',fatigue:'',motivation:'',
    recordedAt:'2026-10-07T12:00:00Z',
  });
  assert.equal(required.ok,true);
  assert.equal(required.value.energy,0);
  assert.equal(required.value.sleep,10);
  assert.equal(required.value.pain,0);
  assert.equal(Object.prototype.hasOwnProperty.call(required.value,'fatigue'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(required.value,'motivation'),false);
});

test('check-in táctil mantiene responsive, touch target e i18n',()=>{
  assert.match(css,/\.m26-wellbeing-score-control select\{min-height:48px/u);
  assert.match(css,/@media\(max-width:520px\)\{\[data-engagement-form="checkin"\] \.m26-field-grid\{grid-template-columns:1fr\}/u);
  assert.equal(iberfitSurfaceTranslate('Seleccionar puntuación…',{language:'en'}),'Select score…');
  assert.equal(iberfitSurfaceTranslate('Dolor',{language:'fr'}),'Douleur');
  assert.equal(iberfitSurfaceTranslate('Fatiga',{language:'pt'}),'Fadiga');
});
