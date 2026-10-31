import {mkdir,writeFile} from 'node:fs/promises';
// P0 #1209: existing read-only QA Client A/B runner. No writes or new secrets.
import {registerQaLiveHistoryTestSuite} from '../p0-free-history/live-client-a-cases.mjs';
import {test,expect} from '@playwright/test';
import {
  CANARY_ORIGIN,
  QA_PROJECT_REF,
  SUPABASE_ORIGIN,
  installCurrentSourceQaNetworkPolicy,
  qaRequestLabel,
  isQaPrivateAvatarRead,
  isQaMissingPrivateAvatarResponse,
  unexpectedQaResourceErrors,
} from './secure-current-source-auth.mjs';
import {evaluateRecoveredFirstFactor,mayRetryUserLoginAfterNetworkError} from './recovered-first-factor-contract.mjs';
import {createQaSupabasePayloadFootprint} from './supabase-payload-footprint.mjs';

const ASSURANCE_PATH='/rest/v1/rpc/iberfit_privileged_assurance_context_v65d';
const OPTIONAL_READ_PATHS=new Set([
  '/rest/v1/rpc/iberfit_appointment_change_requests_v13',
  '/rest/v1/rpc/iberfit_exercise_media_manifest_v1',
  '/rest/v1/rpc/iberfit_exercise_measurement_profiles_public_v1',
]);
const AUTH_FLOW_TIMEOUT_MS=30_000;
const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
  'M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD',
];
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1',
  'iberfit_exercise_measurement_profiles_public_v1',
  'iberfit_exercise_media_manifest_v1',
]);

async function readAssurance(response){
  expect(response.status(),'Assurance RPC must answer successfully').toBe(200);
  const payload=await response.json();
  expect(payload&&typeof payload==='object').toBeTruthy();
  return payload;
}

async function dismissGuidance(page){
  const welcome=page.locator('[data-m26-client-guided-welcome]');
  await welcome.waitFor({state:'visible',timeout:3_000}).catch(()=>{});
  if(await welcome.isVisible().catch(()=>false)){
    const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
    if(await pause.count())await pause.click();
  }
  const tour=page.locator('[data-m26-guided-tour]');
  if(await tour.count()){
    const close=tour.locator('[data-m26-guided-tour-close]').first();
    if(await close.count())await close.click();
  }
}

