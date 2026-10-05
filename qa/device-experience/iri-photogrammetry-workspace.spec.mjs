import {test,expect} from '@playwright/test';

const CLIENT='11111111-1111-4111-8111-111111111111';
const ASSESSMENT='22222222-2222-4222-8222-222222222222';
const CONSENT_PHYSICAL='33333333-3333-4333-8333-333333333333';
const CONSENT_PHOTO='44444444-4444-4444-8444-444444444444';
const CAPTURES={
  front:'55555555-5555-4555-8555-555555555551',
  back:'55555555-5555-4555-8555-555555555552',
  left:'55555555-5555-4555-8555-555555555553',
  right:'55555555-5555-4555-8555-555555555554',
};
const ANALYSIS='66666666-6666-4666-8666-666666666666';
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';

const landmarks={
  front:{shoulderLeft:{x:.28,y:.25},shoulderRight:{x:.72,y:.27},pelvisLeft:{x:.36,y:.56},pelvisRight:{x:.64,y:.56}},
  back:{shoulderLeft:{x:.28,y:.27},shoulderRight:{x:.72,y:.25},pelvisLeft:{x:.36,y:.56},pelvisRight:{x:.64,y:.56}},
  left:{ear:{x:.49,y:.13},shoulder:{x:.50,y:.27},hip:{x:.50,y:.58},ankle:{x:.50,y:.90}},
  right:{ear:{x:.51,y:.13},shoulder:{x:.50,y:.27},hip:{x:.50,y:.58},ankle:{x:.50,y:.90}},
};

function capture(view,id){
  const path=`${CLIENT}/${ASSESSMENT}/${view}/${id}/original.jpg`;
  return {
    id,client_id:CLIENT,assessment_id:ASSESSMENT,consent_id:CONSENT_PHOTO,view,
    bucket_id:'iberfit-iri-photogrammetry',object_path:path,original_file_name:`${view}.jpg`,
    mime_type:'image/jpeg',size_bytes:120000,sha256:'a'.repeat(64),width_px:1200,height_px:1800,
    source:'upload',protocol_version:'iri-photo-2026.10-v1',captured_at:'2026-10-02T10:00:00Z',
    uploaded_by:null,status:'active',revoked_at:null,created_at:'2026-10-02T10:00:00Z',
  };
}

