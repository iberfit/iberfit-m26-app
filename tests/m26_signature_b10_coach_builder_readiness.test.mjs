import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionBuilder,sessionBuilderReviewReadiness} from '../src/m26/workflows/session-ui.js';
import {validateSessionDraft} from '../src/m26/workflows/session-builder.js';
const exercise={id:'b10-ex',name_es:'Sentadilla',pattern:'sentadilla'};
const catalog={has:id=>id===exercise.id,get:id=>id===exercise.id?exercise:null,search:()=>[exercise],facets:{}};
const correct={id:'b10-draft',clientId:'b10-client',title:'Fuerza guiada',
  durationMinutes:50,deliveryModality:'guiada_en_app',previewAccepted:false,
  blocks:[{id:'block-1',type:'exercise',exerciseId:exercise.id,sets:3,
    reps:'8',restSeconds:60,targetRpe:7,targetRir:2}]};
const render=(draft)=>renderSessionBuilder({draft,catalog,role:'coach',query:'',filters:{},actionState:{status:'idle'}});
const css=readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
test('B10: empty Coach draft guides toward the real library and keeps draft save enabled',()=>{
  const html=render({...correct,blocks:[]});
  const before=html.match(/<header class="m26-builder-commandbar">[\s\S]*?<\/header>/u)?.[0]||'';
  assert.match(before,/data-session-action="save-draft"/u);
  assert.match(before,/data-session-action="preview" disabled aria-disabled="true"/u);
  assert.match(html,/data-session-review-readiness role="status"/u);
  assert.match(html,/data-session-jump="library">Ir a la biblioteca/u);
  assert.doesNotMatch(html,/data-session-action="publish"/u);
  assert.equal(sessionBuilderReviewReadiness({...correct,blocks:[]},catalog).ready,false);
});
test('B10: invalid delivery and invalid prescriptions are blocked before Review without discarding user work',()=>{
  const badDelivery={...correct,deliveryModality:null};
  assert.equal(validateSessionDraft(badDelivery,catalog).ok,false);
  assert.match(sessionBuilderReviewReadiness(badDelivery,catalog).reason,/presencial o guiada/u);
  assert.match(render(badDelivery),/data-session-action="preview" disabled aria-disabled="true"/u);
  const badPrescription={...correct,blocks:[{...correct.blocks[0],sets:0}]};
  assert.equal(validateSessionDraft(badPrescription,catalog).ok,false);
  assert.match(sessionBuilderReviewReadiness(badPrescription,catalog).reason,/series, repeticiones/u);
  assert.match(render(badPrescription),/data-session-action="save-draft"/u);
});
test('B10: valid domain prescription proceeds unchanged to Review, then explicit publication only',()=>{
  assert.equal(validateSessionDraft(correct,catalog).ok,true);
  assert.deepEqual(sessionBuilderReviewReadiness(correct,catalog),{ready:true,reason:'',next:null});
  const html=render(correct);
  assert.match(html,/data-session-action="preview">Revisar sesión/u);
  assert.doesNotMatch(html,/data-session-review-readiness/u);
  assert.doesNotMatch(html,/data-session-action="publish"/u);
  const accepted=render({...correct,previewAccepted:true});
  assert.match(accepted,/data-session-action="publish"/u);
});
test('B10: Coach guidance is accessible, responsive and remains matte',()=>{
  assert.match(css,/SIGNATURE B10/u);
  assert.match(css,/min-height:44px/u);
  assert.match(css,/:focus-visible/u);
  assert.match(css,/@media\(forced-colors:active\)/u);
  assert.doesNotMatch(css.slice(css.indexOf('/* SIGNATURE B10')),/!important|backdrop-filter|position:fixed|animation:/u);
});


test('B10: proactive guidance is available in all app languages',()=>{
  for(const source of ["Añade al menos un ejercicio para revisar la sesión.","Selecciona un Cliente antes de revisar.","Indica un título válido para la sesión.","La duración debe estar entre 10 y 240 minutos.","Elige si la sesión es presencial o guiada en la aplicación.","Añade ejercicios a la sesión antes de revisar.","Completa el grupo de entrenamiento o ciérralo para corregirlo.","Revisa las rondas de los grupos.","Hay un ejercicio que ya no está disponible en la biblioteca.","Revisa las series, repeticiones y descansos de los ejercicios.","Revisa el tiempo, la distancia y las métricas prescritas.","Revisa el ejercicio alternativo seleccionado.","Revisa los datos de la sesión antes de continuar.","Ir a la biblioteca"]){
    for(const language of ['en','fr','pt']){
      const translation=iberfitSurfaceTranslate(source,{language});
      assert.notEqual(translation,source,language+': '+source);
      assert.ok(translation.length>8);
    }
  }
});
