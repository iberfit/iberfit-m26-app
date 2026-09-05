import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readIberfitExperiencePreferences,
  updateIberfitExperiencePreference,
  clearIberfitExperiencePreferences,
} from '../src/m26/ui/preferences.js';
import {enhanceAdminShellMarkup} from '../src/m26/admin/shell-enhancer.js';

function memoryStorage(){
  const values=new Map();
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
  };
}

const shellMarkup='<div class="m26-shell"><nav aria-label="Navegación IBERFIT"></nav><details class="m26-settings-menu"><section class="m26-settings-popover"><p class="m26-settings-hint">Local</p><button type="button" class="m26-primary-action" data-m26-area="admin-configuracion">Abrir todos los ajustes</button></section></details></div>';

function adminVm(preferences){
  return {
    mode:'authenticated',
    identity:{id:'admin-1',role:'admin'},
    experiencePreferences:preferences,
  };
}

test('preferencias globales son opt-in y se aíslan por identidad',()=>{
  const previous=globalThis.localStorage;
  globalThis.localStorage=memoryStorage();
  try{
    const defaults=readIberfitExperiencePreferences('admin-1');
    assert.equal(defaults.notifications.sessionReminders,false);
    assert.equal(defaults.notifications.coachMessages,false);
    assert.equal(defaults.social.sharingEnabled,false);
    assert.equal(defaults.social.audience,'private');

    updateIberfitExperiencePreference('admin-1','notifications.sessionReminders',true);
    updateIberfitExperiencePreference('admin-1','social.sharingEnabled',true);
    updateIberfitExperiencePreference('admin-1','social.audience','coach');
    updateIberfitExperiencePreference('admin-1','social.shareSessionSummary',true);

    const saved=readIberfitExperiencePreferences('admin-1');
    assert.equal(saved.notifications.sessionReminders,true);
    assert.equal(saved.social.sharingEnabled,true);
    assert.equal(saved.social.audience,'coach');
    assert.equal(saved.social.shareSessionSummary,true);
    assert.equal(readIberfitExperiencePreferences('admin-2').social.sharingEnabled,false);

    updateIberfitExperiencePreference('admin-1','social.sharingEnabled',false);
    const revoked=readIberfitExperiencePreferences('admin-1');
    assert.equal(revoked.social.sharingEnabled,false);
    assert.equal(revoked.social.audience,'private');
  }finally{
    clearIberfitExperiencePreferences('admin-1');
    if(previous===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=previous;
  }
});

test('shell Admin integra ajustes personales sin sustituir configuración operativa',()=>{
  const markup=enhanceAdminShellMarkup(shellMarkup,adminVm(readIberfitExperiencePreferences('admin-contract')));
  assert.match(markup,/m26-admin-shell/);
  assert.match(markup,/data-m26-admin-personal-settings/);
  assert.match(markup,/Preferencias personales/);
  assert.match(markup,/no modifican la configuración operativa de IBERFIT/);
  assert.match(markup,/data-m26-area="admin-configuracion"/);

  for(const path of [
    'notifications.sessionReminders',
    'notifications.scheduleChanges',
    'notifications.planPublished',
    'notifications.coachMessages',
    'notifications.challenges',
    'notifications.milestones',
    'social.sharingEnabled',
    'social.audience',
    'social.shareSessionSummary',
    'social.shareMilestones',
  ]){
    assert.match(markup,new RegExp(`data-m26-preference="${path.replaceAll('.','\\.')}"`));
  }

  assert.match(markup,/data-m26-preference="social\.audience" disabled aria-disabled="true"/);
  assert.match(markup,/data-m26-preference="social\.shareSessionSummary" disabled aria-disabled="true"/);
  assert.match(markup,/No existe publicación automática ni ranking público/);
  assert.match(markup,/No se promete entrega push/);
});

test('shell no Admin permanece intacto',()=>{
  const client=enhanceAdminShellMarkup(shellMarkup,{mode:'authenticated',identity:{role:'client'}});
  assert.equal(client,shellMarkup);
});
