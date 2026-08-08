import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IBERFIT_UI_LOCALE,
  castilianStatusLabel,
  castilianSourceLabel,
  castilianPlatformLabel,
  castilianOperationTitle,
  castilianOperationDetail,
} from '../src/m26/ui/castellano.js';
import {appointmentModalityLabel,clientModalityLabel} from '../src/m26/domain/modality.js';
import {__wearableControllerInternals} from '../src/m26/wearables/controller.js';
import {loadExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {EXERCISE_VISIBLE_FORBIDDEN_TERMS} from '../src/m26/exercises/castellano.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const forbidden=/\b(?:check[ -]?ins?|wearables?|coach(?:es)?|online|offline|feedback|dashboard|loading|retry|pending|rejected|ready|chair stand|step test|HRV|OAuth|app)\b/i;

function stripMarkup(value){return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}

test('RC23 fija castellano de España en documento, PWA y utilidades',()=>{
  assert.equal(IBERFIT_UI_LOCALE,'es-ES');
  assert.match(read('public/m26/index.html'),/<html lang="es-ES">/);
  assert.match(read('public/m26/offline.html'),/<html lang="es-ES">/);
  assert.equal(JSON.parse(read('public/m26/manifest.webmanifest')).lang,'es-ES');
});

test('RC23 traduce estados internos sin exponer códigos ingleses',()=>{
  assert.equal(castilianStatusLabel('ready'),'Preparado');
  assert.equal(castilianStatusLabel('pending'),'Pendiente');
  assert.equal(castilianStatusLabel('rejected'),'Rechazada');
  assert.equal(castilianStatusLabel('connected'),'Conectado');
});

test('RC23 traduce fuentes y plataformas conservando nombres propios',()=>{
  assert.equal(castilianSourceLabel('checkin'),'Registro de bienestar');
  assert.equal(castilianSourceLabel('wearable'),'Datos de dispositivos');
  assert.equal(castilianPlatformLabel('cloud'),'Servicio en línea');
  assert.equal(castilianPlatformLabel('ios'),'iOS');
});

test('RC23 presenta operaciones y errores con lenguaje humano',()=>{
  assert.equal(castilianOperationTitle('CITA_CANCELAR','appointment'),'Cita · Cancelar');
  assert.equal(castilianOperationTitle('CHECKIN_REGISTRAR','checkin'),'Registro de bienestar · Registrar');
  assert.match(castilianOperationDetail('M26_NETWORK_UNAVAILABLE'),/No hay conexión/);
  assert.doesNotMatch(castilianOperationDetail('ROLE_FORBIDDEN'),/ROLE_FORBIDDEN/);
});

test('RC23 unifica modalidades visibles en castellano',()=>{
  assert.equal(appointmentModalityLabel('guiada_app'),'Guiada en la aplicación');
  assert.equal(appointmentModalityLabel('guiada_en_app'),'Guiada en la aplicación');
  assert.equal(clientModalityLabel('online'),'En línea');
  assert.equal(clientModalityLabel('hibrido'),'Híbrido');
});

test('RC23 resume datos de dispositivos con VFC y registro de bienestar',()=>{
  const text=__wearableControllerInternals.wearableContextText({providerLabel:'Archivo normalizado IBERFIT',summary:{daysWithData:3,metrics:{steps:7900,activeMinutes:44,sleepMinutes:440,restingHeartRate:59,hrvMs:47,workoutMinutes:35}}});
  assert.match(text,/Contexto de dispositivos/);
  assert.match(text,/VFC: 47 ms/);
  assert.doesNotMatch(text,forbidden);
});

test('RC23 elimina de las plantillas visibles los anglicismos heredados',()=>{
  const route=read('src/m26/modules/route-render.js');
  const shell=read('src/m26/shell/shell-render.js');
  const wearable=read('src/m26/wearables/controller.js');
  for(const legacy of ['Enviar check-in','Coach recibe','Guiada en app','Sesión online','HRV media','Añadir resumen al check-in','Contexto wearable']){
    assert.equal(route.includes(legacy)||shell.includes(legacy)||wearable.includes(legacy),false,legacy);
  }
  assert.match(route,/Enviar registro de bienestar/);
  assert.match(route,/El entrenador recibe únicamente resúmenes confirmados/);
  assert.match(wearable,/iberfit-plantilla-dispositivos\.json/);
});

test('RC23 mantiene las páginas estáticas visibles en castellano',()=>{
  const index=stripMarkup(read('public/m26/index.html'));
  const offline=stripMarkup(read('public/m26/offline.html'));
  assert.doesNotMatch(index,forbidden);
  assert.doesNotMatch(offline,forbidden);
  assert.match(offline,/Sin conexión/);
  assert.match(read('public/m26/sw.js'),/m26-rc23/);
});


test('RC23 presenta los 367 ejercicios y sus materiales en castellano sin alterar el catálogo protegido',async()=>{
  const catalog=await loadExerciseCatalog(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url));
  assert.equal(catalog.count,367);
  const pattern=new RegExp(`\b(?:${EXERCISE_VISIBLE_FORBIDDEN_TERMS.map((term)=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})\b`,'i');
  const invalid=catalog.list().filter((item)=>pattern.test(`${item.name_es} ${item.equipment}`));
  assert.deepEqual(invalid.map((item)=>({id:item.id,name:item.name_es,equipment:item.equipment})),[]);
  assert.equal(catalog.get('IBF-CLAMSHELL').name_es,'Apertura de cadera en decúbito lateral');
  assert.equal(catalog.get('IBF-HIP-THRUST-CON-BARRA').name_es,'Elevación de cadera con barra');
  assert.equal(catalog.get('IBF-HACK-SQUAT').name_es,'Sentadilla en máquina inclinada');
  assert.equal(catalog.get('IBF-STEP-UP-ALTO').name_es,'Subida a cajón alto');
  assert.equal(catalog.get('IBF-PESO-MUERTO-CON-TRAP-BAR').equipment,'barra hexagonal');
  assert.ok(catalog.search('clamshell').some((item)=>item.id==='IBF-CLAMSHELL'),'La búsqueda conserva el nombre técnico heredado como alias interno.');
});
