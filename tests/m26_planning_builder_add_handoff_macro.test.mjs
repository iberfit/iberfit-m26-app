import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,addTrainingGroup} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const records=[
  {id:'push-db',name_es:'Press con mancuernas',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:['pectoral'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'row-trx',name_es:'Remo TRX',pattern:'tirón',equipment:'TRX',difficulty:'inicial',intent:'fuerza',primary_muscles:['espalda'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
];
const catalog=createExerciseCatalog(records);

test('un ejercicio individual crea un bloque nuevo identificable para el handoff',()=>{
  const draft=createSessionDraft({clientId:'client-handoff'});
  const beforeIds=new Set(draft.blocks.map((item)=>item.id));
  addCatalogExercise(draft,'push-db',catalog,{sets:3,reps:'8-10'});
  const inserted=draft.blocks.find((item)=>item?.id&&!beforeIds.has(item.id));
  assert.ok(inserted?.id);
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,new RegExp(`data-block-id="${inserted.id}" tabindex="-1"`));
});

test('si hay un grupo activo el destino del handoff sigue siendo el grupo, incluso cuando se completa',()=>{
  const draft=createSessionDraft({clientId:'client-handoff-group'});
  addTrainingGroup(draft,'biserie',[]);
  const groupId=draft.activeGroupId;
  assert.ok(groupId);
  addCatalogExercise(draft,'push-db',catalog);
  addCatalogExercise(draft,'row-trx',catalog);
  assert.equal(draft.activeGroupId,undefined,'la biserie completa deja de estar activa');
  assert.equal(draft.blocks[0]?.id,groupId,'el bloque de grupo conserva su identidad');
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,new RegExp(`data-block-id="${groupId}" tabindex="-1"`));
});

test('el controlador conserva foco y limita el scroll de handoff a ancho estrecho',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(controller,/function focusBuilderBlock\(blockId,\{action=null,scrollOnNarrow=false\}=\{\}\)/u);
  assert.match(controller,/matchMedia\('\(max-width: 840px\)'\)\.matches/u);
  assert.match(controller,/if\(scrollOnNarrow&&narrow\)/u);
  assert.match(controller,/\['add-exercise','add-group','duplicate-block'\]\.includes\(action\)/u);
  assert.match(controller,/if\(outcome\.ok&&builderFocusBlockId\)focusBuilderBlock\(builderFocusBlockId,\{action:builderFocusAction,scrollOnNarrow:builderFocusScroll\}\)/u);
});

test('el editor deja margen para no quedar bajo barras sticky',()=>{
  const css=fs.readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
  assert.match(css,/\.m26-builder-editor\{[\s\S]*?scroll-margin-top:calc\(var\(--m26-session-sticky-top,.4rem\) \+ 4.5rem\)/u);
});