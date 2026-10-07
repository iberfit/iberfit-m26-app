import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Press',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);
const memory={
  latest:{
    completedAt:'2026-10-01T10:00:00Z',
    lastLoad:{raw:'20 kg'},
    sets:[{reps:10,load:{raw:'20 kg'}}],
    setCount:3,
  },
  exposureCount:4,
  comparison:{lastLoad:{value:2.5,unit:'kg',percent:14.3}},
};

test('builder muestra contexto confirmado sin auto-prescribir',()=>{
  const draft=createSessionDraft({clientId:'c'});
  addCatalogExercise(draft,'a',catalog);
  const html=renderSessionBuilder({draft,catalog,role:'coach',exerciseMemoryFor:()=>memory});
  assert.match(html,/data-exercise-memory-context="exposures"/u);
  assert.match(html,/Exposiciones confirmadas/u);
  assert.match(html,/data-exercise-memory-context="comparison"/u);
  assert.match(html,/Cambio vs\. anterior/u);
  assert.match(html,/\+2\.5 kg · \+14\.3%/u);
  assert.match(html,/Solo prepara el borrador/u);
});

test('surface i18n cubre el contexto añadido',()=>{
  const i18n=fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');
  assert.match(i18n,/\['Exposiciones confirmadas','Confirmed exposures'/u);
  assert.match(i18n,/\['Cambio vs\. anterior','Change vs\. previous'/u);
});
