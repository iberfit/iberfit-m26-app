import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  inspectOwnerDeviceData,
  ownerDeviceClearPrompt,
  clearOwnerDeviceData,
} from '../src/m26/privacy/device-data.js';
import {
  createKeyValueOperationRepository,
} from '../src/m26/platform/offline-command-repository.js';
import {
  createMemoryKeyValueStore,
} from '../src/m26/platform/key-value-store.js';
import {
  createSessionTemplateRepository,
  sessionTemplateStorageKey,
} from '../src/m26/productivity/session-reuse.js';
import {
  updateIberfitExperiencePreference,
  readIberfitExperiencePreferences,
  clearIberfitExperiencePreferences,
} from '../src/m26/ui/preferences.js';
import {
  createCoachProductivityController,
  coachProductivityStorageKey,
} from '../src/m26/productivity/coach-productivity.js';

function localStorageStub(){
  const data=new Map();
  return {
    getItem(key){return data.has(String(key))?data.get(String(key)):null;},
    setItem(key,value){data.set(String(key),String(value));},
    removeItem(key){data.delete(String(key));},
    keys(){return [...data.keys()];},
    has(key){return data.has(String(key));},
  };
}

test('RC65-B inventaría pendientes sin mezclar datos ya remotos',async()=>{
  const summary=await inspectOwnerDeviceData({
    operations:{list:async()=>[{id:1},{id:2}]},
    drafts:{list:async()=>[{id:1}]},
    recovery:{list:async()=>[{id:1}]},
    telemetry:{summary:async()=>({totalCount:2,pendingCount:1,terminalCount:1,dueCount:1})},
    wearables:{pendingCount:async()=>2},
    sessionTemplates:{list:()=>[{id:1},{id:2},{id:3}]},
  });

  assert.equal(summary.operationCount,2);
  assert.equal(summary.draftCount,1);
  assert.equal(summary.recoveryCount,1);
  assert.equal(summary.telemetryTotal,2);
  assert.equal(summary.wearablePendingCount,2);
  assert.equal(summary.templateCount,3);
  assert.equal(summary.atRiskCount,8);
  assert.equal(summary.knownLocalCount,11);
  assert.equal(summary.inspectionComplete,true);

  const prompt=ownerDeviceClearPrompt(summary);
  assert.match(prompt,/8 elementos locales/u);
  assert.match(prompt,/podrían perderse de forma permanente/u);
  assert.match(prompt,/ya están guardados en IBERFIT no se eliminarán/u);
  assert.match(prompt,/solo borra los datos locales de esta cuenta/u);
});

test('RC65-B falla cerrado en la advertencia si no puede inspeccionar una fuente',async()=>{
  const summary=await inspectOwnerDeviceData({
    operations:{list:async()=>{throw new Error('BROKEN');}},
    drafts:{list:async()=>[]},
    recovery:{list:async()=>[]},
    telemetry:{summary:async()=>({totalCount:0})},
    wearables:{pendingCount:async()=>0},
    sessionTemplates:{list:()=>[]},
  });
  assert.equal(summary.inspectionComplete,false);
  assert.equal(summary.inspectionFailures.length,1);
  assert.match(ownerDeviceClearPrompt(summary),/No se pudo comprobar por completo/u);
  assert.match(ownerDeviceClearPrompt(summary),/podrían perderse/u);
});

test('RC65-B intenta todas las limpiezas y no declara éxito si una falla',async()=>{
  const called=[];
  const target=(name,value=true)=>({clearOwner:async()=>{called.push(name);return value;}});
  const result=await clearOwnerDeviceData({
    operations:target('operations'),
    drafts:target('drafts'),
    recovery:target('recovery'),
    telemetry:target('telemetry'),
    wearables:target('wearables'),
    sessionTemplates:target('sessionTemplates'),
    productivity:target('productivity'),
    clearPreferences:async()=>{called.push('preferences');return false;},
  });

  assert.equal(result.ok,false);
  assert.equal(result.attempted,8);
  assert.equal(result.failures.length,1);
  assert.equal(result.failures[0].source,'preferences');
  assert.deepEqual(called,[
    'operations','drafts','recovery','telemetry',
    'wearables','sessionTemplates','productivity','preferences'
  ]);
});

