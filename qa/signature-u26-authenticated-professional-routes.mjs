import {expect} from '@playwright/test';

// U26: live QA login and WebAuthn belong exclusively to the existing trusted
// recurring workflows. This module never authenticates, fabricates a session,
// changes app state, sends requests or submits forms.
export const PROFESSIONAL_U26_AREAS=Object.freeze({
  coach:Object.freeze({
    desktop:Object.freeze(['hoy','clientes','agenda','biblioteca','iri','planificacion','sesion','progreso']),
    mobile:Object.freeze(['hoy','clientes','planificacion','sesion']),
    required:Object.freeze(['sesion','planificacion']),
  }),
  admin:Object.freeze({
    desktop:Object.freeze(['admin-inicio','admin-usuarios','admin-clientes','admin-agenda','admin-operaciones','admin-analitica','admin-auditoria','biblioteca']),
    mobile:Object.freeze(['admin-inicio','admin-usuarios','admin-clientes','biblioteca']),
    required:Object.freeze(['biblioteca']),
  }),
});

async function activeArea(page){
  return page.evaluate(()=>{
    const app=globalThis.__IBERFIT_M26_APP__;
    // U83: never structuredClone the authenticated U38 archive when polling
    // a primitive route. Assert store and rendered navigation agree.
    const stateArea=app?.getNavigationSnapshot?.()?.activeArea
      ??app?.getState?.()?.activeArea;
    const renderedArea=document.querySelector('.m26-shell [data-m26-area][aria-current="page"]')
      ?.getAttribute('data-m26-area')||'';
    if(stateArea&&renderedArea&&String(stateArea)!==String(renderedArea))return '';
    return String(stateArea||renderedArea||'');
  });
}

async function closeMore(page){
  const open=page.locator('details.m26-mobile-more[open]').first();
  if(await open.count()){
    const summary=open.locator(':scope > summary').first();
    if(await summary.isVisible())await summary.click();
  }
}

