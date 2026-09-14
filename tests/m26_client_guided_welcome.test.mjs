import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CLIENT_GUIDED_WELCOME_VERSION,
  CLIENT_GUIDED_WELCOME_SCHEMA_VERSION,
  clientGuidedWelcomeScopeKey,
  normalizeClientGuidedWelcomeState,
  clientGuidedWelcomeLegacySeed,
  clientGuidedWelcomeStep,
  __clientGuidedWelcomeInternals,
} from '../src/m26/onboarding/client-guided-welcome.js';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Client guided welcome is a short Genie-led journey that starts and finishes on Today',()=>{
  const {STEPS,SOURCE_COPY}=__clientGuidedWelcomeInternals;
  assert.equal(CLIENT_GUIDED_WELCOME_VERSION,1);
  assert.equal(CLIENT_GUIDED_WELCOME_SCHEMA_VERSION,'iberfit.client-guided-welcome.v1');
  assert.equal(STEPS.length,6);
  assert.deepEqual(
    STEPS.map((step)=>step.area),
    ['hoy','planificacion','sesion','progreso','mensajes','hoy']
  );
  assert.deepEqual(
    STEPS.map((step)=>step.guideState),
    ['idle','pointing','pointing','pointing','pointing','success']
  );
  assert.equal(clientGuidedWelcomeStep(0).id,'welcome-home');
  assert.equal(clientGuidedWelcomeStep(99).id,'welcome-finish');
  assert.match(SOURCE_COPY['welcome-home.title'],/Antes de dejarte a tu aire/u);
  assert.match(SOURCE_COPY['welcome-plan.title'],/hoja de ruta/u);
  assert.match(SOURCE_COPY['welcome-session.title'],/vengo contigo/u);
  assert.match(SOURCE_COPY['welcome-finish.body'],/Guía IBERFIT/u);
  assert.doesNotMatch(Object.values(SOURCE_COPY).join(' '),/Paso\s+\d+\s+de\s+\d+/iu);
});

test('Guided welcome resolves canonical shell navigation before technical route kinds',()=>{
  const {currentArea}=__clientGuidedWelcomeInternals;
  const canonicalRoot={
    querySelector(selector){
      if(selector==='[data-m26-area][aria-current="page"]')return {getAttribute:()=> 'mensajes'};
      if(selector==='[data-client-bottom-nav-route]')return {getAttribute:()=> 'communication'};
      return null;
    },
  };
  assert.equal(currentArea(canonicalRoot),'mensajes');

  const fallbackRoot={
    querySelector(selector){
      if(selector==='[data-m26-area][aria-current="page"]')return null;
      if(selector==='[data-client-bottom-nav-route]')return {getAttribute:()=> 'communication-unavailable'};
      return null;
    },
  };
  assert.equal(currentArea(fallbackRoot),'mensajes');
});

test('Guided welcome persistence is client-only, hashed and contains no personal data',()=>{
  const key=clientGuidedWelcomeScopeKey({userId:'private-client-id',role:'client'});
  assert.match(key,/^iberfit\.m26\.client-guided-welcome\.v1:[a-f0-9]{8}$/u);
  assert.doesNotMatch(key,/private-client-id/u);
  assert.equal(clientGuidedWelcomeScopeKey({userId:'private-client-id',role:'coach'}),null);
  assert.deepEqual(
    normalizeClientGuidedWelcomeState({status:'in-progress',stepIndex:3}),
    {
      schemaVersion:'iberfit.client-guided-welcome.v1',
      status:'in-progress',
      stepIndex:3,
      completedVersion:0,
      skippedVersion:0,
    }
  );
  assert.equal(normalizeClientGuidedWelcomeState({status:'unknown',stepIndex:99}).status,'never');
  assert.equal(normalizeClientGuidedWelcomeState({status:'completed'}).completedVersion,1);
});

test('Existing users are not surprised by a new automatic tour, while genuinely new clients can receive it',()=>{
  const userId='legacy-client';
  const identityHash=clientGuidedWelcomeScopeKey({userId,role:'client'}).split(':').at(-1);
  const map=new Map();
  const storage={getItem(key){return map.get(key)||null;}};

  assert.equal(clientGuidedWelcomeLegacySeed({storage,userId}).status,'never');

  map.set(
    `iberfit.m26.client-context-guide.v1:${identityHash}`,
    JSON.stringify({seenTipIds:['client-context-today']})
  );
  assert.equal(clientGuidedWelcomeLegacySeed({storage,userId}).status,'completed');

  map.clear();
  map.set(
    `iberfit.m26.guided-onboarding.v1:client:${identityHash}`,
    JSON.stringify({status:'skipped',onboardingSkippedVersion:1})
  );
  assert.equal(clientGuidedWelcomeLegacySeed({storage,userId}).status,'skipped');
});

test('The Genie controls route movement instead of asking the client to find each destination',()=>{
  const source=read('src/m26/onboarding/client-guided-welcome.js');
  assert.match(source,/function navigate\(area\)/u);
  assert.match(source,/destination\.click\?\.\(\)/u);
  assert.match(source,/if\(state\.status==='never'\)\{\s*start\(ctx\)/u);
  assert.match(source,/if\(current!==step\.area\)\{\s*navigate\(step\.area\)/u);
  assert.match(source,/data-m26-client-guided-welcome-next/u);
  assert.match(source,/data-m26-client-guided-welcome-pause/u);
  assert.doesNotMatch(source,/data-m26-guided-tour-next|data-m26-guided-tour-previous|<progress/iu);
});

test('Welcome and contextual help never compete, and Live Workout still wins',()=>{
  const progressive=read('src/m26/onboarding/progressive-onboarding.js');
  const contextual=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(progressive,/createClientGuidedWelcomeController/u);
  assert.match(progressive,/syncClientContextualGuideMode\(\);\s*guidedTour\.mount/u);
  assert.match(progressive,/clientGuidedWelcome\.mount\?\.\(\);\s*clientContextGuide\.mount/u);
  assert.match(progressive,/clientGuidedWelcome\.destroy\?\.\(\);\s*clientContextGuide\.destroy/u);
  assert.match(progressive,/clientGuidedWelcome\.refresh\?\.\(\);\s*clientContextGuide\.refresh/u);
  assert.match(contextual,/data-m26-client-guided-welcome-active/u);
  assert.match(contextual,/data-session-live-v3/u);
});

test('Guided welcome is accessible, motion-safe, responsive and animation-asset ready',()=>{
  const source=read('src/m26/onboarding/client-guided-welcome.js');
  assert.match(source,/aria-modal="false"/u);
  assert.match(source,/min-height:44px/u);
  assert.match(source,/safe-area-inset-bottom/u);
  assert.match(source,/prefers-reduced-motion:reduce/u);
  assert.match(source,/data-m26-client-guide-state/u);
  assert.match(source,/src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(source,/guideState:'idle'/u);
  assert.match(source,/guideState:'pointing'/u);
  assert.match(source,/guideState:'success'/u);
  assert.match(source,/const final=copyId==='welcome-finish'/u);
  assert.match(source,/show\(step,\{focus:step\.id==='welcome-finish'\}\)/u);
  assert.doesNotMatch(source,/animation:[^;]*infinite/iu);
  assert.doesNotMatch(source,/setInterval|MutationObserver/u);
});

test('PWA shell precaches the guided welcome so installed clients keep the journey offline after update',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/"\/src\/m26\/onboarding\/client-guided-welcome\.js"/u);
});
