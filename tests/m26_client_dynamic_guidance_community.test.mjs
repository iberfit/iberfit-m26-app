import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,
  clientContextualGuideTipForArea,
  clientContextualGuideTipsForArea,
  clientContextualGuideScopeKey,
  normalizeClientContextualGuideState,
  legacyClientContextualGuideSeed,
  createClientContextualGuideRepository,
  __clientContextualGuideInternals,
} from '../src/m26/onboarding/client-contextual-guide.js';
import {renderChallengesRoute,renderHoyRoute,renderRouteView} from '../src/m26/modules/route-render.js';
import {progressSummaryHasEvidence} from '../src/m26/engagement/progress-engine.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Client guide is contextual, can expose more than one useful hint on Today, and includes challenges/community',()=>{
  assert.equal(CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,'iberfit.client-contextual-guide.v1');
  assert.equal(clientContextualGuideTipForArea('clientes'),null);

  const today=clientContextualGuideTipsForArea('hoy');
  assert.deepEqual(
    today.map((tip)=>tip.id),
    [
      'client-moment-session-ready',
      'client-context-plan-ready',
      'client-context-challenge-ready',
      'client-moment-progress-ready',
      'client-context-today',
      'client-feature-challenges-community',
    ]
  );
  assert.equal(today[0].kind,'moment');
  assert.equal(today[0].actionArea,'sesion');
  assert.deepEqual(today[0].seenAlso,['client-context-session']);
  assert.equal(today[1].actionArea,'planificacion');
  assert.deepEqual(today[1].seenAlso,['client-context-plan']);
  assert.equal(today[2].actionArea,'retos');
  assert.equal(today[3].actionArea,'progreso');
  assert.deepEqual(today[3].seenAlso,['client-context-progress']);
  assert.equal(today.at(-1).kind,'feature');
  assert.deepEqual(today.at(-1).excludeSelectors,['[data-m26-client-guide="challenge-entry"]']);

  for(const area of ['planificacion','sesion','progreso','actividad','mensajes','retos','ajustes']){
    const tip=clientContextualGuideTipForArea(area);
    assert.ok(tip,area);
    assert.equal(tip.area,area);
  }
  assert.equal(clientContextualGuideTipForArea('retos').id,'client-context-challenges');
});

test('Client guide persistence stores only safe hint ids, including persistent dismissals, under hashed identity scope',()=>{
  const raw='client-private-123';
  const key=clientContextualGuideScopeKey({userId:raw,role:'client'});
  assert.match(key,/^iberfit\.m26\.client-context-guide\.v1:[a-f0-9]{8}$/u);
  assert.doesNotMatch(key,/client-private-123/u);
  assert.equal(clientContextualGuideScopeKey({userId:raw,role:'coach'}),null);

  const calls=[];
  const repo=createClientContextualGuideRepository({storage:{
    getItem(){return null;},
    setItem(k,v){calls.push([k,v]);},
  }});
  repo.write(key,{
    seenTipIds:['client-context-today','client-context-today','not-real'],
    dismissedTipIds:['client-context-progress','not-real'],
    health:{pain:9},
    email:'secret@example.com',
  });
  const stored=JSON.parse(calls.at(-1)[1]);
  assert.deepEqual(stored.seenTipIds,['client-context-today']);
  assert.deepEqual(stored.dismissedTipIds,['client-context-progress']);
  assert.deepEqual(Object.keys(stored).sort(),['dismissedTipIds','legacyMigrated','schemaVersion','seenTipIds']);
  assert.doesNotMatch(JSON.stringify(stored),/pain|secret@example\.com/u);
});

test('Legacy client onboarding state migrates without repeating already-known areas',()=>{
  const userId='legacy-client-1';
  const key=clientContextualGuideScopeKey({userId,role:'client'});
  const identityHash=key.split(':').at(-1);
  const values=new Map([
    [
      `iberfit.m26.progressive-onboarding.v1:client:${identityHash}`,
      JSON.stringify({visited:['client-today','client-plan','client-session']}),
    ],
  ]);
  const seed=legacyClientContextualGuideSeed({
    userId,
    storage:{getItem(k){return values.get(k)||null;}},
  });
  assert.ok(seed.seenTipIds.includes('client-context-today'));
  assert.ok(seed.seenTipIds.includes('client-context-plan-ready'));
  assert.ok(seed.seenTipIds.includes('client-context-plan'));
  assert.ok(seed.seenTipIds.includes('client-moment-session-ready'));
  assert.ok(seed.seenTipIds.includes('client-context-session'));
  assert.equal(seed.seenTipIds.includes('client-context-progress'),false);
  assert.equal(seed.legacyMigrated,true);
});