// Browser-local QA proof: no CDP polling delay can disguise a slow painted route.
// This does NOT synthesize user input. Both the source and its post-render
// receipt must be produced by a genuine trusted browser pointer event.
async function installTrustedRoutePaintProbe(page,role){
  await page.evaluate(expectedRole=>{
    globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.stop?.();
    let pending=null,last=null,paintQueued=false,firstEligibleMs=null;
    // QA-only: collect bounded anonymous long-task timings when a genuine
    // physical navigation exceeds the 5s SLA. No URLs, client data or tokens.
    const longTasks=[];
    let perfObserver=null;
    try{
      const supported=PerformanceObserver.supportedEntryTypes||[];
      const entryTypes=['longtask','long-animation-frame'].filter(type=>supported.includes(type));
      if(entryTypes.length){
        perfObserver=new PerformanceObserver(list=>{
          for(const entry of list.getEntries()){
            const duration=Number(entry.duration);
            if(!Number.isFinite(duration)||duration<50)continue;
            const trace={type:entry.entryType,startMs:Math.round(entry.startTime),durationMs:Math.round(duration)};
            if(entry.entryType==='long-animation-frame'){
              // Bounded duration-only script evidence, never a source URL,
              // user identity, token, health payload or request metadata.
              const scriptRows=Array.from(entry.scripts||[]).slice(0,6);
              trace.scriptDurationsMs=scriptRows.map(script=>Math.round(Number(script.duration)||0));
              // Safe QA attribution: static JS function labels and numeric
              // forced-layout durations only; never source URLs, files,
              // source text, user input, token, or network metadata.
              trace.scripts=scriptRows.map(script=>{
                const name=String(script.sourceFunctionName||'');
                const invoker=String(script.invokerType||'');
                return {
                  name:/^[A-Za-z_$][\w$]{0,55}$/u.test(name)?name:'anonymous',
                  invoker:['user-callback','event-listener','resolve-promise','reject-promise','classic-script','module-script'].includes(invoker)?invoker:'other',
                  forcedLayoutMs:Math.round(Number(script.forcedStyleAndLayoutDuration)||0),
                  durationMs:Math.round(Number(script.duration)||0),
                };
              });
            }
            longTasks.push(trace);
          }
          if(longTasks.length>64)longTasks.splice(0,longTasks.length-64);
        });
        perfObserver.observe({entryTypes});
      }
    }catch{}
    const shellSelector='.m26-shell[data-m26-role="'+expectedRole+'"]';
    function routeIsPaintable(area,{checkGeometry=true}={}){
      const shell=document.querySelector(shellSelector);
      const nav=Array.from(shell?.querySelectorAll('[data-m26-area][aria-current="page"]')||[])
        .some(node=>node.getAttribute('data-m26-area')===area);
      const stateArea=globalThis.__IBERFIT_M26_APP__?.getNavigationSnapshot?.()?.activeArea;
      const main=shell?.querySelector('#m26-main');
      if(!nav||String(stateArea||'')!==area||!main||main.hasAttribute('inert')
        ||main.querySelector('.m26-route-placeholder')
        ||!main.querySelector('h1,h2,h3')
        ||String(main.textContent||'').trim().length<=30)return false;
      // Do NOT synchronously force document layout inside MutationObserver:
      // a route with the full U38 archive can turn the measurement observer
      // itself into the long task under investigation. Geometry is checked
      // once in the real rendering frame, before accepting the paint.
      if(!checkGeometry)return true;
      const rect=main.getBoundingClientRect();
      return rect.width>20&&rect.height>20
        &&getComputedStyle(main).visibility!=='hidden';
    }
    function check(){
      if(!pending||paintQueued||!routeIsPaintable(pending.area,{checkGeometry:false}))return;
      if(firstEligibleMs===null)firstEligibleMs=performance.now();
      paintQueued=true;
      requestAnimationFrame(()=>{
        paintQueued=false;
        if(!pending||!routeIsPaintable(pending.area))return;
        const paintedAt=performance.now();
        last={area:pending.area,elapsedMs:performance.now()-pending.at,trusted:true,
          eligibleElapsedMs:firstEligibleMs-pending.at,
          frameWaitMs:paintedAt-firstEligibleMs};
        pending=null;
      });
    }
    function onPointer(event){
      if(event.isTrusted!==true)return;
      const nav=event.target?.closest?.('[data-m26-area]');
      if(!nav?.closest?.(shellSelector))return;
      const area=String(nav.getAttribute('data-m26-area')||'');
      if(!area)return;
      pending={area,at:performance.now()};
      firstEligibleMs=null;
      last=null;
      check();
    }
    document.addEventListener('pointerdown',onPointer,true);
    const observer=new MutationObserver(check);
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,
      attributeFilter:['aria-current','class','style','inert']});
    globalThis.__IBERFIT_QA_U26_NAV_PAINT__={
      read:()=>last,
      readLongTasks:()=>longTasks.slice(-24),
      stop:()=>{pending=null;document.removeEventListener('pointerdown',onPointer,true);observer.disconnect();perfObserver?.disconnect();},
    };
  },role);
}


/**
 * Read-only, failing-route-only CDP CPU attribution. The first genuine
 * trusted navigation is always measured without profiler overhead and
 * keeps its hard <=5s acceptance. If it fails, repeat only the two
 * read-only route clicks to capture bounded anonymous function self-time.
 * Raw CPU profiles, source URLs, frames, snippets and private data are
 * never written to logs or to any artifact.
 */
