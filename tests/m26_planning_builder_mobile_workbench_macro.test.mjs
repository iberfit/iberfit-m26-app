import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const records=[
  {id:'push-db',name_es:'Press con mancuernas',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:['pectoral'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
];

test('workbench declara si ya existe trabajo programado y ofrece navegación rápida',()=>{
  const catalog=createExerciseCatalog(records);
  const empty=createSessionDraft({clientId:'client-mobile'});
  const emptyHtml=renderSessionBuilder({draft:empty,catalog,role:'coach'});
  assert.match(emptyHtml,/data-session-builder-has-blocks="false"/u);

  const filled=createSessionDraft({clientId:'client-mobile'});
  addCatalogExercise(filled,'push-db',catalog,{sets:3,reps:'8-10'});
  const html=renderSessionBuilder({draft:filled,catalog,role:'coach'});
  assert.match(html,/data-session-builder-has-blocks="true"/u);
  assert.match(html,/data-session-jump="program"/u);
  assert.match(html,/data-session-jump="library"/u);
  assert.match(html,/data-session-jump-target="program"/u);
  assert.match(html,/data-session-jump-target="library"/u);
});

test('en superficies estrechas la sesión existente precede a la biblioteca',()=>{
  const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
  assert.match(css,/@media \(max-width:840px\)\{[\s\S]*?\.m26-session-builder\[data-session-builder-has-blocks="true"\] \.m26-builder-program\{[\s\S]*?order:1/u);
  assert.match(css,/@media \(max-width:840px\)\{[\s\S]*?\.m26-session-builder\[data-session-builder-has-blocks="true"\] \.m26-builder-library\{[\s\S]*?order:2/u);
  assert.match(css,/\.m26-builder-mobile-nav button\{[\s\S]*?min-height:44px/u);
});

test('los saltos rápidos son navegación local y no pasan por acciones de dominio',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(controller,/const jump=event\.target\.closest\?\.\('\[data-session-jump\]'\)/u);
  assert.match(controller,/scrollIntoView\?\.\(\{behavior:'smooth',block:'start'\}\)/u);
  assert.match(controller,/focus\?\.\(\{preventScroll:true\}\)/u);
  assert.match(controller,/const jump=[\s\S]*?return;[\s\S]*?const button=event\.target\.closest\?\.\('\[data-session-action\]'\)/u);
});