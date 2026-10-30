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
    const value=app?.getState?.()?.activeArea;
    return String(value||document.querySelector('.m26-shell [data-m26-area][aria-current="page"]')?.getAttribute('data-m26-area')||'');
  });
}

async function closeMore(page){
  const open=page.locator('details.m26-mobile-more[open]').first();
  if(await open.count()){
    const summary=open.locator(':scope > summary').first();
    if(await summary.isVisible())await summary.click();
  }
}

// Real-browser responsiveness: never treat slow Playwright/CDP transport as
// proof of slow UI, nor accept a UI that actually paints beyond 5 seconds.
async function installProfessionalNavigationPaintProbe(page){
  await page.evaluate(()=>{
    globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.stop?.();
    let pending=null,paintQueued=false,last=null;
    const navSelector='.m26-shell [data-m26-area]';
    const isActive=(area)=>[...document.querySelectorAll(navSelector)].some(node=>
      node.getAttribute('data-m26-area')===area&&node.getAttribute('aria-current')==='page');
    const paintedMain=()=>{
      const main=document.querySelector('.m26-shell #m26-main');
      if(!main||!main.querySelector('h1,h2,h3'))return false;
      const rect=main.getBoundingClientRect();
      return rect.width>20&&rect.height>20&&getComputedStyle(main).visibility!=='hidden';
    };
    const probe=()=>{
      if(!pending||paintQueued||!isActive(pending.area)||!paintedMain())return;
      paintQueued=true;
      requestAnimationFrame(()=>{
        paintQueued=false;
        if(!pending||!isActive(pending.area)||!paintedMain())return;
        const elapsedMs=performance.now()-pending.at;
        last={area:pending.area,elapsedMs,trusted:true};
        pending=null;
      });
    };
    const onPointer=(event)=>{
      if(event.isTrusted!==true)return;
      const target=event.target?.closest?.('[data-m26-area]');
      if(!target||!target.closest('.m26-shell'))return;
      const area=String(target.getAttribute('data-m26-area')||'');
      if(!area)return;
      pending={area,at:performance.now()};
      probe();
    };
    document.addEventListener('pointerdown',onPointer,true);
    const observer=new MutationObserver(probe);
    observer.observe(document.documentElement,{childList:true,subtree:true,
      attributes:true,attributeFilter:['aria-current','class','style']});
    globalThis.__IBERFIT_QA_U26_NAV_PAINT__={
      read:()=>last,
      stop:()=>{document.removeEventListener('pointerdown',onPointer,true);observer.disconnect();},
    };
  });
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
  if(hit.coarse)await page.touchscreen.tap(x,y);
  else await page.mouse.click(x,y);
  await expect.poll(()=>activeArea(page),{message:'U26 real-pointer route transition '+role+'/'+area,timeout:12000}).toBe(area);
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
  await installProfessionalNavigationPaintProbe(page);
  const observed=[],notExposed=[];
  for(const area of config[viewport]){
    // Technical route labels only: no identity, free text, credentials or health data.
    const started=Date.now();
    console.log('SIGNATURE_U26_ROUTE_START '+role+'/'+viewport+'/'+area);
    const alreadyActive=await activeArea(page)===area;
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
        navPaint:globalThis.__IBERFIT_QA_U26_NAV_PAINT__?.read?.()||null,
      };
    });
    expect(state.role,area+': role must not change').toBe(role);
    expect(state.bodyVisible,area+': visible main body').toBe(true);
    expect(state.textLength,area+': substantive real content').toBeGreaterThan(30);
    expect(state.heading,area+': semantic route heading').toBe(true);
    expect(state.overflowing,area+': horizontal document overflow').toBe(false);
    expect(state.appInert,area+': shell must not stay frozen').toBe(false);
    if(!alreadyActive){
      expect(state.navPaint?.trusted,area+': require a trusted real pointerdown').toBe(true);
      expect(state.navPaint?.area,area+': route paint must match the physical target').toBe(area);
      expect(state.navPaint?.elapsedMs,area+': real touch-to-paint <=5s, without rounding')
        .toBeLessThanOrEqual(5_000);
      console.log('SIGNATURE_U26_BROWSER_PAINT '+role+'/'+viewport+'/'+area+' '+Math.round(state.navPaint.elapsedMs)+'ms');
    }
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
