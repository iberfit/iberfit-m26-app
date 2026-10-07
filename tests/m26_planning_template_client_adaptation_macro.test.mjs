import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,acceptSessionPreview} from '../src/m26/workflows/session-builder.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';

const catalog=createExerciseCatalog([
  {id:'a',name_es:'Press',pattern:'empuje',equipment:'mancuernas',difficulty:'intermedio',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],precautions:[],tags:[],aliases:[]},
]);

function draft(durationMinutes=60){
  const value=createSessionDraft({clientId:'client-template',durationMinutes});
  addCatalogExercise(value,'a',catalog);
  return value;
}

test('plantilla muestra discrepancia de duración real del ciclo sin aplicarla automáticamente',()=>{
  const value=draft(60);
  const html=renderSessionBuilder({
    draft:value,
    catalog,
    role:'coach',
    templateAdaptation:{templateName:'Fuerza A',templateVersion:2,clientDurationMinutes:50,source:'cycle'},
  });
  assert.equal(value.durationMinutes,60);
  assert.match(html,/data-session-template-adaptation/u);
  assert.match(html,/Duración del ciclo: 50 min · borrador actual: 60 min\./u);
  assert.match(html,/data-session-action="apply-client-duration"/u);
  assert.match(html,/data-duration-minutes="50"/u);
  assert.match(html,/La plantilla aporta estructura; revisa el historial/u);
});

test('un fallback genérico no se presenta como duración específica del cliente',()=>{
  const html=renderSessionBuilder({
    draft:draft(60),
    catalog,
    role:'coach',
    templateAdaptation:{templateName:'Base',templateVersion:1,clientDurationMinutes:50,source:'default'},
  });
  assert.match(html,/no tiene una duración específica definida en ciclo o perfil/u);
  assert.doesNotMatch(html,/data-session-action="apply-client-duration"/u);
});

test('aplicar duración requiere acción explícita e invalida preview',()=>{
  const value=draft(60);
  acceptSessionPreview(value,catalog);
  assert.equal(value.previewAccepted,true);
  dispatchSessionAction({action:'apply-client-duration',draft:value,catalog,payload:{durationMinutes:50}});
  assert.equal(value.durationMinutes,50);
  assert.equal(value.previewAccepted,false);
});

test('acción queda limitada a Coach/Admin y la aplicación conserva fuente real',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['apply-client-duration'],{roles:['admin','coach'],domain:'session'});
  assert.equal(assertActionAllowed('apply-client-duration','coach'),true);
  assert.equal(assertActionAllowed('apply-client-duration','admin'),true);
  assert.equal(assertActionAllowed('apply-client-duration','client'),false);
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  assert.match(app,/sessionUi\.templateAdaptation=Object\.freeze/u);
  assert.match(app,/clientDurationMinutes:clientDefaults\.durationMinutes/u);
  assert.match(app,/source:clientDefaults\.source/u);
});