async function verifyClientWorkspace(page,{projectName,browserName,rpcTimings=[]}){
  const shell=page.locator('.m26-shell[data-m26-role="client"]');
  try{
    await expect(shell).toBeVisible({timeout:10_000});
  }catch(error){
    // Keep the original 10s SLA and fail closed. Record only stage names,
    // elapsed milliseconds, booleans and auth-mode—not any user data,
    // credentials, tokens, request bodies or free-text server responses.
    const diagnostic=await page.evaluate(()=>{
      const card=document.querySelector('.m26-auth-card');
      const stages=globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__||{};
      const root=document.querySelector('[data-m26-interactive]');
      return {
        shellMounted:Boolean(document.querySelector('.m26-shell[data-m26-role="client"]')),
        loginVisible:Boolean(document.querySelector('[data-auth-form="login"]')),
        loginBusy:card?.getAttribute('aria-busy')==='true',
        authMode:String(card?.getAttribute('data-auth-mode')||'unknown').slice(0,32),
        interactiveReady:root?.getAttribute('data-m26-interactive')==='ready',
        stages:Array.isArray(stages.appStages)?stages.appStages.slice(-35):[],
        stageTimes:Array.isArray(stages.appStageTimes)?stages.appStageTimes.slice(-65):[],
        rpcTimings:(performance.getEntriesByType('resource')||[]).flatMap((entry)=>{
          try{
            const uri=new URL(entry.name);
            if(!uri.pathname.startsWith('/rest/v1/rpc/')&&!uri.pathname.startsWith('/auth/v1/'))return [];
            return [{endpoint:uri.pathname,elapsedMs:Math.round(entry.startTime),durationMs:Math.round(entry.duration)}];
          }catch{return []}
        }).slice(-30),
        diagnostics:Array.isArray(stages.diagnostics)?stages.diagnostics.slice(-12):[],
      };
    }).catch(()=>({unavailable:true}));
    console.error('RC64_CLIENT_SHELL_BOOTSTRAP_DIAGNOSTIC:'+JSON.stringify({...diagnostic,networkRpcTimings:rpcTimings.slice(-24)}));
    throw error;
  }
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:10_000});
  // Always preserve coarse stage latency in CI, including passing runs.
  // This detects slow-but-eventually-successful loading without weakening
  // the 10-second shell assertion or exposing account/request details.
  const timing=await page.evaluate(()=>{
    const history=globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__?.appStageTimes||[];
    const phases=[
      'rc64-login-token-ready','rc64-login-setup-start','rc64-hydrate-start',
      'rc64-hydrate-primary-ready','rc64-hydrate-scope-ready',
      'rc64-hydrate-secondary-ready','rc64-hydrate-store-ready',
      'rc64-shell-frame-ready','rc64-shell-first-paint-ready',
      'rc64-shell-interactive-ready',
    ];
    const steps=phases.map((phase)=>{
      const point=history.find((entry)=>entry?.stage===phase);
      return point?{phase,atMs:point.atMs}:null;
    }).filter(Boolean);
    const start=steps[0]?.atMs??0;
    return steps.map((point)=>({phase:point.phase,elapsedMs:Math.max(0,point.atMs-start)}));
  });
  console.log('RC64_CLIENT_SHELL_STAGE_LATENCY:'+JSON.stringify({project:projectName,steps:timing}));
  // Read-only, allowlisted request duration from the Playwright host clock.
  // Cross-origin ResourceTiming can be zeroed by the browser without TAO.
  console.log('RC64_CLIENT_RPC_LATENCY:'+JSON.stringify({project:projectName,entries:rpcTimings.slice(-24)}));
  await expect(
    page.locator('[data-m26-action="logout"]'),
    'Authenticated Client must retain a semantic logout action even when session controls live inside Settings',
  ).toHaveCount(1,{timeout:5_000});
  await expect(page.locator('.m26-role-choice[role="dialog"]'),'Client-only identity must not receive app choice').toHaveCount(0);
  await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]'),'Client-only identity must not receive privileged MFA').toHaveCount(0);
  await dismissGuidance(page);

  const visibleNavigationTarget=page.locator(
    '.m26-client-bottom-nav [data-m26-area]:not([aria-current="page"]):not([disabled]):visible, .m26-mobile-nav [data-m26-area]:not([aria-current="page"]):not([disabled]):visible, .m26-sidebar [data-m26-area]:not([aria-current="page"]):not([disabled]):visible',
  ).first();
  await expect(visibleNavigationTarget,'Authenticated workspace must expose a visible enabled navigation target').toBeVisible({timeout:5_000});
  const targetArea=await visibleNavigationTarget.getAttribute('data-m26-area');
  expect(targetArea).toBeTruthy();
  // On CPU-throttled mobile/tablet, Playwright locator.click can report
  // TIMEOUT waiting for a scheduled navigation even though the real tap
  // reached the app. Verify the USER-VISIBLE route within the original 5s
  // budget instead of measuring Playwright's unrelated navigation waiter.
  // These are genuine pointer events, NOT DOM-dispatched synthetic clicks.
  let navigationClickStart=null;
  const activeNavigation=page.locator(
    `.m26-client-bottom-nav [data-m26-area="${targetArea}"][aria-current="page"]:visible, .m26-mobile-nav [data-m26-area="${targetArea}"][aria-current="page"]:visible, .m26-sidebar [data-m26-area="${targetArea}"][aria-current="page"]:visible`,
  ).first();
  let inputMode='mouse';
  try{
    await visibleNavigationTarget.scrollIntoViewIfNeeded({timeout:5_000});
    const rect=await visibleNavigationTarget.boundingBox();
    expect(rect,'The real visible navigation target must have physical hit area').toBeTruthy();
    expect(rect.width,'A touch target must have positive physical width').toBeGreaterThan(0);
    expect(rect.height,'A touch target must have positive physical height').toBeGreaterThan(0);
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    const hasTouch=await page.evaluate(()=>navigator.maxTouchPoints>0);
    inputMode=hasTouch?'touch':'mouse';
    // Probe the trusted browser pointer and the NEXT rendered animation frame.
    // Host/CDP round-trips are diagnostic only; a slow automation transport is
    // not a five-second delay between a user's touch and the painted UI.
    await page.evaluate((area)=>{
      const NAV='.m26-client-bottom-nav [data-m26-area],.m26-mobile-nav [data-m26-area],.m26-sidebar [data-m26-area]';
      let pointerAt=null,paintedAt=null,frameScheduled=false;
      const selected=()=>[...document.querySelectorAll(NAV)].find(node=>
        node.getAttribute('data-m26-area')===area&&node.getAttribute('aria-current')==='page'&&
        node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden');
      let observer;
      const capturePaint=()=>{
        if(pointerAt===null||paintedAt!==null||frameScheduled||!selected())return;
        frameScheduled=true;
        requestAnimationFrame(()=>{
          frameScheduled=false;
          if(paintedAt===null&&selected()){
            paintedAt=performance.now();
            observer.disconnect();
          }
        });
      };
      const onPointer=event=>{
        if(pointerAt!==null||event.isTrusted!==true)return;
        const item=event.target?.closest?.('[data-m26-area]');
        if(!item||item.getAttribute('data-m26-area')!==area||
          !item.closest('.m26-client-bottom-nav,.m26-mobile-nav,.m26-sidebar'))return;
        pointerAt=performance.now();
        capturePaint();
      };
      observer=new MutationObserver(capturePaint);
      observer.observe(document.documentElement,{
        childList:true,subtree:true,attributes:true,attributeFilter:['aria-current','class','style'],
      });
      document.addEventListener('pointerdown',onPointer,true);
      globalThis.__IBERFIT_QA_NAV_VISUAL_PROBE__={
        read:()=>({
          trustedPointer:pointerAt!==null,visiblePaint:paintedAt!==null,
          pointerAtMs:pointerAt===null?null:Math.round(pointerAt),
          paintedAtMs:paintedAt===null?null:Math.round(paintedAt),
          elapsedMs:pointerAt!==null&&paintedAt!==null?paintedAt-pointerAt:null,
        }),
        stop:()=>{observer.disconnect();document.removeEventListener('pointerdown',onPointer,true);},
      };
    },targetArea);
    // Host clock retained solely to detect Playwright/CDP scheduling variance.
    navigationClickStart=Date.now();
    const physicalHit=await page.evaluate(({x,y})=>{
      const target=document.elementFromPoint(x,y);
      const area=target?.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area')||'';
      return {area:String(area).slice(0,30),insideNavigation:Boolean(target?.closest?.('.m26-client-bottom-nav,.m26-mobile-nav,.m26-sidebar'))};
    },{x,y});
    console.log('RC64_CLIENT_NAV_POINTER_HIT:'+JSON.stringify({project:projectName,area:targetArea,hitArea:physicalHit.area,insideNavigation:physicalHit.insideNavigation}));
    if(hasTouch)await page.touchscreen.tap(x,y);
    else await page.mouse.click(x,y);
    await expect(activeNavigation,'The real pointer action must activate the requested route')
      .toBeVisible({timeout:5_000});
    // Only WebKit can resolve the real click before the next painted frame.
    // Preserve Chromium's original measurement path and real 5s hard SLA.
    const readVisual=()=>page.evaluate(()=>globalThis.__IBERFIT_QA_NAV_VISUAL_PROBE__?.read?.()||null);
    if(browserName==='webkit'){
      await expect.poll(async()=>Boolean((await readVisual())?.visiblePaint),{
        message:'The target route must paint after the trusted pointerdown',
        timeout:5_000,intervals:[16,32,64,100,200],
      }).toBe(true);
    }
    const visual=await readVisual();
    expect(visual?.trustedPointer,'A genuine trusted pointerdown on the target must be observed').toBe(true);
    expect(visual?.visiblePaint,'The target route must paint after the trusted pointerdown').toBe(true);
    expect(visual?.elapsedMs,'Actual pointer-to-painted-route latency remains <=5s')
      .toBeLessThanOrEqual(5_000);
    console.log('RC64_CLIENT_NAV_BROWSER_PAINT_LATENCY:'+JSON.stringify({
      project:projectName,area:targetArea,inputMode,
      elapsedMs:visual.elapsedMs,hostRoundtripMs:Date.now()-navigationClickStart,
    }));
  }catch(error){
    const routeTrace=await page.evaluate(()=>({
      // Instrumented only when QA installs the bounded stage observer; labels,
      // durations and area codes only, never personal identifiers or payloads.
      shellRouteTimings:Array.isArray(globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__?.shellRouteTimings)
        ?globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__.shellRouteTimings.slice(-24)
          .map(x=>({phase:String(x.phase||'').slice(0,40),
            area:String(x.area||'').slice(0,30),
            elapsedMs:Number.isFinite(x.elapsedMs)?Math.round(x.elapsedMs):null,
            atMs:Number.isFinite(x.atMs)?Math.round(x.atMs):null}))
        :[],
      lastStages:(globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__?.shellRouteTimings||[]).slice(-28),
      renderedArea:document.querySelector('[data-m26-area][aria-current="page"]')?.getAttribute('data-m26-area')||'',
      shellRole:document.querySelector('.m26-shell')?.getAttribute('data-m26-role')||'',
      visualProbe:globalThis.__IBERFIT_QA_NAV_VISUAL_PROBE__?.read?.()||null,
    })).catch(()=>({unavailable:true}));
    console.error('RC64_CLIENT_NAV_ROUTE_TRACE:'+JSON.stringify({project:projectName,area:targetArea,routeTrace}));
    console.error('RC64_CLIENT_NAV_CLICK_FAILURE:'+JSON.stringify({
      project:projectName,area:targetArea,inputMode,
      elapsedMs:navigationClickStart===null?null:Date.now()-navigationClickStart,
    }));
    throw error;
  }finally{
    await page.evaluate(()=>{
      const probe=globalThis.__IBERFIT_QA_NAV_VISUAL_PROBE__;
      probe?.stop?.();
      delete globalThis.__IBERFIT_QA_NAV_VISUAL_PROBE__;
    }).catch(()=>{});
  }
  console.log('RC64_CLIENT_NAV_CLICK_LATENCY:'+JSON.stringify({
    project:projectName,area:targetArea,inputMode,
    elapsedMs:Date.now()-navigationClickStart,
  }));

  const settingsSummary=page.locator('details.m26-settings-menu > summary').first();
  const settingsSummaryVisible=await settingsSummary.count()&&await settingsSummary.isVisible().catch(()=>false);
  let settingsMenu=null;
  if(settingsSummaryVisible){
    await settingsSummary.click({timeout:5_000});
    settingsMenu=page.locator('details.m26-settings-menu').first();
    await expect(settingsMenu).toHaveAttribute('open','',{timeout:5_000});
  }else{
    const clientMore=page.locator('.m26-client-bottom-nav-more > summary:visible').first();
    await expect(clientMore,'Compact Client layouts must expose Settings through More').toBeVisible({timeout:5_000});
    await clientMore.click({timeout:5_000});
    const settingsRouteAction=page.locator('.m26-client-bottom-nav-menu [data-m26-area="ajustes"]:visible').first();
    await expect(settingsRouteAction).toBeVisible({timeout:5_000});
    await settingsRouteAction.click({timeout:5_000});
    await expect(page.locator('[data-client-bottom-nav-route="ajustes"]')).toHaveCount(1,{timeout:5_000});
  }

  const localeSelector=page.locator('[data-m26-ui-locale]:visible').first();
  await expect(localeSelector,'Visible locale selector must remain usable').toBeVisible({timeout:5_000});
  await expect(localeSelector).toBeEnabled({timeout:5_000});
  await localeSelector.focus();
  const originalLocale=await localeSelector.inputValue();
  const localeOptions=await localeSelector.locator('option').evaluateAll((options)=>options.map((option)=>String(option.value||'')).filter(Boolean));
  expect(localeOptions.length).toBeGreaterThan(1);
  const alternateLocale=localeOptions.find((value)=>value!==originalLocale);
  expect(alternateLocale).toBeTruthy();
  await localeSelector.selectOption(alternateLocale);
  const updatedLocaleSelector=page.locator('[data-m26-ui-locale]:visible').first();
  if(settingsMenu)await expect(settingsMenu).toHaveAttribute('open','',{timeout:5_000});
  else await expect(page.locator('[data-client-bottom-nav-route="ajustes"]')).toHaveCount(1,{timeout:5_000});
  await expect(updatedLocaleSelector).toHaveValue(alternateLocale,{timeout:5_000});
  await expect(updatedLocaleSelector).toBeFocused({timeout:5_000});
  await updatedLocaleSelector.selectOption(originalLocale);
  const restoredLocaleSelector=page.locator('[data-m26-ui-locale]:visible').first();
  await expect(restoredLocaleSelector).toHaveValue(originalLocale,{timeout:5_000});
  await expect(restoredLocaleSelector).toBeFocused({timeout:5_000});

  if(projectName==='authenticated-readonly-tablet-chromium'){
    const grid=page.locator('.m26-stat-grid:visible').first();
    if(await grid.count()){
      const columns=await grid.evaluate((element)=>getComputedStyle(element).gridTemplateColumns.split(/\s+/u).filter(Boolean).length);
      expect(columns,'Portrait tablet metric grid must use two readable columns').toBe(2);
    }
  }
  if(projectName==='authenticated-readonly-tablet-landscape-chromium'){
    const grid=page.locator('.m26-stat-grid:visible').first();
    if(await grid.count()){
      const columns=await grid.evaluate((element)=>getComputedStyle(element).gridTemplateColumns.split(/\s+/u).filter(Boolean).length);
      expect(columns,'Landscape tablet metric grid should preserve four-column density').toBe(4);
    }
  }

  const eventLoopDelay=await page.evaluate(()=>new Promise((resolve)=>{
    const started=performance.now();
    setTimeout(()=>resolve(Math.max(0,performance.now()-started)),0);
  }));
  expect(Number(eventLoopDelay),browserName==='chromium'?'Authenticated workspace must remain responsive under Chromium':'Authenticated workspace must remain responsive').toBeLessThan(1_500);

  const quality=await page.evaluate(async()=>{
    const collector=await globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__;
    return collector?.snapshot?.()||null;
  });
  expect(quality?.schemaVersion).toBe('iberfit.quality-runtime-observability.v1');
  expect(quality?.storage).toBe('memory-only');
  expect(quality?.transport).toBe('none');
  expect(quality?.identityIncluded).toBe(false);
  expect(quality?.healthDataIncluded).toBe(false);
}

