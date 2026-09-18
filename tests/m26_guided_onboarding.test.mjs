import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  GUIDED_ONBOARDING_VERSION,
  GUIDED_ONBOARDING_SCHEMA_VERSION,
  guidedOnboardingTrack,
  guidedOnboardingSettingsArea,
  guidedOnboardingScopeKey,
  normalizeGuidedOnboardingState,
  createGuidedOnboardingRepository,
  resolveGuidedOnboardingSteps,
  shouldAutoOpenGuidedOnboarding,
  guidedOnboardingCopy,
  guidedOnboardingTranslationCoverage,
  renderGuidedOnboardingDialog,
  renderGuidedOnboardingSettings,
} from '../src/m26/onboarding/guided-tour.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('guided onboarding uses one versioned engine for Client Coach and Admin',()=>{
  assert.equal(GUIDED_ONBOARDING_VERSION,2);
  assert.equal(GUIDED_ONBOARDING_SCHEMA_VERSION,'iberfit.guided-onboarding.v1');
  for(const role of ['client','coach','admin']){
    const tour=guidedOnboardingTrack(role);
    assert.ok(tour,role);
    assert.equal(tour.role,role);
    assert.equal(tour.steps.length,7);
    assert.equal(new Set(tour.steps.map((step)=>step.id)).size,7);
  }
  assert.equal(guidedOnboardingTrack('unknown'),null);
});

test('guided onboarding references only real canonical role surfaces',()=>{
  const nav=read('src/m26/shell/navigation.js');
  const admin=read('src/m26/admin/navigation.js');
  for(const step of guidedOnboardingTrack('coach').steps){
    assert.match(nav,new RegExp(`['"]${step.area}['"]`,'u'),step.id);
  }
  for(const step of guidedOnboardingTrack('client').steps){
    assert.match(nav,new RegExp(`['"]${step.area}['"]`,'u'),step.id);
  }
  for(const step of guidedOnboardingTrack('admin').steps){
    assert.match(admin,new RegExp(`['"]${step.area}['"]`,'u'),step.id);
  }
  assert.equal(guidedOnboardingSettingsArea('client'),'ajustes');
  assert.equal(guidedOnboardingSettingsArea('coach'),'ajustes');
  assert.equal(guidedOnboardingSettingsArea('admin'),'admin-configuracion');
});

test('guided onboarding persistence is identity-scoped versioned and privacy-minimal',()=>{
  const raw='private-user-123';
  const key=guidedOnboardingScopeKey({userId:raw,role:'coach'});
  assert.match(key,/^iberfit\.m26\.guided-onboarding\.v1:coach:[a-f0-9]{8}$/u);
  assert.doesNotMatch(key,/private-user-123/u);

  const calls=[];
  const repo=createGuidedOnboardingRepository({
    storage:{
      getItem(){return null;},
      setItem(storageKey,value){calls.push([storageKey,value]);},
    },
  });
  repo.write(key,{
    role:'coach',
    status:'in-progress',
    activeStepId:'coach-action-center',
    email:'secret@example.com',
    health:{hrv:44},
  });
  const body=JSON.parse(calls.at(-1)[1]);
  assert.deepEqual(Object.keys(body).sort(),[
    'activeStepId',
    'onboardingCompletedVersion',
    'onboardingSkippedVersion',
    'onboardingVersion',
    'role',
    'schemaVersion',
    'status',
  ]);
  assert.equal(JSON.stringify(body).includes('secret@example.com'),false);
  assert.equal(JSON.stringify(body).includes('hrv'),false);
});