test('Legacy completed or skipped guided tour is respected while dynamic help remains manually reopenable',()=>{
  const userId='legacy-client-2';
  const key=clientContextualGuideScopeKey({userId,role:'client'});
  const identityHash=key.split(':').at(-1);

  const completed=legacyClientContextualGuideSeed({
    userId,
    storage:{getItem(k){
      return k===`iberfit.m26.guided-onboarding.v1:client:${identityHash}`
        ?JSON.stringify({status:'completed',onboardingCompletedVersion:1})
        :null;
    }},
  });
  assert.equal(completed.legacyMigrated,true);
  assert.ok(completed.seenTipIds.includes('client-context-progress'));
  assert.ok(completed.seenTipIds.includes('client-context-messages'));

  const skipped=legacyClientContextualGuideSeed({
    userId,
    storage:{getItem(k){
      return k===`iberfit.m26.guided-onboarding.v1:client:${identityHash}`
        ?JSON.stringify({status:'skipped',onboardingSkippedVersion:1})
        :null;
    }},
  });
  assert.ok(skipped.dismissedTipIds.includes('client-context-today'));
  assert.ok(skipped.dismissedTipIds.includes('client-context-challenges'));
});

test('Client contextual guide has no numbered tour/checklist, does not observe the whole DOM, and protects mobile/a11y behaviour',()=>{
  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/data-m26-client-context-guide/u);
  assert.match(guide,/data-m26-client-context-guide-ack/u);
  assert.match(guide,/data-m26-client-context-guide-later/u);
  assert.match(guide,/aria-modal="false"/u);
  assert.match(guide,/min-height:44px/u);
  assert.match(guide,/safe-area-inset-bottom/u);
  assert.match(guide,/prefers-reduced-motion/u);
  assert.match(guide,/isVisibleInViewport/u);
  assert.match(guide,/positionDialog/u);
  assert.match(guide,/doc\?\.addEventListener\?\.\('click',click\)/u);
  assert.doesNotMatch(guide,/MutationObserver/u);
  assert.doesNotMatch(guide,/Paso \{current\}|data-m26-guided-tour-next|data-m26-guided-tour-previous|<progress/iu);
});

