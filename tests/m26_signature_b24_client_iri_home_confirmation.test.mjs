import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

function homepage(iri){
  return renderHoyRoute({
    role:'client',serviceKind:'none',
    clients:[{name:'Cliente QA',iri,trainingServiceStatus:'none'}],
    appointments:[],upcoming:[],rc39:{sessionProjections:[]},
    operations:{},wearables:null,challengePreview:null,
  });
}

test('B24 Client home does not call a provisional IRI confirmed from a status label',()=>{
  const html=homepage({confirmed:false,status:'Completada',processLabel:'Evaluación en preparación',coverageCount:2});
  assert.match(html,/Consulta el estado de tu evaluación IRI/);
  assert.doesNotMatch(html,/Tu punto de partida confirmado|Tu evaluación inicial está completada/);
});

test('B24 confirmed initial IRI keeps its positive Client entry',()=>{
  const html=homepage({confirmed:true,status:'Completada',processLabel:'7 de 7 etapas completadas',coverageCount:3});
  assert.match(html,/Tu punto de partida confirmado/);
  assert.match(html,/Tu evaluación inicial está completada/);
});

test('B24 neither Client IRI state nor Today can fall back to a display label',()=>{
  const source=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const state=source.slice(source.indexOf('function clientIriState('),source.indexOf('function clientCard('));
  assert.match(state,/client\?\.iri\?\.confirmed===true/);
  assert.doesNotMatch(state,/status\s*===?\s*['"]Completada/);
  assert.doesNotMatch(source,/client\?\.iri\?\.confirmed\|\|client\?\.iri\?\.status/);
});