async function diagnoseSlowCoachRouteCpu(page){
  let session=null,started=false,profile=null,completed=false;
  try{
    session=await page.context().newCDPSession(page);
    await session.send('Profiler.enable');
    await session.send('Profiler.start');
    started=true;
    for(const area of ['hoy','clientes']){
      const option=page.locator('.m26-shell[data-m26-role="coach"] [data-m26-area="'+area+'"]:visible:not([disabled])').first();
      if(!await option.count())break;
      await option.click({noWaitAfter:true,timeout:12000});
      await page.waitForFunction(expected=>{
        const current=globalThis.__IBERFIT_M26_APP__?.getNavigationSnapshot?.();
        const proof=globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.read?.();
        return String(current?.activeArea||'')===expected
          &&proof?.trusted===true&&proof.area===expected;
      },area,{timeout:12000,polling:'raf'});
      if(area==='clientes')completed=true;
    }
  }catch{
    // The primary SLA failure remains authoritative; a diagnostic failure
    // cannot turn it green, nor reveal an exception containing private data.
  }finally{
    if(session&&started){
      try{profile=(await session.send('Profiler.stop')).profile||null;}catch{}
    }
    try{await session?.send('Profiler.disable');}catch{}
    try{await session?.detach();}catch{}
  }
  if(!profile)return {status:'unavailable'};
  const nodes=new Map((profile.nodes||[]).map(node=>[
    Number(node.id),String(node.callFrame?.functionName||''),
  ]));
  const stats=new Map();
  const samples=Array.isArray(profile.samples)?profile.samples:[];
  const deltas=Array.isArray(profile.timeDeltas)?profile.timeDeltas:[];
  // Only bounded static JS names (never URL, source text or user payloads).
  for(let i=0;i<Math.min(60_000,samples.length);i++){
    const raw=nodes.get(Number(samples[i]))||'';
    const name=raw==='(garbage collector)'?'GC'
      :raw==='(idle)'?'IDLE'
      :/^[A-Za-z_$][\w$]{0,55}$/u.test(raw)?raw:'other';
    const ms=Math.max(0,Math.min(250,Number(deltas[i]||0)/1000));
    if(!Number.isFinite(ms))continue;
    stats.set(name,(stats.get(name)||0)+ms);
  }
  const top=[...stats.entries()]
    .sort((a,b)=>b[1]-a[1]).slice(0,12)
    .map(([fn,ms])=>({fn,selfMs:Math.round(ms)}));
  return {status:completed?'complete':'partial',
    samples:Math.min(60_000,samples.length),top};
}

