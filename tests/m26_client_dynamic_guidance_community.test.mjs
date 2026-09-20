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
import {progressSummaryHasEvolutionEvidence} from '../src/m26/engagement/progress-engine.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const runtimeCss=read('src/m26/design/runtime-static.css');

test('Client guide is contextual, can expose more than one useful hint on Today, and includes challenges/community',()=>{
  assert.equal(CLIENT_CONTEXTUAL_GUIDE_SCHEMA_VERSION,'iberfit.client-contextual-guide.v1');
  assert.equal(clientContextualGuideTipForArea('clientes'),null);

  const today=clientContextualGuideTipsForArea('hoy');
  assert.deepEqual(
    today.map((tip)=>tip.id),
    [
      'client-moment-session-ready',
      'client-moment-adherence-review',
      'client-context-plan-ready',
      'client-context-challenge-ready',
      'client-moment-progress-ready',
      'client-context-today',
      'client-feature-challenges-community',
    ]
  );
  assert.equal(today[0].kind,'moment');
  assert.equal(today[0].actionArea,'sesion');
  assert.equal(today[0].repeatOnEvent,true);
  assert.deepEqual(today[0].seenAlso,['client-context-session','client-context-plan-ready']);
  assert.equal(today[1].actionArea,'progreso');
  assert.equal(today[1].repeatOnEvent,undefined);
  assert.equal(today[2].actionArea,'planificacion');
  assert.equal(today[2].repeatOnEvent,true);
  assert.deepEqual(today[2].seenAlso,['client-context-plan']);
  assert.equal(today[3].actionArea,'retos');
  assert.equal(today[3].repeatOnEvent,true);
  assert.equal(today[4].actionArea,'progreso');
  assert.equal(today[4].repeatOnEvent,undefined);
  assert.deepEqual(today[4].seenAlso,['client-context-progress']);
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
    seenEventKeys:['client-moment-session-ready:abcdef12','raw-session-id'],
    dismissedEventKeys:['client-context-plan-ready:1234abcd','secret@example.com'],
    health:{pain:9},
    email:'secret@example.com',
  });
  const stored=JSON.parse(calls.at(-1)[1]);
  assert.deepEqual(stored.seenTipIds,['client-context-today']);
  assert.deepEqual(stored.dismissedTipIds,['client-context-progress']);
  assert.deepEqual(stored.seenEventKeys,['client-moment-session-ready:abcdef12']);
  assert.deepEqual(stored.dismissedEventKeys,['client-context-plan-ready:1234abcd']);
  assert.deepEqual(
    Object.keys(stored).sort(),
    ['dismissedEventKeys','dismissedTipIds','legacyMigrated','schemaVersion','seenEventKeys','seenTipIds']
  );
  assert.doesNotMatch(JSON.stringify(stored),/pain|secret@example\.com|raw-session-id/u);
});

