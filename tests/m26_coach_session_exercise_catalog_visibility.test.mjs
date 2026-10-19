import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

function exercise(index){
  return {
    id:`exercise-${index}`,
    name_es:`Ejercicio ${index}`,
    pattern:'fuerza',
    equipment:'mancuernas',
    primary_muscles:['piernas'],
  };
}

function catalogWith(count){
  const items=Array.from({length:count},(_,index)=>exercise(index+1));
  const byId=new Map(items.map((item)=>[item.id,item]));
  return {
    search:()=>items,
    get:(id)=>byId.get(String(id))||null,
  };
}

function draft(){
  return {
    title:'Sesión catálogo completo',
    durationMinutes:60,
    blocks:[],
    previewAccepted:false,
  };
}

test('coach session builder keeps all 30 matches selectable through progressive pages, without heavy hidden cards',()=>{
  const first=renderSessionBuilder({draft:draft(),catalog:catalogWith(30),role:'coach'});
  assert.match(first,/>30 resultados</);
  assert.match(first,/Mostrar otros 6 ejercicios/);
  assert.match(first,/data-session-action="load-more-library"/);
  assert.equal((first.match(/class="m26-exercise-result"/g)||[]).length,24);
  assert.equal((first.match(/data-session-action="add-exercise"/g)||[]).length,24);
  assert.doesNotMatch(first,/data-exercise-id="exercise-30"/);
  const expanded=renderSessionBuilder({draft:draft(),catalog:catalogWith(30),role:'coach',libraryVisibleLimit:48});
  assert.match(expanded,/data-exercise-id="exercise-30"/);
  assert.equal((expanded.match(/data-session-action="add-exercise"/g)||[]).length,30);
  assert.doesNotMatch(expanded,/data-session-action="load-more-library"/);
});

test('coach session builder does not add overflow disclosure when all matches fit in the visual result window',()=>{
  const html=renderSessionBuilder({draft:draft(),catalog:catalogWith(10),role:'coach'});

  assert.match(html,/>10 resultados</);
  assert.doesNotMatch(html,/m26-exercise-results-more/);
  assert.equal((html.match(/data-session-action="add-exercise"/g)||[]).length,10);
});