test('RC65-B clearOwner de operaciones conserva al otro usuario en almacenamiento compartido',async()=>{
  const storage=createMemoryKeyValueStore();
  const a=createKeyValueOperationRepository({storage,ownerId:'owner-A'});
  const b=createKeyValueOperationRepository({storage,ownerId:'owner-B'});

  await a.put({operationId:'op-A',createdAt:'2026-08-27T00:00:00.000Z'});
  await b.put({operationId:'op-B',createdAt:'2026-08-27T00:00:00.000Z'});
  assert.equal((await a.list()).length,1);
  assert.equal((await b.list()).length,1);

  await a.clearOwner();

  assert.equal((await a.list()).length,0);
  assert.equal((await b.list()).length,1);
  assert.equal((await b.get('op-B'))?.ownerId,'owner-B');
});

test('RC65-B plantillas se borran solo para el owner actual',()=>{
  const storage=localStorageStub();
  const a=createSessionTemplateRepository({ownerId:'owner-A',storage});
  const b=createSessionTemplateRepository({ownerId:'owner-B',storage});
  storage.setItem(sessionTemplateStorageKey('owner-A'),'{"schemaVersion":"iberfit.session-template.v1","templates":[]}');
  storage.setItem(sessionTemplateStorageKey('owner-B'),'{"schemaVersion":"iberfit.session-template.v1","templates":[]}');

  assert.equal(a.clearOwner(),true);
  assert.equal(storage.has(sessionTemplateStorageKey('owner-A')),false);
  assert.equal(storage.has(sessionTemplateStorageKey('owner-B')),true);
  assert.equal(b.list().length,0);
});

test('RC65-B preferencias se borran solo para el scope autenticado',()=>{
  const storage=localStorageStub();
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{
    value:storage,
    configurable:true,
    writable:true,
  });
  try{
    updateIberfitExperiencePreference('owner-A','notifications.sessionReminders',true);
    updateIberfitExperiencePreference('owner-B','notifications.sessionReminders',true);
    assert.equal(clearIberfitExperiencePreferences('owner-A'),true);
    assert.equal(readIberfitExperiencePreferences('owner-A').notifications.sessionReminders,false);
    assert.equal(readIberfitExperiencePreferences('owner-B').notifications.sessionReminders,true);
  }finally{
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);
    else delete globalThis.localStorage;
  }
});

test('RC65-B productividad elimina únicamente su workspace owner-scoped',()=>{
  const storage=localStorageStub();
  const root={addEventListener(){}};
  const store={getState(){return {identity:{role:'coach'}};}};
  const a=createCoachProductivityController({root,store,ownerId:'owner-A',storage});
  const b=createCoachProductivityController({root,store,ownerId:'owner-B',storage});
  storage.setItem(coachProductivityStorageKey('owner-A'),'{"schemaVersion":"iberfit.coach-productivity.v1","savedViews":[],"recents":["A"]}');
  storage.setItem(coachProductivityStorageKey('owner-B'),'{"schemaVersion":"iberfit.coach-productivity.v1","savedViews":[],"recents":["B"]}');

  assert.equal(a.clearOwner(),true);
  assert.equal(storage.has(coachProductivityStorageKey('owner-A')),false);
  assert.equal(storage.has(coachProductivityStorageKey('owner-B')),true);
  assert.equal(typeof b.clearOwner,'function');
});

test('RC65-B UI separa logout normal de borrado destructivo también bajo i18n',()=>{
  const shell=fs.readFileSync('src/m26/shell/shell-render.js','utf8');
  const controller=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  const wearable=fs.readFileSync('src/m26/wearables/controller.js','utf8');

  assert.match(shell,/data-m26-action="logout">\$\{escapeHtml\(tx\('common\.logout','Cerrar sesión'\)\)\}/u);
  assert.match(shell,/data-m26-action="logout-clear-device">\$\{escapeHtml\(tx\('common\.logoutClear','Cerrar sesión y borrar datos de este dispositivo'\)\)\}/u);
  assert.match(controller,/m26:logout-and-clear-device/u);
  assert.match(app,/root\.addEventListener\('m26:logout-and-clear-device',onLogoutAndClearDevice\)/u);
  assert.match(app,/function onLogout\(\)\{const token=currentToken\(\);finishLogout\(\{token\}\);\}/u);

  const normal=app.match(/function onLogout\(\)\{[^\n]*\}/u)?.[0]||'';
  assert.doesNotMatch(normal,/clearOwnerDeviceData|clearOwner/u);

  assert.match(wearable,/pendingCount:\(\)=>remoteSync\.pendingCount\(\)/u);
  assert.match(wearable,/clearOwner:\(\)=>remoteSync\.clearOwner\(\)/u);
});