async function navigateViaActualControl(page,role,area){
  const shell=page.locator('.m26-shell[data-m26-role="'+role+'"]');
  if(await activeArea(page)===area)return true;
  const options=shell.locator('[data-m26-area="'+area+'"]:visible:not([disabled])');
  if(!await options.count()){
    const more=shell.locator('details.m26-mobile-more:visible').first();
    if(await more.count()){
      if((await more.getAttribute('open'))===null)await more.locator(':scope > summary').click();
    }
  }
  const choice=shell.locator('[data-m26-area="'+area+'"]:visible:not([disabled])').first();
  if(!await choice.count()){
    await closeMore(page);
    return false; // Feature-gated or not exposed: remains explicitly unverified.
  }
  await expect(choice,'U26 navigation control '+role+'/'+area).toBeVisible();
  // Playwright locator.click() can wait on a completely unrelated navigation
  // watchdog even after this SPA route has already committed. Use actual,
  // trusted physical pointer input, then assert the app's route truth.
  // All U26 route/content/role/overflow checks below remain mandatory.
  await choice.scrollIntoViewIfNeeded({timeout:12000});
  const rect=await choice.boundingBox();
  expect(rect,'U26 navigation must be a physical hit target '+role+'/'+area).toBeTruthy();
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  // Do not preflight by taking a separate elementFromPoint snapshot. A genuine
  // Admin/Coach shell re-render can replace the nav or move the sidebar between
  // boundingBox and the snapshot, creating a false blocker (QA 2026-11-07).
  // Playwright's live locator click/tap performs real hit-testing, visibility,
  // stability and pointer-interception checks at action time; it will fail if
  // an overlay actually blocks the control. The trusted pointerdown receipt
  // below then proves the selected route got the physical event and painted.
  const coarse=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
  const pointerStart=Date.now();
  if(coarse)await choice.tap({noWaitAfter:true,timeout:12000});
  else await choice.click({noWaitAfter:true,timeout:12000});
  try{
    // One browser-side wait checks the real DOM, owner role, canonical store
    // and trusted-paint receipt together. Repeated CDP expect.poll can time out
    // even when the page is already painted (confirmed twice in U84 logs).
    await page.waitForFunction(({role,area})=>{
      const shell=document.querySelector('.m26-shell[data-m26-role="'+role+'"]');
      const proof=globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.read?.();
      const state=globalThis.__IBERFIT_M26_APP__?.getNavigationSnapshot?.();
      return proof?.trusted===true&&proof.area===area
        &&String(state?.activeArea||'')===area
        &&Array.from(shell?.querySelectorAll('[data-m26-area][aria-current="page"]')||[])
          .some(node=>node.getAttribute('data-m26-area')===area);
    },{role,area},{timeout:12000,polling:'raf'});
  }catch(error){
    // Keep this a real failure. Only safe route labels, stage durations and
    // counts are logged, never client content, identities, tokens or payloads.
    const diagnosis=await Promise.race([
      page.evaluate(()=>{
        const app=globalThis.__IBERFIT_M26_APP__;
        const stateArea=String(app?.getNavigationSnapshot?.()?.activeArea||'');
        const active=[...document.querySelectorAll('.m26-shell [data-m26-area][aria-current="page"]')]
          .map(node=>String(node.getAttribute('data-m26-area')||'')).slice(0,12);
        const phases=globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__?.shellRouteTimings;
        return {stateArea,renderedAreas:active,
          shellCount:document.querySelectorAll('.m26-shell').length,
          routeTimings:Array.isArray(phases)
            ?phases.slice(-16).map(p=>({phase:p.phase,area:p.area,elapsedMs:p.elapsedMs,atMs:p.atMs}))
            :[]};
      }).catch(()=>({probe:'unavailable'})),
      new Promise(resolve=>setTimeout(()=>resolve({probe:'browser-busy'}),1800)),
    ]);
    console.log('SIGNATURE_U84_ROUTE_FAILURE_DIAGNOSTIC '+role+'/'+area+' '+JSON.stringify(diagnosis));
    throw error;
  }
  const painted=await page.evaluate(()=>globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.read?.()||null);
  expect(painted?.trusted,area+': real trusted physical pointerdown required').toBe(true);
  expect(painted?.area,area+': painted route must match the physical target').toBe(area);
  expect(Number.isFinite(painted?.elapsedMs),area+': finite browser-local paint time').toBe(true);
  if(painted.elapsedMs>5_000){
    // Failure diagnostics are timings and route names only. No payload,
    // account identifier, token, or private training data is logged.
    const phases=await page.evaluate(()=>{
      const sink=globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__;
      return {appStages:Array.isArray(sink?.appStageTimes)
        ?sink.appStageTimes.slice(-18).map(p=>({stage:String(p?.stage||'').slice(0,50),
          atMs:Number(p?.atMs||0)})):[],
        shellRoutes:Array.isArray(sink?.shellRouteTimings)
          ?sink.shellRouteTimings.slice(-28).map(p=>({
            phase:p.phase,area:p.area,elapsedMs:p.elapsedMs,atMs:p.atMs,
          })):[]};
    }).catch(()=>({probe:'unavailable'}));
    const longTasks=await page.evaluate(()=>globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.readLongTasks?.()||[]).catch(()=>[]);
    console.log('SIGNATURE_U26_SLOW_REAL_PAINT '+role+'/'+area+' '+
      Math.round(painted.elapsedMs)+'ms '+
      JSON.stringify({eligibleElapsedMs:Math.round(painted.eligibleElapsedMs),
        frameWaitMs:Math.round(painted.frameWaitMs),longTasks,...phases}));
    // The measured failure above is immutable. CPU profiling starts only
    // now, on a second read-only Coach route traversal, never during the
    // original SLA measurement or a successful run.
    if(role==='coach'&&area==='clientes'
      &&Number(page.viewportSize()?.width||0)>=1000){
      const cpu=await diagnoseSlowCoachRouteCpu(page);
      console.log('SIGNATURE_U89_COACH_CPU_DIAGNOSTIC '+JSON.stringify(cpu));
    }
  }
  expect(painted.elapsedMs,area+': trusted touch-to-paint must not exceed 5s')
    .toBeLessThanOrEqual(5_000);
  console.log('SIGNATURE_U26_BROWSER_PAINT '+role+'/'+area+' '+Math.round(painted.elapsedMs)+'ms');
  console.log('SIGNATURE_U26_REAL_POINTER_ROUTE '+role+'/'+area+' '+(Date.now()-pointerStart)+'ms');
  await closeMore(page);
  return true;
}