test('Recurring moments are keyed to opaque event receipts instead of being permanently silenced after the first session',()=>{
  const today=clientContextualGuideTipsForArea('hoy');
  const sessionTip=today.find((tip)=>tip.id==='client-moment-session-ready');
  const {eventReceiptKey,tipAvailableInState}=__clientContextualGuideInternals;
  const nodeA={getAttribute(name){return name==='data-m26-client-guide-event-key'?'session-event-a':null;}};
  const nodeB={getAttribute(name){return name==='data-m26-client-guide-event-key'?'session-event-b':null;}};
  const receiptA=eventReceiptKey(sessionTip,nodeA);
  const receiptB=eventReceiptKey(sessionTip,nodeB);
  assert.match(receiptA,/^client-moment-session-ready:[a-f0-9]{8}$/u);
  assert.match(receiptB,/^client-moment-session-ready:[a-f0-9]{8}$/u);
  assert.notEqual(receiptA,receiptB);
  assert.doesNotMatch(receiptA,/session-event-a/u);

  const state=normalizeClientContextualGuideState({
    seenTipIds:['client-moment-session-ready'],
    seenEventKeys:[receiptA],
  });
  assert.equal(tipAvailableInState(sessionTip,nodeA,state),false);
  assert.equal(tipAvailableInState(sessionTip,nodeB,state),true);
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
  assert.match(runtimeCss,/\.m26-client-context-guide-actions button[^}]*min-height:44px/u);
  assert.match(runtimeCss,/safe-area-inset-bottom/u);
  assert.match(runtimeCss,/prefers-reduced-motion/u);
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
  assert.match(runtimeCss,/\.m26-client-guide-presence\{[\s\S]*?pointer-events:none/u);
  assert.match(runtimeCss,/m26-client-guide-arrive/u);
  assert.match(runtimeCss,/transition:left 280ms/u);
  assert.match(runtimeCss,/,top 280ms/u);
  assert.match(runtimeCss,/prefers-reduced-motion/u);
  assert.doesNotMatch(runtimeCss,/\.m26-client-guide-presence[^}]*animation:[^;]*infinite/iu);
  assert.doesNotMatch(guide,/MutationObserver|setInterval/u);
  assert.match(guide,/resolvedTarget&&resolvedTarget!==activeTarget/u);
  assert.match(guide,/openCurrent\(\)\{\s*if\(clientGuideSuppressed\(root\)\)return false;/u);

  const {clientGuideSuppressed,positionPresence}=__clientContextualGuideInternals;
  assert.equal(clientGuideSuppressed({querySelector(){return {dataset:{}};}}),true);
  assert.equal(clientGuideSuppressed({querySelector(){return null;}}),false);

  const classes=new Set();
  const attrs=new Map();
  const presence={
    classList:{
      add(...names){for(const name of names)classes.add(name);},
      remove(...names){for(const name of names)classes.delete(name);},
      contains(name){return classes.has(name);},
    },
    hasAttribute(name){return attrs.has(name);},
    setAttribute(name,value=''){attrs.set(name,String(value));},
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
  assert.equal(attrs.get('data-m26-guide-placement'),'bottom');
  assert.equal(attrs.get('data-m26-client-guide-positioned'),'true');
  assert.ok(classes.has('is-visible'));
  assert.ok(classes.has('is-arriving'));

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
  assert.match(progressive,/context\.role==='client'[\s\S]*data-m26-client-context-guide-open/u);
  assert.match(progressive,/root\.querySelector\?\.\('\[data-progressive-onboarding-launcher\]'\)\?\.remove\?\.\(\)/u);
  assert.match(progressive,/if\(context\.role==='client'\)\{[\s\S]*?return;\s*\}\s*const host=root\.querySelector\?\.\('\.m26-topbar-actions'\)/u);
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
  assert.match(emptyHtml,/data-m26-area="retos" data-m26-client-guide="challenge-discovery">Retos</u);

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
  assert.doesNotMatch(activeHtml,/data-m26-client-guide="challenge-discovery"/u);
  assert.match(activeHtml,/data-m26-client-guide-event-key="[a-f0-9]{8}"/u);
  assert.match(activeHtml,/Cumplir tu planificación/u);
  assert.match(activeHtml,/3 sesiones/u);
  assert.match(activeHtml,/75%/u);
  assert.match(activeHtml,/data-m26-area="retos"/u);
});

test('Completed challenge stays discoverable without occupying a full dashboard panel',()=>{
  const html=renderHoyRoute({
    role:'client',
    clients:[{name:'Cliente',iri:null,nextAction:null}],
    appointments:[],
    upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{},
    challengePreview:{
      id:'plan',
      title:'Cumplir tu planificación',
      detail:'Objetivo confirmado.',
      current:4,
      target:4,
      unit:'sesiones',
      progress:100,
      completed:true,
      available:true,
    },
  });
  assert.match(html,/m26-client-home-community is-completed/u);
  assert.match(html,/Reto completado/u);
  assert.match(html,/data-m26-client-guide="challenge-entry"/u);
  assert.match(html,/data-m26-area="retos"/u);
  assert.doesNotMatch(html,/class="m26-panel m26-panel-soft m26-client-home-community"/u);
  assert.doesNotMatch(html,/<progress max="100"/u);
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
    clients:[{name:'Cliente',iri:null,nextAction:null,cycle:{id:'cycle-private-1',revision:3,updatedAt:'2026-09-14T10:00:00Z',name:'Fuerza base',status:'Confirmado'}}],
    rc39:{sessionProjections:[]},
  });
  assert.match(planOnly,/data-m26-client-guide="plan-entry"/u);
  assert.match(planOnly,/data-m26-client-guide-event-key="[a-f0-9]{8}"/u);
  assert.doesNotMatch(planOnly,/cycle-private-1/u);
  assert.doesNotMatch(planOnly,/data-m26-client-guide="session-entry"/u);

  const withSession=renderHoyRoute({
    ...base,
    rc39:{sessionProjections:[{
      id:'S1',
      visible:true,
      canClientExecute:false,
      session:{title:'Sesión',revision:2,updatedAt:'2026-09-14T11:00:00Z',blocks:[]},
    }]},
  });
  assert.match(withSession,/data-m26-client-guide="plan-entry"/u);
  assert.match(withSession,/data-m26-client-guide="session-entry"/u);
  assert.match(withSession,/data-m26-client-guide="session-entry" data-m26-client-guide-event-key="[a-f0-9]{8}"/u);
});

