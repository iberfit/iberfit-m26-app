import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Empuje A',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'b',name_es:'Empuje B',pattern:'empuje',equipment:'mancuernas',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);
function markup(role){
  const session=createSessionDraft({clientId:'client-live-reason'});
  addCatalogExercise(session,'a',catalog,{sets:2,reps:'10'});
  const execution=createExecution({session,clientId:session.clientId,executionId:`exec-${role}`});
  startExecution(execution,{actor:{role,id:role}});
  return renderGuidedExecution({execution,session,catalog,role});
}

test('Coach recibe el mismo vocabulario rápido en las tres desviaciones',()=>{
  const html=markup('coach');
  for(const target of ['skip-set','substitute','skip-exercise']){
    assert.match(html,new RegExp(`data-session-reason-presets="${target}"`,'u'));
    for(const value of ['Equipo no disponible','Molestia','Fatiga','Ajuste técnico']){
      assert.match(html,new RegExp(`data-session-reason-preset-target="${target}" data-session-reason-preset-value="${value}"`,'u'));
    }
  }
  const presetBlocks=[...html.matchAll(/<div class="m26-session-reason-presets"[\s\S]*?<\/div>/gu)].map((m)=>m[0]);
  assert.equal(presetBlocks.length,3);
  for(const block of presetBlocks)assert.doesNotMatch(block,/data-session-action=/u);
});

test('Cliente no recibe presets técnicos y conserva inputs de motivo',()=>{
  const html=markup('client');
  assert.doesNotMatch(html,/data-session-reason-preset-target/u);
  assert.match(html,/data-session-skip-set-reason/u);
  assert.match(html,/data-session-substitute-reason/u);
  assert.match(html,/data-session-skip-exercise-reason/u);
});

test('controller solo rellena el input permitido y retorna antes de command action',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const preset=source.indexOf("const reasonPreset=event.target.closest?.('[data-session-reason-preset-target]')");
  const action=source.indexOf("const button=event.target.closest?.('[data-session-action]')");
  assert.ok(preset>=0&&action>preset);
  assert.match(source,/substitute:'\[data-session-substitute-reason\]'/u);
  assert.match(source,/'skip-set':'\[data-session-skip-set-reason\]'/u);
  assert.match(source,/'skip-exercise':'\[data-session-skip-exercise-reason\]'/u);
  assert.match(source,/input\.value=value;[\s\S]*?return;[\s\S]*?const openSubstitution=/u);
  assert.doesNotMatch(source,/action==='set-reason-preset'/u);
});

test('touch, móvil e i18n quedan cubiertos',()=>{
  const css=fs.readFileSync('src/m26/design/role-surfaces.css','utf8');
  const i18n=fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');
  assert.match(css,/\.m26-session-reason-presets button\{[^}]*min-height:44px/u);
  assert.match(css,/@media\(max-width:580px\)[\s\S]*?\.m26-session-reason-presets\{[\s\S]*?grid-template-columns:1fr 1fr/u);
  assert.match(i18n,/\['Motivos rápidos','Quick reasons'/u);
  assert.match(i18n,/\['Equipo no disponible','Equipment unavailable'/u);
  assert.match(i18n,/\['Ajuste técnico','Technical adjustment'/u);
});