test('Coach photogrammetry workspace stays usable by keyboard, touch and compact viewport',async({page},testInfo)=>{
  const captures=Object.entries(CAPTURES).map(([view,id])=>capture(view,id));
  const consents=[
    {id:CONSENT_PHYSICAL,client_id:CLIENT,assessment_id:ASSESSMENT,consent_type:'physical_assessment',status:'granted',document_version:'iri-physical-2026.10-v1',recorded_by:null,recorded_at:'2026-10-02T09:00:00Z',note:null},
    {id:CONSENT_PHOTO,client_id:CLIENT,assessment_id:ASSESSMENT,consent_type:'photography',status:'granted',document_version:'iri-photo-2026.10-v1',recorded_by:null,recorded_at:'2026-10-02T09:01:00Z',note:null},
  ];
  const analysis={
    id:ANALYSIS,client_id:CLIENT,assessment_id:ASSESSMENT,
    front_capture_id:CAPTURES.front,back_capture_id:CAPTURES.back,left_capture_id:CAPTURES.left,right_capture_id:CAPTURES.right,
    protocol_version:'iri-photogrammetry-2026.10-v1',landmark_schema_version:'manual-4-point-v1',
    auto_landmarks:{},validated_landmarks:landmarks,measurements:{schema:'iri-photogrammetry-measurements-v1',metrics:[],summaries:{},geometryBasis:{}},
    status:'draft',revision:2,validated_by:null,validated_at:null,created_by:null,
    created_at:'2026-10-02T10:05:00Z',updated_at:'2026-10-02T10:05:00Z',
  };

  await page.route(`${QA_ORIGIN}/**`,async(route)=>{
    const request=route.request();
    const url=new URL(request.url());
    if(url.pathname==='/rest/v1/iri_consents_v1')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(consents)});
    if(url.pathname==='/rest/v1/iri_photogrammetry_captures_v1')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(captures)});
    if(url.pathname==='/rest/v1/iri_photogrammetry_analyses_v1')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([analysis])});
    if(url.pathname==='/rest/v1/iri_photogrammetry_analyses_v2')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(url.pathname==='/rest/v1/iri_photo_report_permissions_v1')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(url.pathname.startsWith('/storage/v1/object/sign/')){
      if(request.method()==='POST'){
        const rawStoragePath=url.pathname.replace(/^\/storage\/v1/u,'');
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({signedURL:`${rawStoragePath}?token=qa-device`})});
      }
      return route.fulfill({
        status:200,
        contentType:'image/svg+xml',
        body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="1200" height="1800" fill="#d9d4c5"/></svg>',
      });
    }
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });

  const response=await page.goto('/qa/rc64/fixture.html',{waitUntil:'domcontentloaded',timeout:15_000});
  expect(response?.ok()).toBeTruthy();
  await page.addStyleTag({url:'/src/m26/workflows/iri-photogrammetry.css'});
  await page.evaluate(async({CLIENT,ASSESSMENT,QA_ORIGIN})=>{
    document.body.innerHTML=`<main id="iri-photo-qa"><label><input type="checkbox" name="physicalAssessmentConsent"> Consentimiento físico</label><div data-iri-photogrammetry-host></div></main>`;
    const {createIriPhotogrammetryController}=await import('/src/m26/workflows/iri-photogrammetry-controller.js');
    const state={
      identity:{role:'coach'},
      selectedClientId:CLIENT,
      selectedIriAssessmentId:ASSESSMENT,
      collections:{
        clients:[{id:CLIENT,name:'Cliente QA'}],
        iriAssessments:[{id:ASSESSMENT,clientId:CLIENT,assessmentType:'inicial',assessmentDate:'2026-10-02'}],
      },
    };
    const root=document.querySelector('#iri-photo-qa');
    const controller=createIriPhotogrammetryController({
      root,
      store:{getState:()=>state},
      runtime:{enabled:true,qaOnly:true,projectRef:'gjztkdwfmunnzhtvxrsu',url:QA_ORIGIN,publishableKey:'qa-device-key',version:'26.0.0-device-gate'},
      getToken:async()=>'qa-device-token',
    });
    globalThis.__IBERFIT_IRI_PHOTO_QA__=controller;
    controller.mount();
  },{CLIENT,ASSESSMENT,QA_ORIGIN});

  const shell=page.locator('[data-iri-photo-loaded="true"]');
  await expect(shell).toBeVisible({timeout:10_000});
  await expect(page.locator('[data-iri-photo-view]')).toHaveCount(4);
  await expect(page.locator('[data-iri-photo-canvas] img')).toHaveCount(4);
  await expect.poll(async()=>page.locator('[data-iri-photo-canvas] img').evaluateAll((images)=>images.every((image)=>image.complete&&image.naturalWidth>0))).toBe(true);
  const renderedSources=await page.locator('[data-iri-photo-canvas] img').evaluateAll((images)=>images.map((image)=>new URL(image.src).pathname));
  expect(renderedSources.every((path)=>path.startsWith('/storage/v1/object/sign/iberfit-iri-photogrammetry/'))).toBe(true);
  await expect(page.locator('[data-iri-photo-file]:enabled')).toHaveCount(4);
  await expect(page.locator('[name="physicalAssessmentConsent"]')).toBeChecked();
  await expect(page.locator('[data-iri-photo-analysis="validate"]')).toBeEnabled();
  await expect(shell).toContainText('Sin diagnóstico médico automático');

  const point=page.locator('[data-iri-photo-point="front:shoulderLeft"]').first();
  await point.focus();
  const before=Number(await point.getAttribute('data-x'));
  await point.press('ArrowRight');
  const after=Number(await page.locator('[data-iri-photo-point="front:shoulderLeft"]').first().getAttribute('data-x'));
  expect(after).toBeGreaterThan(before);

  const pelvisBefore=page.locator('[data-iri-photo-point="front:pelvisLeft"]').first();
  const pelvisBeforeX=Number(await pelvisBefore.getAttribute('data-x'));
  const pelvisBeforeY=Number(await pelvisBefore.getAttribute('data-y'));
  await page.locator('[data-iri-photo-mark="front:pelvisLeft"]').click();
  const canvas=page.locator('[data-iri-photo-canvas="front"]');
  await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox();
  expect(box).not.toBeNull();
  const requested={x:.42,y:.62};
  const target={x:box.x+box.width*requested.x,y:box.y+box.height*requested.y};
  const viewport=page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(target.x).toBeGreaterThanOrEqual(0);
  expect(target.x).toBeLessThanOrEqual(viewport.width);
  expect(target.y).toBeGreaterThanOrEqual(0);
  expect(target.y).toBeLessThanOrEqual(viewport.height);
  if(testInfo.project.use.hasTouch)await page.touchscreen.tap(target.x,target.y);
  else await page.mouse.click(target.x,target.y);
  const moved=page.locator('[data-iri-photo-point="front:pelvisLeft"]').first();
  await expect.poll(async()=>Number(await moved.getAttribute('data-x'))).toBeGreaterThan(pelvisBeforeX+.02);
  const movedX=Number(await moved.getAttribute('data-x'));
  const movedY=Number(await moved.getAttribute('data-y'));
  expect(Math.abs(movedX-requested.x)).toBeLessThanOrEqual(.03);
  expect(Math.abs(movedY-requested.y)).toBeLessThanOrEqual(.03);
  expect(Math.abs(movedY-pelvisBeforeY)).toBeGreaterThan(.02);

  const layout=await page.evaluate(()=>({
    viewport:innerWidth,
    documentWidth:document.documentElement.scrollWidth,
    viewCount:document.querySelectorAll('[data-iri-photo-view]').length,
    statusLive:document.querySelector('[data-iri-photo-status]')?.getAttribute('aria-live'),
  }));
  expect(layout.viewCount).toBe(4);
  expect(layout.statusLive).toBe('polite');
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport+1);
});
