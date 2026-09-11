import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDataTrust,
  renderDataTrustStrip,
} from '../src/m26/data-experience/data-trust.js';

test('missing data is labelled as absence, never as a numeric result',()=>{
  const trust=createDataTrust({
    source:'progress',
    quality:'sin_datos',
    coverage:0,
    missing:true,
    method:'confirmed_session_count',
  });

  assert.equal(trust.missing,true);
  assert.equal(trust.missingLabel,'Sin datos confirmados');
  assert.equal(trust.coverage,0);

  const html=renderDataTrustStrip(trust,{role:'client'});
  assert.match(html,/data-data-trust-missing="true"/);
  assert.match(html,/Sin datos confirmados/);
  assert.match(html,/Los datos ausentes se mantienen como ausentes y no se convierten en cero\./);
  assert.doesNotMatch(html,/>0<\/strong><\/span>\s*<span class="m26-data-trust-item is-success"><span class="m26-data-trust-label"><small>Dato/);
});

test('available confirmed data does not show the missing-data warning',()=>{
  const trust=createDataTrust({
    source:'progress',
    observedAt:'2026-09-11',
    quality:'confirmada',
    coverage:1,
    missing:false,
    method:'confirmed_session_count',
  });
  const html=renderDataTrustStrip(trust,{role:'client'});

  assert.equal(trust.missingLabel,'Dato disponible');
  assert.match(html,/data-data-trust-missing="false"/);
  assert.match(html,/Dato disponible/);
  assert.doesNotMatch(html,/no se convierten en cero/);
});

test('compact trust remains concise while retaining truthful missing state',()=>{
  const html=renderDataTrustStrip({
    source:'longitudinal',
    quality:'sin_datos',
    coverage:null,
    missing:true,
    method:'daily_provider_mean',
  },{role:'client',compact:true});

  assert.match(html,/is-compact/);
  assert.match(html,/Sin datos confirmados/);
  assert.match(html,/data-data-trust-missing="true"/);
  assert.doesNotMatch(html,/no se convierten en cero/);
});
