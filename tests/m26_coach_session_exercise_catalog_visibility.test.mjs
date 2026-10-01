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

test('coach session builder keeps every matching exercise selectable without rendering every result as a heavy visual card',()=>{
  const html=renderSessionBuilder({draft:draft(),catalog:catalogWith(30),role:'coach'});

  assert.match(html,/>30 resultados</);
  assert.match(html,/Ver 6 ejercicios más/);
  assert.match(html,/data-exercise-id="exercise-30"/);
  assert.equal((html.match(/class="m26-exercise-result"/g)||[]).length,24);
  assert.equal((html.match(/data-session-action="add-exercise"/g)||[]).length,30);
});

test('coach session builder does not add overflow disclosure when all matches fit in the visual result window',()=>{
  const html=renderSessionBuilder({draft:draft(),catalog:catalogWith(10),role:'coach'});

  assert.match(html,/>10 resultados</);
  assert.doesNotMatch(html,/m26-exercise-results-more/);
  assert.equal((html.match(/data-session-action="add-exercise"/g)||[]).length,10);
});