test('Guía IBERFIT uses the official living brand mark without becoming an interactive mascot or blocking Live Workout',()=>{
  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/data-m26-client-guide-presence/u);
  assert.match(guide,/src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(guide,/aria-hidden="true"/u);
  assert.match(guide,/pointer-events:none/u);
  assert.match(guide,/m26-client-guide-arrive/u);
  assert.match(guide,/left 280ms/u);
  assert.match(guide,/top 280ms/u);
  assert.match(guide,/prefers-reduced-motion/u);
  assert.doesNotMatch(guide,/animation:[^;]*infinite/iu);
  assert.doesNotMatch(guide,/MutationObserver|setInterval/u);
  assert.match(guide,/resolvedTarget&&resolvedTarget!==activeTarget/u);
  assert.match(guide,/openCurrent\(\)\{\s*if\(clientGuideSuppressed\(root\)\)return false;/u);

  const {clientGuideSuppressed,positionPresence}=__clientContextualGuideInternals;
  assert.equal(clientGuideSuppressed({querySelector(){return {dataset:{}};}}),true);
  assert.equal(clientGuideSuppressed({querySelector(){return null;}}),false);

  const classes=new Set();
  const attrs=new Set();
  const presence={
    style:{removeProperty(name){delete this[name];}},
    classList:{
      add(...names){for(const name of names)classes.add(name);},
      remove(...names){for(const name of names)classes.delete(name);},
      contains(name){return classes.has(name);},
    },
    hasAttribute(name){return attrs.has(name);},
    setAttribute(name){attrs.add(name);},
    offsetWidth:48,
  };
  const target={getBoundingClientRect(){return {left:100,right:300,top:80,bottom:160,width:200,height:80};}};
  const scope={
    innerWidth:1200,
    innerHeight:800,
    requestAnimationFrame(callback){callback();return 1;},
    matchMedia(){return {matches:false};},
  };
  assert.equal(positionPresence(presence,target,scope,{arriving:true}),true);
  assert.equal(presence.style.left,'310px');
  assert.equal(presence.style.top,'96px');
  assert.ok(classes.has('is-visible'));
  assert.ok(classes.has('is-arriving'));
  assert.ok(attrs.has('data-m26-client-guide-positioned'));

  const offscreen={getBoundingClientRect(){return {left:100,right:300,top:900,bottom:980,width:200,height:80};}};
  assert.equal(positionPresence(presence,offscreen,scope),false);
  assert.equal(classes.has('is-visible'),false);
});

test('Legacy linear checklist is hidden for Client while Coach and Admin keep the durable tour lifecycle',()=>{
  const progressive=read('src/m26/onboarding/progressive-onboarding.js');
  const guided=read('src/m26/onboarding/guided-tour.js');
  assert.match(progressive,/createClientContextualGuideController/u);
  assert.match(progressive,/context\.role==='client'\|\|area!==context\.track\.home/u);
  assert.match(progressive,/if\(context\.role!=='client'\)/u);
  assert.match(progressive,/data-m26-client-contextual-guide-enabled/u);
  assert.match(guided,/role==='client'.*data-m26-client-contextual-guide-enabled/su);
  assert.match(progressive,/launcher\.removeAttribute\?\.\('data-m26-area'\)/u);
  assert.match(progressive,/launcher\.removeAttribute\?\.\('data-progressive-onboarding-open'\)/u);
  assert.match(progressive,/guidedTour\.mount/u);
  assert.match(progressive,/clientContextGuide\.mount/u);
  assert.match(progressive,/guidedTour\.destroy/u);
  assert.match(progressive,/clientContextGuide\.destroy/u);
});

test('Today shows an actual challenge only when there is useful challenge context',()=>{
  const base={
    role:'client',
    clients:[{name:'Cliente',iri:null,nextAction:null}],
    appointments:[],
    upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{},
  };

  const emptyHtml=renderHoyRoute({...base,challengePreview:null});
  assert.doesNotMatch(emptyHtml,/data-m26-community-entry/u);
  assert.doesNotMatch(emptyHtml,/data-m26-client-guide="challenge-entry"/u);

  const activeHtml=renderHoyRoute({
    ...base,
    challengePreview:{
      id:'plan',
      title:'Cumplir tu planificación',
      detail:'Progreso confirmado.',
      current:3,
      target:4,
      unit:'sesiones',
      progress:75,
      completed:false,
      available:true,
    },
  });
  assert.match(activeHtml,/data-m26-community-entry/u);
  assert.match(activeHtml,/data-m26-client-guide="challenge-entry"/u);
  assert.match(activeHtml,/Cumplir tu planificación/u);
  assert.match(activeHtml,/3 sesiones/u);
  assert.match(activeHtml,/75%/u);
  assert.match(activeHtml,/data-m26-area="retos"/u);
});

test('Plan and session moments on Today are driven by real availability',()=>{
  const base={
    role:'client',
    clients:[{name:'Cliente',iri:null,nextAction:null}],
    appointments:[],
    upcoming:[],
    operations:{},
  };
  const withoutContent=renderHoyRoute({...base,rc39:{sessionProjections:[]}});
  assert.doesNotMatch(withoutContent,/data-m26-client-guide="plan-entry"/u);
  assert.doesNotMatch(withoutContent,/data-m26-client-guide="session-entry"/u);

  const planOnly=renderHoyRoute({
    ...base,
    clients:[{name:'Cliente',iri:null,nextAction:null,cycle:{name:'Fuerza base'}}],
    rc39:{sessionProjections:[]},
  });
  assert.match(planOnly,/data-m26-client-guide="plan-entry"/u);
  assert.doesNotMatch(planOnly,/data-m26-client-guide="session-entry"/u);

  const withSession=renderHoyRoute({
    ...base,
    rc39:{sessionProjections:[{
      id:'S1',
      visible:true,
      canClientExecute:false,
      session:{title:'Sesión',blocks:[]},
    }]},
  });
  assert.match(withSession,/data-m26-client-guide="plan-entry"/u);
  assert.match(withSession,/data-m26-client-guide="session-entry"/u);
});

test('Moment guidance prioritizes actionable facts and avoids duplicate route explanations',()=>{
  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/client-moment-session-ready[\s\S]*priority:120/u);
  assert.match(guide,/sort\(\(left,right\)=>Number\(right\.priority\|\|0\)-Number\(left\.priority\|\|0\)\)/u);
  assert.match(guide,/\.\.\.\(Array\.isArray\(tip\.seenAlso\)\?tip\.seenAlso:\[\]\)/u);
  assert.match(guide,/tip\.excludeSelectors/u);
  assert.match(guide,/client-feature-challenges-community/u);
  const shell=renderRouteView({kind:'hoy',role:'client',clients:[],appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{}});
  assert.match(shell,/m26-client-bottom-nav-more/u);
  assert.match(shell,/Retos y comunidad/u);
});
test('Meaningful progress evidence is centralized and missing data never becomes progress',()=>{
  assert.equal(progressSummaryHasEvidence(null),false);
  assert.equal(progressSummaryHasEvidence({
    completedSessions:0,
    checkins:0,
    iriCurrent:null,
    wearable:{daysWithData:0,metrics:{},providers:[]},
  }),false);
  assert.equal(progressSummaryHasEvidence({
    completedSessions:1,
    checkins:0,
    iriCurrent:null,
    wearable:{daysWithData:0,metrics:{},providers:[]},
  }),true);
  assert.equal(progressSummaryHasEvidence({
    completedSessions:0,
    checkins:1,
    iriCurrent:null,
    wearable:{daysWithData:0,metrics:{},providers:[]},
  }),true);
  assert.equal(progressSummaryHasEvidence({
    completedSessions:0,
    checkins:0,
    iriCurrent:0,
    wearable:{daysWithData:0,metrics:{},providers:[]},
  }),true);
  assert.equal(progressSummaryHasEvidence({
    completedSessions:0,
    checkins:0,
    iriCurrent:null,
    wearable:{daysWithData:0,metrics:{steps:4200},providers:[]},
  }),true);
  assert.equal(progressSummaryHasEvidence({
    completedSessions:0,
    checkins:0,
    iriCurrent:null,
    wearable:{daysWithData:0,metrics:{},providers:[]},
  },{timelineCount:1}),true);
});

