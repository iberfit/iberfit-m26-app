import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  IBERFIT_LANGUAGE_CATALOG,
  getIberfitLanguage,
  getIberfitLocale,
  iberfitLanguageOptions,
  iberfitLocaleOptions,
  iberfitPlannedLanguages,
  setIberfitLanguage,
  setIberfitLocale,
} from '../src/m26/ui/i18n.js';

import {
  readIberfitExperiencePreferences,
  updateIberfitExperiencePreference,
  socialPolicyFromPreferences,
  notificationConsentFromPreferences,
} from '../src/m26/ui/preferences.js';

class MemoryStorage{
  #values=new Map();
  getItem(key){return this.#values.has(key)?this.#values.get(key):null;}
  setItem(key,value){this.#values.set(String(key),String(value));}
  removeItem(key){this.#values.delete(String(key));}
  clear(){this.#values.clear();}
}

function withStorage(fn){
  const previous=globalThis.localStorage;
  globalThis.localStorage=new MemoryStorage();
  try{return fn();}
  finally{
    if(previous===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=previous;
  }
}

test('i18n separa idioma de locale y expone los cuatro bundles aprobados',()=>withStorage(()=>{
  assert.deepEqual(
    IBERFIT_LANGUAGE_CATALOG.map((item)=>item.value),
    ['es','en','fr','pt'],
  );

  assert.deepEqual(
    iberfitLanguageOptions().map((item)=>item.value),
    ['es','en','fr','pt'],
  );

  assert.equal(iberfitPlannedLanguages().length,4);
  assert.equal(getIberfitLanguage(),'es');
  assert.equal(getIberfitLocale(),'es-CL');

  assert.deepEqual(
    iberfitLocaleOptions('es').map((item)=>item.value),
    ['es-CL','es-ES'],
  );

  assert.equal(setIberfitLanguage('en'),'en');
  assert.equal(getIberfitLanguage(),'en');
  assert.equal(getIberfitLocale('en'),'en-GB');

  assert.equal(
    setIberfitLocale('en-US',{language:'en'}),
    'en-US',
  );
  assert.equal(getIberfitLocale('en'),'en-US');

  assert.equal(setIberfitLanguage('es'),'es');
  assert.equal(getIberfitLanguage(),'es');
  assert.equal(getIberfitLocale('es'),'es-CL');
}));

test('preferencias sociales son privadas por defecto y aisladas por cuenta',()=>withStorage(()=>{
  const a=readIberfitExperiencePreferences('user-a');
  const b=readIberfitExperiencePreferences('user-b');

  assert.equal(a.social.sharingEnabled,false);
  assert.equal(b.social.sharingEnabled,false);

  updateIberfitExperiencePreference(
    'user-a',
    'social.sharingEnabled',
    true,
  );
  updateIberfitExperiencePreference(
    'user-a',
    'social.audience',
    'coach',
  );
  updateIberfitExperiencePreference(
    'user-a',
    'social.shareMilestones',
    true,
  );

  const nextA=readIberfitExperiencePreferences('user-a');
  const nextB=readIberfitExperiencePreferences('user-b');
  const policy=socialPolicyFromPreferences(nextA);

  assert.equal(policy.visibility,'coach');
  assert.equal(policy.shareMilestones,true);
  assert.equal(policy.automaticPublishing,false);
  assert.equal(policy.leaderboardEnabled,false);
  assert.equal(nextB.social.sharingEnabled,false);
}));

test('avisos registran consentimiento sin afirmar push real',()=>withStorage(()=>{
  updateIberfitExperiencePreference(
    'user-a',
    'notifications.sessionReminders',
    true,
  );

  const preferences=
    readIberfitExperiencePreferences('user-a');

  const notifications=
    notificationConsentFromPreferences(preferences);

  assert.equal(notifications.sessionReminders,true);
  assert.equal(notifications.pushServiceActive,false);
  assert.equal(
    notifications.essentialSyncWarningsAlwaysVisible,
    true,
  );
}));

test('Ajustes expone controles separados y mantiene bloqueos de privacidad',()=>{
  const render=fs.readFileSync(
    new URL('../src/m26/modules/route-render.js',import.meta.url),
    'utf8',
  );
  const shell=fs.readFileSync(
    new URL('../src/m26/shell/shell-controller.js',import.meta.url),
    'utf8',
  );

  assert.match(render,/data-m26-ui-language/);
  assert.match(render,/data-m26-ui-locale/);
  assert.match(render,/data-m26-preference="social\.sharingEnabled"/);
  assert.match(render,/publicación automática desactivada/);
  assert.match(render,/ranking público desactivado/);
  assert.match(render,/No se solicita permiso push/);

  assert.match(shell,/RC71_2_PREFERENCES_CHANGE_BEGIN/);
  assert.match(shell,/updateIberfitExperiencePreference/);
});