test('guided onboarding distinguishes never in-progress completed skipped and version state',()=>{
  const never=normalizeGuidedOnboardingState({},'client');
  assert.equal(never.status,'never');
  assert.equal(never.onboardingCompletedVersion,0);
  assert.equal(shouldAutoOpenGuidedOnboarding(never),true);

  const progress=normalizeGuidedOnboardingState({status:'in-progress',activeStepId:'client-session'},'client');
  assert.equal(progress.status,'in-progress');
  assert.equal(progress.activeStepId,'client-session');
  assert.equal(shouldAutoOpenGuidedOnboarding(progress),true);

  const completed=normalizeGuidedOnboardingState({
    status:'completed',
    onboardingCompletedVersion:GUIDED_ONBOARDING_VERSION,
  },'client');
  assert.equal(completed.status,'completed');
  assert.equal(shouldAutoOpenGuidedOnboarding(completed),false);

  const skipped=normalizeGuidedOnboardingState({
    status:'skipped',
    onboardingSkippedVersion:GUIDED_ONBOARDING_VERSION,
  },'client');
  assert.equal(skipped.status,'skipped');
  assert.equal(shouldAutoOpenGuidedOnboarding(skipped),false);

  const legacyCoach=normalizeGuidedOnboardingState({
    status:'completed',
    onboardingCompletedVersion:1,
  },'coach');
  assert.equal(legacyCoach.status,'never');
  assert.equal(shouldAutoOpenGuidedOnboarding(legacyCoach),true);
});

test('guided onboarding safely skips missing targets and accepts semantic fallbacks',()=>{
  const target={id:'today'};
  const root={
    querySelector(selector){
      if(selector==='[data-m26-area="hoy"]')return target;
      return null;
    },
  };
  const coach=resolveGuidedOnboardingSteps({role:'coach',root});
  assert.ok(coach.some(({step})=>step.id==='coach-today'));
  const action=coach.find(({step})=>step.id==='coach-action-center');
  assert.ok(action);
  assert.equal(action.target,target);
  assert.equal(coach.some(({step})=>step.id==='coach-clients'),false);
});

test('guided onboarding translations are complete in ES EN FR PT without raw keys',()=>{
  const coverage=guidedOnboardingTranslationCoverage();
  assert.deepEqual(coverage.map((item)=>item.language),['es','en','fr','pt']);
  for(const item of coverage)assert.equal(item.complete,true,item.language);
  for(const language of ['es','en','fr','pt']){
    const title=guidedOnboardingCopy('step.client-session.title',{language});
    assert.ok(title);
    assert.notEqual(title,'step.client-session.title');
    const reopen=guidedOnboardingCopy('chrome.reopen',{language});
    assert.ok(reopen);
    assert.notEqual(reopen,'chrome.reopen');
  }
});