test('Today exposes the progress moment only when the view model confirms meaningful progress',()=>{
  const base={
    kind:'hoy',
    role:'client',
    clients:[{name:'Cliente',iri:null,nextAction:null}],
    appointments:[],
    upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{},
  };
  const withoutProgress=renderRouteView({...base,progressReady:false});
  assert.doesNotMatch(withoutProgress,/data-m26-client-guide="progress-entry"/u);

  const withProgress=renderRouteView({...base,progressReady:true});
  assert.match(withProgress,/data-m26-area="progreso" data-m26-client-guide="progress-entry"/u);
});

test('Planning, session, progress and challenge guidance targets are conditional rather than generic route fallbacks',()=>{
  const source=read('src/m26/modules/route-render.js');
  const viewModel=read('src/m26/modules/route-view-model.js');
  assert.match(viewModel,/const progressReady=progressSummaryHasEvidence\(clientProgressSummary\)/u);
  assert.match(viewModel,/progressReady,/u);
  assert.match(source,/data-m26-client-guide="plan-surface"/u);
  assert.match(source,/data-m26-client-guide="session-surface"/u);
  assert.match(source,/data-m26-client-guide="progress-surface"/u);
  assert.match(source,/progressSummaryHasEvidence\(summary,\{timelineCount:vm\.timeline\.length\}\)/u);
  assert.match(source,/data-m26-client-guide="challenge-surface"/u);

  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.doesNotMatch(guide,/\[data-client-bottom-nav-route="planificacion"\]\]/u);
  assert.doesNotMatch(guide,/\[data-client-bottom-nav-route="sesion"\]\]/u);
  assert.doesNotMatch(guide,/\[data-client-bottom-nav-route="progreso"\]\]/u);
});

test('Challenges route stays private by default, does not fake social state, and only exposes the contextual target when a challenge is active',()=>{
  const emptyHtml=renderChallengesRoute({
    clientId:'client-1',
    challenges:[],
    social:{visibility:'private',sharingEnabled:false,audience:'private'},
  });
  assert.match(emptyHtml,/Constancia, objetivos y comunidad con criterio/u);
  assert.match(emptyHtml,/Tus retos e hitos permanecen privados/u);
  assert.match(emptyHtml,/no simula comunidad ni posiciones que no existan/u);
  assert.doesNotMatch(emptyHtml,/data-m26-client-guide="challenge-surface"/u);
  assert.doesNotMatch(emptyHtml,/puesto #|ranking actual|participantes activos/iu);

  const activeHtml=renderChallengesRoute({
    clientId:'client-1',
    challenges:[{
      id:'plan',
      title:'Cumplir tu planificación',
      detail:'Datos confirmados.',
      current:2,
      target:4,
      unit:'sesiones',
      available:true,
      progress:50,
      completed:false,
    }],
    social:{visibility:'private',sharingEnabled:false,audience:'private'},
  });
  assert.match(activeHtml,/data-m26-client-guide="challenge-surface"/u);
});

test('Client bottom navigation remains five primary destinations and Retos stays reachable through Más',()=>{
  const source=read('src/m26/modules/route-render.js');
  const html=renderRouteView({kind:'placeholder',role:'client',title:'Prueba'});
  for(const area of ['hoy','planificacion','sesion','progreso','retos'])assert.match(html,new RegExp(`data-m26-area="${area}"`,'u'));
  assert.match(source,/Retos y comunidad<\/span><small>Constancia, objetivos e hitos/u);
  assert.doesNotMatch(source,/CLIENT_BOTTOM_NAV_ITEMS[\s\S]*?\{key:'retos'/u);
});

test('PWA shell includes contextual guide so installed clients do not lose guidance offline after update',()=>{
  const sw=read('public/m26/sw.js');
  assert.match(sw,/"\/src\/m26\/onboarding\/client-contextual-guide\.js"/u);
});