export async function auditAuthenticatedProfessionalRoutes(page,{role,viewport}){
  if(!Object.hasOwn(PROFESSIONAL_U26_AREAS,role))throw Error('SIGNATURE_U26_ROLE_INVALID');
  if(!['desktop','mobile'].includes(viewport))throw Error('SIGNATURE_U26_VIEWPORT_INVALID');
  const config=PROFESSIONAL_U26_AREAS[role];
  const shell=page.locator('.m26-shell[data-m26-role="'+role+'"]');
  await expect(shell,'U26 requires a genuinely authenticated '+role+' app').toBeVisible();
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1);
  await expect(page.locator('.m26-role-choice[role="dialog"]')).toHaveCount(0);
  // UNIVERSAL: the actual U84 failure recorded no stage timings because
  // this QA-only opt-in sink was never initialized. Capture only route labels
  // and phase durations; never observe user content, tokens or request bodies.
  if(role==='coach'){
    await page.evaluate(()=>{
      const existing=globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__;
      if(existing&&typeof existing==='object'){
        if(!Array.isArray(existing.appStageTimes))existing.appStageTimes=[];
        if(!Array.isArray(existing.shellRouteTimings))existing.shellRouteTimings=[];
      }else{
        globalThis.__IBERFIT_QA_AUTH_INPUT_EVENTS__={
          appStageTimes:[],shellRouteTimings:[],
        };
      }
    });
  }
  await installTrustedRoutePaintProbe(page,role);
  const observed=[],notExposed=[];
  for(const area of config[viewport]){
    // Technical route labels only: no identity, free text, credentials or health data.
    const started=Date.now();
    console.log('SIGNATURE_U26_ROUTE_START '+role+'/'+viewport+'/'+area);
    if(!await navigateViaActualControl(page,role,area)){
      notExposed.push(area);
      console.log('SIGNATURE_U26_ROUTE_NOT_EXPOSED '+role+'/'+viewport+'/'+area);
      continue;
    }
    await expect(shell,'U26 must not cross role boundary').toBeVisible();
    const main=shell.locator('#m26-main');
    await expect(main,area+': actual authenticated workspace').toBeVisible();
    await expect(main,area+': no navigation-inert freeze').not.toHaveAttribute('inert','');
    await expect(main.locator('.m26-route-placeholder'),area+': never count placeholder as live body').toHaveCount(0);
    const state=await main.evaluate((root)=>{
      const rect=root.getBoundingClientRect();
      return {
        bodyVisible:rect.width>20&&rect.height>20,
        textLength:String(root.textContent||'').trim().length,
        heading:Boolean(root.querySelector('h1,h2,h3')),
        overflowing:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>document.documentElement.clientWidth+2,
        role:document.querySelector('.m26-shell')?.getAttribute('data-m26-role')||'',
        appInert:document.querySelector('.m26-shell')?.hasAttribute('inert')||false,
      };
    });
    expect(state.role,area+': role must not change').toBe(role);
    expect(state.bodyVisible,area+': visible main body').toBe(true);
    expect(state.textLength,area+': substantive real content').toBeGreaterThan(30);
    expect(state.heading,area+': semantic route heading').toBe(true);
    expect(state.overflowing,area+': horizontal document overflow').toBe(false);
    expect(state.appInert,area+': shell must not stay frozen').toBe(false);
    observed.push(area);
    console.log('SIGNATURE_U26_ROUTE_PASS '+role+'/'+viewport+'/'+area+' '+(Date.now()-started)+'ms');
  }
  for(const required of config.required){
    expect(observed,role+' '+viewport+': required protected route not verified').toContain(required);
  }
  expect(observed.length,role+' '+viewport+': meaningful authentic route coverage')
    .toBeGreaterThanOrEqual(viewport==='desktop'?3:2);
  await page.evaluate(()=>globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.stop?.());
  return Object.freeze({
    schema:'iberfit.signature.u26.professional-authenticated-readonly.v1',
    role,viewport,authenticated:true,webauthnRequired:true,readOnly:true,
    inspected:observed,notExposed,fullFunctionalAcceptance:false,
    excludedStates:['write-success','write-error','populated-contrast','offline','conflict','session-expired'],
  });
}