test('Challenge discovery points to the quiet Today disclosure and keeps More as a fallback',()=>{
  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/client-feature-challenges-community[\s\S]*?selectors:Object\.freeze\(\['\[data-m26-client-guide="secondary-actions"\]','\.m26-client-bottom-nav-more > summary'\]\)/u);
  assert.match(guide,/Retos y comunidad están disponibles cuando quieras/u);
  assert.match(guide,/puedes entrar desde Más para ti en Hoy o desde Más/u);

  const i18n=read('src/m26/ui/i18n-surface-onboarding-client.js');
  assert.match(i18n,/More for you in Today or from More/u);
  assert.match(i18n,/Plus pour vous dans Aujourd’hui ou depuis Plus/u);
  assert.match(i18n,/Mais para si em Hoje ou através de Mais/u);
});

test('Moment guidance prioritizes actionable facts and avoids duplicate route explanations',()=>{
  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/client-moment-session-ready[\s\S]*priority:120/u);
  assert.match(guide,/sort\(\(left,right\)=>Number\(right\.priority\|\|0\)-Number\(left\.priority\|\|0\)\)/u);
  assert.match(guide,/\.\.\.\(Array\.isArray\(tip\.seenAlso\)\?tip\.seenAlso:\[\]\)/u);
  assert.match(guide,/tip\.excludeSelectors/u);
  assert.match(guide,/client-feature-challenges-community/u);
  assert.match(guide,/client-context-messages[\s\S]*?selectors:Object\.freeze\(\['\[data-communication-role="client"\]'\]\)/u);
  const vmSource=read('src/m26/modules/route-view-model.js');
  assert.match(vmSource,/communicationAvailable:[\s\S]*?state\?\.communication\?\.available===true/u);
  const shell=renderRouteView({kind:'hoy',role:'client',clients:[],appointments:[],upcoming:[],rc39:{sessionProjections:[]},operations:{}});
  assert.match(shell,/m26-client-bottom-nav-more/u);
  assert.match(shell,/Retos y comunidad/u);
});
test('Meaningful progress and low-adherence guidance only appear from confirmed non-clinical thresholds',()=>{
  const source=read('src/m26/modules/route-render.js');
  const vmSource=read('src/m26/modules/route-view-model.js');

  assert.match(source,/summary\.dataQuality!=='limitada'/u);
  assert.match(source,/Number\(summary\.completedSessions\|\|0\)>=2/u);
  assert.match(source,/Number\(summary\.checkins\|\|0\)>=3/u);
  assert.match(source,/Number\(summary\.iriAssessmentCount\|\|0\)>=2/u);
  assert.match(source,/data-m26-client-guide-insight="progress-ready"/u);

  const guideBlock=vmSource.slice(
    vmSource.indexOf('const clientGuide='),
    vmSource.indexOf("qaStage('rc64-hoy-ready')")
  );
  assert.match(guideBlock,/item\?\.id==='adherence-low'/u);
  assert.doesNotMatch(guideBlock,/pain-high|recovery-context|post-session-discomfort/u);

  const shell=renderRouteView({
    kind:'hoy',
    role:'client',
    clients:[{name:'Cliente',iri:null,nextAction:null}],
    appointments:[],
    upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{},
    clientGuide:{adherenceReview:true},
  });
  assert.match(shell,/data-m26-area="progreso" data-m26-client-guide="adherence-entry"/u);
});