async function verifyPrivilegedFailClosed(page,account,assurance){
  expect(assurance.privileged,`${account.name}: privileged assurance flag`).toBe(true);
  expect(assurance.mfaRequired,`${account.name}: MFA required`).toBe(true);
  expect(assurance.webauthnRequired,`${account.name}: WebAuthn required`).toBe(true);
  expect(assurance.iberfitAssurance,`${account.name}: no verified assurance before device proof`).not.toBe('verified');
  await expect(
    page.locator(`.m26-shell[data-m26-role="${account.role}"]`),
    `${account.name}: privileged shell must remain unavailable before WebAuthn`,
  ).toHaveCount(0,{timeout:5_000});
  await expect(page.locator('#m26-auth-title'),`${account.name}: auth gate must remain visible`).toBeVisible({timeout:5_000});
  await expect(page.locator('[data-auth-action="mfa-continue-webauthn"]'),`${account.name}: WebAuthn action`).toBeVisible({timeout:5_000});
  await expect(page.locator('.m26-role-choice[role="dialog"]'),`${account.name}: app choice must not precede MFA`).toHaveCount(0);
}

test('current authenticated contract separates privileged fail-closed identities from Client-only interaction',async({browser,browserName},testInfo)=>{
  const missing=required.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_PROJECT_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const accounts=[
    {name:'coach',role:'coach',kind:'privileged',expectedEmail:'qa.rc74.coach@iberfit.cl',email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD},
    {name:'client_a',role:'client',kind:'client-only',expectedEmail:'qa.rc74.client-a@iberfit.cl',email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD},
    {name:'client_b',role:'client',kind:'client-only',expectedEmail:'qa.rc74.client-b@iberfit.cl',email:process.env.M26_QA_CLIENT_B_EMAIL,password:process.env.M26_QA_CLIENT_B_PASSWORD},
  ];
  const evidenceRoles=[];
  const projectUse=testInfo.project.use||{};
  const projectName=String(testInfo.project.name||'');
  const chromiumEngine=browserName==='chromium';
  const touchProfile=/tablet|mobile/iu.test(projectName);
  const cpuThrottleRate=chromiumEngine?(touchProfile?6:3):1;

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toBe(account.expectedEmail);
    expect(String(account.password||'').length).toBeGreaterThanOrEqual(8);
    const context=await browser.newContext({
      baseURL:CANARY_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
      viewport:projectUse.viewport,
      hasTouch:Boolean(projectUse.hasTouch),
      isMobile:Boolean(projectUse.isMobile),
    });
    const payloadFootprint=createQaSupabasePayloadFootprint();
    payloadFootprint.attach(context);
    const blocked=[];
    const externalFailures=[];
    const optionalReadFailures=[];
    const avatarChecks=[],missingAvatar=[];
    const consoleErrors=[];
    const pageErrors=[];
    // Read-only diagnostic phases; never record secrets or identifying data.
    const authPhases=[];
    const authNetworkFailureCodes=[];
    const firstFactorEvents=[];
    const firstFactorNetworkFailureCodes=[];
    const rpcStarts=new WeakMap();
    const rpcTimings=[];
    await installCurrentSourceQaNetworkPolicy(context,{
      readOnlyRpcs:READ_ONLY_RPCS,
      onBlocked:(label)=>blocked.push(label),
    });
    const page=await context.newPage();
    // Observe initial bootstrap -> full-app transitions from document start.
    // Values, identifiers, passwords and tokens are intentionally not inspected.
    await page.addInitScript(()=>{
      const events={pointerDown:0,click:0,submit:0,formReplacements:0,fullAppAtClick:false,appStages:[],appStageTimes:[],diagnostics:[]};
      // Only fixed enumerated stage/code metadata; never capture inputs, tokens or identity.
      globalThis.__IBERFIT_M26_QA_STAGE__=(stage)=>{
        if(typeof stage==='string'&&/^rc64-[a-z0-9-]{1,64}$/u.test(stage)){
          events.appStages.push(stage);
          if(events.appStages.length>50)events.appStages.shift();
          events.appStageTimes.push({stage,atMs:Math.round(performance.now())});
          if(events.appStageTimes.length>80)events.appStageTimes.shift();
        }
      };
      globalThis.addEventListener('m26:diagnostic',(event)=>{
        const {stage,code,status}=event?.detail||{};
        if(typeof stage!=='string'||!/^[a-z0-9_-]{1,60}$/iu.test(stage))return;
        if(typeof code!=='string'||!/^M26_[A-Z0-9_:-]{2,120}$/u.test(code))return;
        events.diagnostics.push({stage,code,status:Number.isInteger(status)&&status>=100&&status<=599?status:null});
        if(events.diagnostics.length>20)events.diagnostics.shift();
      });
      let previous=null;
      const isSubmit=(event)=>Boolean(event.target?.closest?.('[data-auth-form="login"] button[type="submit"]'));
      document.addEventListener('pointerdown',(event)=>{
        if(isSubmit(event))events.pointerDown+=1;
      },true);
      document.addEventListener('click',(event)=>{
        if(!isSubmit(event))return;
        events.click+=1;
        events.fullAppAtClick=Boolean(globalThis.__IBERFIT_M26_APP__);
      },true);
      document.addEventListener('submit',(event)=>{
        if(event.target?.matches?.('[data-auth-form="login"]'))events.submit+=1;
      },true);
      const observer=new MutationObserver(()=>{
        const next=document.querySelector('[data-auth-form="login"]');
        if(next&&previous&&next!==previous){
          events.formReplacements=Math.min(10,events.formReplacements+1);
        }
        if(next)previous=next;
      });
      observer.observe(document,{subtree:true,childList:true});
      globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__=events;
    });
    if(chromiumEngine){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuThrottleRate});
    }
    page.on('request',(request)=>{
      try{
        const url=new URL(request.url());
        if(url.origin!==SUPABASE_ORIGIN||request.method()!=='POST')return;
        if(url.pathname.startsWith('/rest/v1/rpc/')){
          const rpc=url.pathname.slice('/rest/v1/rpc/'.length);
          if(READ_ONLY_RPCS.has(rpc))rpcStarts.set(request,{rpc,started:process.hrtime.bigint()});
        }
        if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
          authPhases.push('first-factor-request');
          firstFactorEvents.push('issued');
        }
        if(url.pathname===ASSURANCE_PATH)authPhases.push('assurance-request');
      }catch{}
    });
    page.on('response',(response)=>{
      const started=rpcStarts.get(response.request());
      if(started){
        rpcStarts.delete(response.request());
        rpcTimings.push({rpc:started.rpc,durationMs:Math.round(Number(process.hrtime.bigint()-started.started)/1e6),status:response.status()});
        if(rpcTimings.length>60)rpcTimings.shift();
      }
      if(isQaPrivateAvatarRead(response.request())&&response.status()>=400){
        avatarChecks.push(isQaMissingPrivateAvatarResponse(response).then(ok=>{
          if(ok)missingAvatar.push(true);
          else externalFailures.push('QA_AVATAR_UNEXPECTED_HTTP_'+response.status());
        }));
      }
      try{
        const request=response.request();
        const url=new URL(request.url());
        if(url.origin!==SUPABASE_ORIGIN||request.method()!=='POST')return;
        const phase=url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'
          ?'first-factor':url.pathname===ASSURANCE_PATH?'assurance':null;
        if(phase)authPhases.push(phase+'-http-'+String(response.status()));
        if(phase==='first-factor')firstFactorEvents.push('http-'+String(response.status()));
      }catch{}
    });
    page.on('requestfailed',(request)=>{
      rpcStarts.delete(request);
      try{
        const url=new URL(request.url());
        if(url.origin===SUPABASE_ORIGIN){
          if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
            authPhases.push('first-factor-requestfailed');
            firstFactorEvents.push('requestfailed');
            const errorText=String(request.failure()?.errorText||'');
            firstFactorNetworkFailureCodes.push(errorText.match(/net::ERR_[A-Z_]{2,45}/u)?.[0]||'UNCLASSIFIED');
          }
          if(url.pathname===ASSURANCE_PATH){
            authPhases.push('assurance-requestfailed');
            // Record only a bounded Chromium network failure code. Never
            // capture request URL, JWT, request headers or response payload.
            const errorText=String(request.failure()?.errorText||'');
            const code=errorText.match(/net::ERR_[A-Z_]{2,45}/u)?.[0]||'NETWORK_FAILURE_UNCLASSIFIED';
            authNetworkFailureCodes.push(code);
          }
        }
      }catch{}
      const label=qaRequestLabel(request);
      if(blocked.includes(label))return;
      try{
        const url=new URL(request.url());
        if(url.origin===SUPABASE_ORIGIN&&request.method().toUpperCase()==='POST'&&OPTIONAL_READ_PATHS.has(url.pathname))optionalReadFailures.push(label);
        else externalFailures.push(label);
      }catch{externalFailures.push('INVALID_FAILED_REQUEST');}
    });
    page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));});
    page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));

    try{
      console.log(`RC64_CURRENT_AUTH_ACCOUNT_BEGIN:${account.name}`);
      const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
      expect(navigation?.ok()).toBeTruthy();
      await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
      await page.locator('#m26-login-password').fill(account.password);
      // Handle rejection immediately: a failed click must not orphan an unhandled
      // assurance wait. Keep the same timeout and do not bypass the RPC.
      const makeAssuranceOutcome=()=>page.waitForResponse((response)=>{
        try{const url=new URL(response.url());return url.origin===SUPABASE_ORIGIN&&url.pathname===ASSURANCE_PATH;}catch{return false;}
      },{timeout:AUTH_FLOW_TIMEOUT_MS}).then(response=>({response}),error=>({error}));
      const assuranceOutcome=makeAssuranceOutcome();
      // The app already retries a transport stall once. The read-only gate may
      // verify ONE explicit user retry if both transport attempts failed and
      // the UI displays the specific network error. Never retry 400/401/403.
      const networkErrorOutcome=page.locator('.m26-auth-notice[role="alert"]')
        .filter({hasText:'No fue posible conectar'})
        .waitFor({state:'visible',timeout:AUTH_FLOW_TIMEOUT_MS})
        .then(()=>({networkErrorVisible:true}),()=>({networkErrorVisible:false}));
      let firstFactorUserRetryCount=0;
      let assurance;
      let attemptStage='login-click';
      try{
        await page.getByRole('button',{name:'Entrar',exact:true}).click();
        attemptStage='assurance-response';
        let outcome=await Promise.race([assuranceOutcome,networkErrorOutcome]);
        if(outcome.networkErrorVisible===true){
          expect(mayRetryUserLoginAfterNetworkError({
            events:firstFactorEvents,
            networkFailureCodes:firstFactorNetworkFailureCodes,
            networkErrorVisible:true,
            userRetryCount:firstFactorUserRetryCount,
          }),'UI retry only after exactly two typed transport failures').toBe(true);
          firstFactorUserRetryCount=1;
          attemptStage='user-network-retry';
          // Refill only the authentication form, which may have been replaced.
          await page.getByRole('textbox',{name:'Correo',exact:true}).fill(account.email);
          await page.locator('#m26-login-password').fill(account.password);
          const retryOutcome=makeAssuranceOutcome();
          await page.getByRole('button',{name:'Entrar',exact:true}).click();
          outcome=await retryOutcome;
        }
        if(outcome.error)throw outcome.error;
        if(!outcome.response)throw new Error('RC64_ASSURANCE_RESPONSE_REQUIRED');
        assurance=await readAssurance(outcome.response);
      }catch(error){
        const state=await page.evaluate(()=>{
          const card=document.querySelector('.m26-auth-card');
          const form=document.querySelector('[data-auth-form="login"]');
          const events=globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__;
          const focused=document.activeElement;
          return {appReady:Boolean(globalThis.__IBERFIT_M26_APP__),
            formValid:Boolean(form?.checkValidity?.()),
            formConnected:Boolean(form?.isConnected),
            submitDisabled:Boolean(form?.querySelector('button[type="submit"]')?.disabled),
            focus:focused?.matches?.('input[name="email"]')?'email':
              focused?.matches?.('input[name="password"]')?'password':'other',
            authMode:card?.getAttribute('data-auth-mode')||null,
            busy:card?.getAttribute('aria-busy')||null,
            interaction:{
              pointerDown:Number(events?.pointerDown||0),
              click:Number(events?.click||0),
              submit:Number(events?.submit||0),
              formReplacements:Number(events?.formReplacements||0),
              fullAppAtClick:events?.fullAppAtClick===true,
            },
            appStages:Array.isArray(events?.appStages)?events.appStages.slice(-25):[],
            diagnostics:Array.isArray(events?.diagnostics)?events.diagnostics.slice(-20):[],
          };
        }).catch(()=>({unavailable:true}));
        console.error('M26_QA_AUTH_PHASE_DIAGNOSTIC:'+JSON.stringify({
          attemptStage,stages:[...authPhases],authNetworkFailureCodes:authNetworkFailureCodes.slice(0,8),state,
        }));
        throw error;
      }

      if(account.kind==='privileged'){
        await verifyPrivilegedFailClosed(page,account,assurance);
      }else{
        expect(assurance.privileged,'Client-only fixture must not be privileged').toBe(false);
        expect(assurance.mfaRequired,'Client-only fixture must not require privileged MFA').toBe(false);
        expect(assurance.webauthnRequired,'Client-only fixture must not require WebAuthn').toBe(false);
        await verifyClientWorkspace(page,{projectName,browserName,rpcTimings});
      }

      await Promise.all(avatarChecks);
      expect(blocked,'Authenticated startup attempted a business mutation or foreign request').toEqual([]);
      // An explicit, successfully recovered single first-factor transport
      // interruption is not the same as an unresolved critical failure.
      // This strict classifier MUST still reject 401/403, unknown network codes,
      // multiple attempts, unpaired failures and every non-auth failing request.
      const firstFactorRecovery=evaluateRecoveredFirstFactor({
        events:firstFactorEvents,
        networkFailureCodes:firstFactorNetworkFailureCodes,
        externalFailures,
        authenticated:true, // after authenticated role-specific assertions above
        userRetryCount:firstFactorUserRetryCount,
      });
      expect(firstFactorRecovery.remainingFailures,
        'Unrecovered or non-auth critical authenticated requests must not fail').toEqual([]);
      expect(firstFactorRecovery.reason).not.toBe('FIRST_FACTOR_NOT_PROVEN_RECOVERED');

      expect(new Set(optionalReadFailures).size,'Optional read fallbacks must not retry-loop').toBe(optionalReadFailures.length);
      expect(optionalReadFailures.length,'At most one failure per declared optional read is tolerated').toBeLessThanOrEqual(OPTIONAL_READ_PATHS.size);
      expect(unexpectedQaResourceErrors(consoleErrors,missingAvatar.length)).toEqual([]);
      expect(pageErrors).toEqual([]);

      evidenceRoles.push({
        account:account.name,
        role:account.role,
        authenticated:true,
        firstFactorRecoveredOnce:firstFactorRecovery.recovered,
        firstFactorExplicitUserRetryCount:firstFactorUserRetryCount,
        privilegedGate:account.kind==='privileged'?'webauthn-required':'not-required',
        browserEngine:browserName,
        cpuThrottleRate,
        cpuThrottled:chromiumEngine,
        touchProfile,
        mfaCompleted:false,
        applicationChoice:null,
        interactionVerified:account.kind==='client-only',
        assurance:{
          privileged:assurance.privileged===true,
          mfaRequired:assurance.mfaRequired===true,
          webauthnRequired:assurance.webauthnRequired===true,
          iberfitAssurance:String(assurance.iberfitAssurance||''),
        },
        blockedRequests:0,
        externalRequestFailures:0,
        optionalReadFailures:optionalReadFailures.length,
      });
      console.log(`RC64_CURRENT_AUTH_ACCOUNT_PASS:${account.name}`);
    }finally{
      const sizes=await payloadFootprint.flush();
      console.log('M26_QA_SUPABASE_PAYLOAD_FOOTPRINT:'+JSON.stringify({
        project:projectName,role:account.role,...sizes,
      }));
      await context.close().catch(()=>{});
    }
  }

  const evidence={
    schema:'iberfit.rc64.2b.authenticated-current-contract.v5',
    source:'current-source-intercepted-at-canary-origin',
    projectRef:QA_PROJECT_REF,
    mode:'authenticated-readonly-browser',
    mutationsPerformed:false,
    businessMutationsPerformed:false,
    authMutationPerformed:false,
    identityPersisted:false,
    healthDataPersisted:false,
    credentialsPersisted:false,
    privilegedWebAuthnBypassAttempted:false,
    roles:evidenceRoles,
  };
  await mkdir('recovery',{recursive:true});
  await writeFile('recovery/RC64_2B_AUTHENTICATED_SMOKE.json',`${JSON.stringify(evidence,null,2)}\n`,'utf8');
});

// Synthetic QA historical paging: one read-only Chromium run only.
registerQaLiveHistoryTestSuite();
