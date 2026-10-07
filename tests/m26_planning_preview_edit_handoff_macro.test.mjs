import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,addTrainingGroup} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const catalog=createExerciseCatalog([
  {id:'push',name_es:'Press',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'row',name_es:'Remo',pattern:'tirón',equipment:'TRX',difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);

test('preview permite corregir directamente el bloque individual exacto',()=>{
  const draft=createSessionDraft({clientId:'c1'});
  addCatalogExercise(draft,'push',catalog);
  draft.previewAccepted=true;
  const block=draft.blocks[0];
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,new RegExp(`data-session-preview-block="${block.id}"`));
  assert.match(html,new RegExp(`data-session-action="edit-preview" data-block-id="${block.id}"`));
});

test('preview permite corregir directamente un grupo exacto',()=>{
  const draft=createSessionDraft({clientId:'c2'});
  addTrainingGroup(draft,'biserie',[]);
  const groupId=draft.activeGroupId;
  addCatalogExercise(draft,'push',catalog);
  addCatalogExercise(draft,'row',catalog);
  draft.previewAccepted=true;
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,new RegExp(`data-session-preview-block="${groupId}"`));
  assert.match(html,new RegExp(`data-session-action="edit-preview" data-block-id="${groupId}"`));
});

test('controller hace handoff al bloque elegido tras salir de preview',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/action==='edit-preview'&&payload\.blockId/u);
  assert.match(source,/builderFocusAlways=true/u);
  assert.match(source,/scrollIntoView\?\.\(\{behavior:'smooth',block:'start'\}\)/u);
  assert.match(source,/focusBuilderBlock\(builderFocusBlockId/u);
});