test('Planning, session, progress and challenge guidance targets are conditional rather than generic route fallbacks',()=>{
  const source=read('src/m26/modules/route-render.js');
  assert.match(source,/data-m26-client-guide="plan-surface"/u);
  assert.match(source,/data-m26-client-guide="session-surface"/u);
  assert.match(source,/data-m26-client-guide="progress-surface"/u);
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

test('Client manual Guide access lives in sidebar utility and Más, never in the topbar',()=>{
  const shell=read('src/m26/shell/shell-render.js');
  const progressive=read('src/m26/onboarding/progressive-onboarding.js');
  const route=read('src/m26/modules/route-render.js');
  assert.match(shell,/m26-sidebar-guide[\s\S]*data-m26-client-context-guide-open/u);
  assert.match(route,/Guía IBERFIT<\/span><small>Explica esta pantalla/u);
  assert.match(progressive,/if\(context\.role==='client'\)[\s\S]*querySelectorAll\?\.\('\[data-m26-client-context-guide-open\]'\)/u);
  assert.match(progressive,/if\(context\.role==='client'\)\{[\s\S]*?return;\s*\}\s*const host=root\.querySelector\?\.\('\.m26-topbar-actions'\)/u);
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


test('Progreso se descubre solo con evolución posterior al IRI inicial',()=>{
  const baselineOnly={
    completedSessions:0,
    checkins:0,
    iriAssessmentCount:1,
    iriCurrent:3,
    wearable:{daysWithData:0,metrics:{steps:null},providers:['garmin_connect']},
  };
  assert.equal(progressSummaryHasEvolutionEvidence(null),false);
  assert.equal(progressSummaryHasEvolutionEvidence(baselineOnly),false);

  assert.equal(progressSummaryHasEvolutionEvidence({...baselineOnly,completedSessions:1}),true);
  assert.equal(progressSummaryHasEvolutionEvidence({...baselineOnly,checkins:1}),true);
  assert.equal(progressSummaryHasEvolutionEvidence({...baselineOnly,iriAssessmentCount:2}),true);
  assert.equal(progressSummaryHasEvolutionEvidence({
    ...baselineOnly,
    wearable:{daysWithData:1,metrics:{steps:7400},providers:['garmin_connect']},
  }),true);

  const source=read('src/m26/modules/route-render.js');
  assert.match(source,/const hasProgressEvidence=progressSummaryHasEvolutionEvidence\(summary\)/u);
  assert.doesNotMatch(source,/const hasProgressEvidence=[\s\S]{0,240}summary\.iriCurrent/u);

  const vmSource=read('src/m26/modules/route-view-model.js');
  assert.match(vmSource,/progressReady:progressSummaryHasEvolutionEvidence\(clientProgressSummary\)/u);
});

test('Hoy guía a Progreso cuando existe evolución real y mantiene la alerta de adherencia como prioridad',()=>{
  const base={
    kind:'hoy',
    role:'client',
    clients:[],
    appointments:[],
    upcoming:[],
    rc39:{sessionProjections:[]},
    operations:{},
  };

  const ready=renderRouteView({...base,clientGuide:{adherenceReview:false,progressReady:true}});
  assert.match(ready,/data-m26-area="progreso" data-m26-client-guide="progress-entry"/u);

  const adherence=renderRouteView({...base,clientGuide:{adherenceReview:true,progressReady:true}});
  assert.match(adherence,/data-m26-area="progreso" data-m26-client-guide="adherence-entry"/u);
  assert.doesNotMatch(adherence,/data-m26-client-guide="progress-entry"/u);

  const guide=read('src/m26/onboarding/client-contextual-guide.js');
  assert.match(guide,/id:'client-moment-progress-ready'[\s\S]*?priority:80[\s\S]*?area:'hoy'[\s\S]*?actionArea:'progreso'/u);
  assert.match(guide,/sin mezclar el Diagnóstico IRI inicial con tu evolución/u);
});