test('guided onboarding dialog is keyboard-accessible non-trapping and exposes progress',()=>{
  const step=guidedOnboardingTrack('client').steps[0];
  const html=renderGuidedOnboardingDialog({role:'client',step,index:0,total:7,language:'es'});
  assert.match(html,/role="dialog"/u);
  assert.match(html,/aria-modal="false"/u);
  assert.match(html,/aria-labelledby="m26-guided-tour-title"/u);
  assert.match(html,/aria-describedby="m26-guided-tour-copy"/u);
  assert.match(html,/data-m26-guided-tour-close/u);
  assert.match(html,/data-m26-guided-tour-skip/u);
  assert.match(html,/data-m26-guided-tour-next/u);
  assert.match(html,/<progress max="7" value="1">/u);

  const source=read('src/m26/onboarding/guided-tour.js');
  assert.match(source,/event\.key!=='Escape'/u);
  assert.match(source,/prefers-reduced-motion: reduce/u);
  assert.match(source,/scrollIntoView/u);
  assert.match(source,/focus\?\./u);
  assert.doesNotMatch(source,/event\.key\s*===\s*['"]Tab['"]/u);
});

test('Coach and Admin first-use onboarding is Genie-led without turning Client generic tour into the same surface',()=>{
  for(const role of ['coach','admin']){
    const step=guidedOnboardingTrack(role).steps[0];
    const html=renderGuidedOnboardingDialog({role,step,index:0,total:7,language:'es'});
    assert.match(html,/class="m26-guided-tour is-genie-led"/u);
    assert.match(html,/data-m26-guided-tour-genie/u);
    assert.match(html,/data-m26-client-genie/u);
    assert.match(html,/Genio IBERFIT/u);
    assert.doesNotMatch(html,/<progress /u);
    assert.match(html,/m26-visually-hidden/u);
    assert.match(html,new RegExp(`data-m26-guided-tour-role="${role}"`,'u'));
  }

  const clientStep=guidedOnboardingTrack('client').steps[0];
  const clientHtml=renderGuidedOnboardingDialog({role:'client',step:clientStep,index:0,total:7,language:'es'});
  assert.doesNotMatch(clientHtml,/data-m26-guided-tour-genie/u);
  assert.match(clientHtml,/<progress max="7" value="1">/u);

  const source=read('src/m26/onboarding/guided-tour.js');
  assert.match(source,/pointer-events:none/u);
  assert.match(source,/prefers-reduced-motion:reduce/u);
  assert.match(source,/clientGenieVisualMarkup/u);
});

test('Coach and Admin keep independent first-use state for the same identity',()=>{
  const coach=guidedOnboardingScopeKey({userId:'carlos',role:'coach'});
  const admin=guidedOnboardingScopeKey({userId:'carlos',role:'admin'});
  assert.ok(coach);
  assert.ok(admin);
  assert.notEqual(coach,admin);
  assert.match(coach,/:coach:/u);
  assert.match(admin,/:admin:/u);
});

test('guided onboarding can be reopened from real settings surfaces',()=>{
  const html=renderGuidedOnboardingSettings({language:'en'});
  assert.match(html,/data-m26-guided-tour-settings/u);
  assert.match(html,/data-m26-guided-tour-open/u);
  const source=read('src/m26/onboarding/guided-tour.js');
  assert.match(source,/settingsArea:'ajustes'/u);
  assert.match(source,/settingsArea:'admin-configuracion'/u);
});

test('Coach tour includes Action Center without duplicating cockpit ranking',()=>{
  const guided=read('src/m26/onboarding/guided-tour.js');
  const shell=read('src/m26/shell/shell-controller.js');
  assert.match(guided,/coach-action-center/u);
  assert.match(guided,/data-m26-coach-action-center/u);
  assert.match(shell,/panel\.dataset\.m26CoachActionCenter='true'/u);
  assert.doesNotMatch(guided,/deriveCoachCockpit/u);
});

test('existing progressive onboarding lifecycle now owns the common guided tour too',()=>{
  const progressive=read('src/m26/onboarding/progressive-onboarding.js');
  const app=read('src/m26/app/application.js');
  assert.match(progressive,/createGuidedTourController/u);
  assert.match(progressive,/guidedTour\.mount/u);
  assert.match(progressive,/guidedTour\.destroy/u);
  assert.match(progressive,/guidedTour\.refresh/u);
  assert.match(app,/createProgressiveOnboardingController/u);
  assert.match(app,/\{name:'onboarding',controller:onboarding\}/u);
});

test('guided onboarding remains local-only and does not add transport database or external tour dependencies',()=>{
  const source=read('src/m26/onboarding/guided-tour.js');
  assert.doesNotMatch(source,/commandBus|transport\.|supabase|fetch\(|XMLHttpRequest|service_role/iu);
  assert.doesNotMatch(source,/driver\.js|driverjs|from ['"]driver/iu);
  assert.match(source,/localStorage/u);
});

test('guided onboarding refreshes from explicit shell lifecycle without observing the full workspace DOM',()=>{
  const source=read('src/m26/onboarding/guided-tour.js');
  assert.match(source,/root\.addEventListener\?\.\('m26:shell-rendered',refresh\)/u);
  assert.match(source,/root\.removeEventListener\?\.\('m26:shell-rendered',refresh\)/u);
  assert.doesNotMatch(source,/observer\.observe\(root,\{childList:true,subtree:true/u);
});

