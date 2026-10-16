import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createSessionDraft,addCatalogExercise,updateSessionDraft,acceptSessionPreview,
 buildPublishSessionCommand,sessionDraftDeliveryMode,
} from '../src/m26/workflows/session-builder.js';
import {
 createReusableSessionDraft,sessionTemplateSnapshot,createDraftFromSessionTemplate,
} from '../src/m26/productivity/session-reuse.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
import {sessionPresentation} from '../src/m26/experience/session-presentation.js';

const exercise={id:'press',name_es:'Press de pecho',pattern:'empuje',equipment:'mancuernas',aliases:[]};
const catalog={
 get:id=>id==='press'?exercise:null,
 has:id=>id==='press',
 search:(query)=>!query||exercise.name_es.toLowerCase().includes(String(query).toLowerCase())?[exercise]:[],
 list:()=>[exercise],
};
function draft(mode='guided'){
 const item=createSessionDraft({clientId:'client-1',deliveryMode:mode});
 addCatalogExercise(item,'press',catalog);
 return item;
}
test('Coach elige modo y la publicación traduce consistentemente modalidad, propiedad y visibilidad',()=>{
 for(const [mode,owner,modality,visibility] of [
  ['guided','client_autonomous','guiada_en_app','full'],
  ['coach_led','coach_led','presencial','summary_only'],
 ]){
  const value=draft(mode);
  acceptSessionPreview(value,catalog);
  const command=buildPublishSessionCommand(value,catalog);
  const patch=command.payload.patch;
  assert.equal(patch.deliveryMode,mode);
  assert.equal(patch.deliveryOwnership,owner);
  assert.equal(patch.deliveryModality,modality);
  assert.equal(patch.clientVisibilityLevel,visibility);
  assert.equal(patch.visibleToClient,true);
  const client=sessionPresentation({...patch,clientId:'client-1'}, {role:'client',catalog:[exercise]});
  assert.equal(client.canStart,mode==='guided');
  assert.equal(client.canInspect,mode==='guided');
  assert.equal(client.blocks.length,mode==='guided'?1:0);
 }
});
test('Cambiar tipo invalida la revisión ya aceptada y exige revisar antes de publicar',()=>{
 const value=draft();
 acceptSessionPreview(value,catalog);
 updateSessionDraft(value,'deliveryMode','coach_led');
 assert.equal(value.previewAccepted,false);
 assert.throws(()=>buildPublishSessionCommand(value,catalog),/PREVIEW_REQUIRED/);
 assert.equal(sessionDraftDeliveryMode(value),'coach_led');
 assert.throws(()=>updateSessionDraft(value,'deliveryMode','unknown'),/DELIVERY_MODE_INVALID/);
});
test('UI Coach explica claramente consecuencias de cada modalidad',()=>{
 const a=renderSessionBuilder({draft:draft('coach_led'),catalog});
 const b=renderSessionBuilder({draft:draft('guided'),catalog});
 assert.match(a,/data-session-draft-field="deliveryMode"/);
 assert.match(a,/Solo.*resumen|solo resumen al cliente/);
 assert.match(a,/la prescripción permanece en Coach/);
 assert.match(b,/imágenes y prescripción antes de iniciar/);
});
test('Plantillas y reutilización conservan el modo seleccionado sin copiar ID publicado',()=>{
 const value=draft('coach_led');
 const snapshot=sessionTemplateSnapshot(value);
 assert.equal(snapshot.deliveryMode,'coach_led');
 const loaded=createDraftFromSessionTemplate({snapshot},{clientId:'client-2',catalog});
 assert.equal(loaded.deliveryMode,'coach_led');
 assert.notEqual(loaded.id,value.id);
 const original={body:{...value,status:'published',deliveryOwnership:'coach_led',deliveryMode:'coach_led'}};
 const copied=createReusableSessionDraft(original,{clientId:'client-3',catalog});
 assert.equal(copied.deliveryMode,'coach_led');
 assert.equal(copied.status,'draft');
 assert.notEqual(copied.id,value.id);
});
test('Borradores anteriores se interpretan sin romperlos y se publican como guiados por defecto',()=>{
 const value=draft();
 delete value.deliveryMode;
 assert.equal(sessionDraftDeliveryMode(value),'guided');
 acceptSessionPreview(value,catalog);
 const patch=buildPublishSessionCommand(value,catalog).payload.patch;
 assert.equal(patch.deliveryOwnership,'client_autonomous');
 assert.equal(patch.clientVisibilityLevel,'full');
});
