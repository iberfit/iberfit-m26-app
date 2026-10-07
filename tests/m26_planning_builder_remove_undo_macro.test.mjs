import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {
  createSessionDraft,addCatalogExercise,addTrainingGroup,
  sessionBlockRemovalSnapshot,removeSessionBlock,restoreSessionBlock,
} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const records=[
  {id:'push-db',name_es:'Press con mancuernas',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:['pectoral'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
  {id:'row-trx',name_es:'Remo TRX',pattern:'tirón',equipment:'TRX',difficulty:'inicial',intent:'fuerza',primary_muscles:['espalda'],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
];
const catalog=createExerciseCatalog(records);

test('deshacer restaura el bloque completo en su posición original y obliga a revisar',()=>{
  const draft=createSessionDraft({clientId:'client-undo'});
  addCatalogExercise(draft,'push-db',catalog,{sets:4,reps:'6-8',plannedLoad:'20 kg'});
  addCatalogExercise(draft,'row-trx',catalog,{sets:3,reps:'10'});
  draft.previewAccepted=true;
  const removed=draft.blocks[0];
  const snapshot=sessionBlockRemovalSnapshot(draft,removed.id);
  removeSessionBlock(draft,removed.id);
  assert.equal(draft.blocks.length,1);
  restoreSessionBlock(draft,snapshot);
  assert.equal(draft.blocks[0].id,removed.id);
  assert.equal(draft.blocks[0].plannedLoad,'20 kg');
  assert.equal(draft.previewAccepted,false);
});

test('undo de grupo activo no pisa un grupo activo posterior',()=>{
  const draft=createSessionDraft({clientId:'client-undo-group'});
  addTrainingGroup(draft,'biserie',[]);
  const firstId=draft.activeGroupId;
  const snapshot=sessionBlockRemovalSnapshot(draft,firstId);
  removeSessionBlock(draft,firstId);
  addTrainingGroup(draft,'triserie',[]);
  const secondId=draft.activeGroupId;
  restoreSessionBlock(draft,snapshot);
  assert.equal(draft.activeGroupId,secondId);
  assert.ok(draft.blocks.some((item)=>item.id===firstId));
});

test('undo se aísla por identidad de borrador',()=>{
  const source=createSessionDraft({clientId:'source'});
  addCatalogExercise(source,'push-db',catalog);
  const snapshot=sessionBlockRemovalSnapshot(source,source.blocks[0].id);
  const other=createSessionDraft({clientId:'other'});
  assert.throws(()=>restoreSessionBlock(other,snapshot),/M26_SESSION_BLOCK_UNDO_SCOPE_MISMATCH/u);
});

test('la UI solo expone una acción genérica y no serializa el snapshot eliminado',()=>{
  const draft=createSessionDraft({clientId:'client-undo-ui'});
  const undoRemoval={draftId:draft.id,index:0,block:{id:'removed',type:'exercise',exerciseId:'push-db',prescriptionNotes:'SECRETO_NO_RENDERIZAR'},wasActiveGroup:false};
  const html=renderSessionBuilder({draft,catalog,role:'coach',undoRemoval});
  assert.match(html,/data-session-builder-undo/u);
  assert.match(html,/data-session-action="restore-block"/u);
  assert.match(html,/Bloque eliminado del borrador\./u);
  assert.match(html,/Deshacer/u);
  assert.doesNotMatch(html,/SECRETO_NO_RENDERIZAR/u);
});

test('controller y aplicación mantienen undo efímero y lo limpian al cargar plantilla',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(controller,/case 'remove-block': \{const undo=sessionBlockRemovalSnapshot/u);
  assert.match(controller,/case 'restore-block': restoreSessionBlock/u);
  assert.match(controller,/setBuilderUndo\?\.\(result\.undo\)/u);
  assert.match(controller,/setBuilderUndo\?\.\(null\)/u);
  assert.match(app,/builderUndo:sessionUi\?\.undoRemoval\|\|null/u);
  assert.match(app,/const nextDraft=createDraftFromSessionTemplate/u);
  const draftAssignment=app.indexOf('sessionUi.draft=nextDraft;');
  const undoClear=app.indexOf('sessionUi.undoRemoval=null;',draftAssignment);
  assert.ok(draftAssignment>=0&&undoClear>draftAssignment,'cargar plantilla instala el nuevo draft y limpia undo de bloque');
});