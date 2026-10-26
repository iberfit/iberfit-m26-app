import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution,sessionLiveAttentionModel} from '../src/m26/workflows/session-ui.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
const catalog=createExerciseCatalog([{
  id:'push',name_es:'Press mancuernas',pattern:'empuje',equipment:'mancuernas',
  difficulty:'intermedio',intent:'fuerza',primary_muscles:[],
  secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]
}]);
function make(role){
 const session=createSessionDraft({clientId:'client-b21'});
 addCatalogExercise(session,'push',catalog,{sets:2,reps:'10'});
 const execution=createExecution({session,clientId:session.clientId,executionId:'exec-b21'});
 return {role,execution,session,catalog};
}
test('B21 helper separates phases and roles without mutating or inferring remote success',()=>{
 const input=Object.freeze({status:'active',syncStatus:'pending'});
 const model=sessionLiveAttentionModel(input,{role:'coach'});
 assert.deepEqual(model,{step:'record',coach:true,hasNext:false,sync:'pending'});
 assert.equal(sessionLiveAttentionModel(input,{role:'client',recorded:true,restActive:true}).step,'rest');
 assert.equal(sessionLiveAttentionModel({status:'awaiting_feedback'},{}).step,'feedback');
 assert.equal(sessionLiveAttentionModel({status:'paused'},{}).step,'pause');
 assert.equal(sessionLiveAttentionModel({status:'completed'},{}).step,'complete');
 assert.equal(input.syncStatus,'pending');
});
test('B21 ready and active Coach guidance differs from autonomous Client, actions unchanged',()=>{
 const coach=make('coach'),client=make('client');
 const readyCoach=renderGuidedExecution(coach);
 const readyClient=renderGuidedExecution(client);
 assert.match(readyCoach,/data-signature-live-cue="prepare" data-signature-live-actor="coach"/);
 assert.match(readyClient,/data-signature-live-cue="prepare" data-signature-live-actor="client"/);
 assert.match(readyCoach,/Verifica el cliente y las prescripciones/);
 assert.match(readyClient,/Revisa tus objetivos y empieza/);
 assert.match(readyClient,/data-session-action="start"/);
 startExecution(coach.execution,{actor:{role:'coach',id:'coach'}});
 startExecution(client.execution,{actor:{role:'client',id:'client'}});
 const runCoach=renderGuidedExecution(coach),runClient=renderGuidedExecution(client);
 assert.match(runCoach,/data-signature-live-cue="record"/);
 assert.match(runClient,/Tu serie actual/);
 assert.match(runCoach,/data-session-action="complete-set"/);
 assert.match(runClient,/data-session-action="complete-set"/);
 assert.match(runCoach,/data-session-open-substitution/);
 assert.doesNotMatch(runClient,/data-session-open-substitution/);
});
test('B21 role design preserves mobile focus, high contrast and accessibility',()=>{
 const source=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
 assert.match(source,/SIGNATURE B21/);
 assert.match(source,/data-signature-live-actor="coach"/);
 assert.match(source,/data-signature-live-actor="client"/);
 assert.match(source,/@media\(max-width:700px\)/);
 assert.match(source,/@media\(forced-colors:active\)/);
});
test('B21 new live cues have EN FR PT translations instead of untranslated labels',()=>{
 for(const text of [
   'Registrar trabajo real','Tu serie actual','Revisa tus objetivos y empieza cuando estés preparado.',
   'Descansa el tiempo necesario. Continúa cuando estés listo.','Confirma cómo fue la sesión',
 ]){
   for(const language of ['en','fr','pt']){
     assert.notEqual(iberfitSurfaceTranslate(text,{language}),text,text+' '+language);
   }
 }
});
