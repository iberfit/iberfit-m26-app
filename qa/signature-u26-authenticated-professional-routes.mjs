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
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  const hit=await page.evaluate(({x,y})=>{
    const node=document.elementFromPoint(x,y);
    return {
      area:node?.closest?.('[data-m26-area]')?.getAttribute?.('data-m26-area')||'',
      disabled:Boolean(node?.closest?.('[disabled],[aria-disabled="true"]')),
      coarse:matchMedia('(pointer:coarse)').matches,
    };
  },{x,y});
  expect(hit.area,'U26 pointer must physically target selected route').toBe(area);
  expect(hit.disabled,'U26 navigation target must remain enabled').toBe(false);
  const pointerStart=Date.now();
  // Re-resolve the *same live control* at press time. The shell can replace
  // navigation nodes during an authenticated bootstrap refresh after the
  // geometric hit test; raw coordinates would then target a stale element.
  // Locator tap/click sends genuine pointer input, never a synthetic DOM event.
  if(hit.coarse)await choice.tap({noWaitAfter:true,timeout:12000});
  else await choice.click({noWaitAfter:true,timeout:12000});
  try{
    await expect.poll(()=>activeArea(page),{message:'U26 real-pointer route transition '+role+'/'+area,timeout:12000}).toBe(area);
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
  return Object.freeze({
    schema:'iberfit.signature.u26.professional-authenticated-readonly.v1',
    role,viewport,authenticated:true,webauthnRequired:true,readOnly:true,
    inspected:observed,notExposed,fullFunctionalAcceptance:false,
    excludedStates:['write-success','write-error','populated-contrast','offline','conflict','session-expired'],
  });
}
