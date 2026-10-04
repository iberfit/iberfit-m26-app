import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {test,expect} from '@playwright/test';

const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN='https://'+QA_REF+'.supabase.co';
const CLIENT_ID='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const BUILD_ROOT=path.resolve('.tmp/rc64-current-surface');
const PUBLIC_BUILD_ROOT=path.join(BUILD_ROOT,'public');
const OUT_DIR=path.resolve('recovery/coach-iri-document-privileged');
const WEBAUTHN_PATH='/functions/v1/iberfit-webauthn-v1';
const REPORT_PATH='/functions/v1/iberfit-iri-report-emission-v1';
const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13','iberfit_application_context_v14',
  'iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43','m26_wearable_bootstrap_v44',
  'iberfit_exercise_catalog_public_v1','iberfit_exercise_media_manifest_v1',
]);
const PHOTO_TABLES=new Set([
  '/rest/v1/iri_consents_v1',
  '/rest/v1/iri_photogrammetry_captures_v1',
  '/rest/v1/iri_photogrammetry_analyses_v1',
  '/rest/v1/iri_photogrammetry_analyses_v2',
  '/rest/v1/iri_photo_report_permissions_v1',
]);
const PHOTO_WRITE_RPCS=new Set([
  'iberfit_save_iri_photogrammetry_analysis_v2',
  'iberfit_record_iri_photo_report_permission_v1',
]);
const MIME=Object.freeze({
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2',
});

function mimeFor(file){return MIME[path.extname(file).toLowerCase()]||'application/octet-stream';}
function safeCandidate(base,relative){
  const candidate=path.resolve(base,relative);
  return candidate===base||candidate.startsWith(base+path.sep)?candidate:null;
}
async function currentSource(relative){
  for(const base of [BUILD_ROOT,PUBLIC_BUILD_ROOT]){
    const candidate=safeCandidate(base,relative);
    if(!candidate)continue;
    try{return {body:await readFile(candidate),candidate};}catch{}
  }
  return null;
}
async function fulfillCurrentSource(route,url){
  let pathname=decodeURIComponent(url.pathname||'/');
  if(pathname==='/'||pathname==='')pathname='/index.html';
  const relative=pathname.replace(/^\/+/, '');
  const resolved=await currentSource(relative);
  if(resolved){
    await route.fulfill({status:200,body:resolved.body,headers:{'content-type':mimeFor(resolved.candidate),'cache-control':'no-store','x-content-type-options':'nosniff'}});
    return;
  }
  if(!path.extname(relative)){
    try{
      const body=await readFile(path.join(BUILD_ROOT,'index.html'));
      await route.fulfill({status:200,body,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
      return;
    }catch{}
  }
  await route.fulfill({status:404,body:'Not found'});
}
function readOnlyPushConfig(request,url,method){
  if(method!=='POST'||url.pathname!=='/functions/v1/iberfit-web-push-sender-v1')return false;
  try{
    const body=request.postDataJSON();
    return body&&typeof body==='object'&&!Array.isArray(body)&&body.action==='config'&&Object.keys(body).length===1;
  }catch{return false;}
}
function allowedQaRequest(request,evidence){
  let url;
  try{url=new URL(request.url());}catch{return false;}
  const method=request.method().toUpperCase();
  if(url.origin!==QA_ORIGIN)return false;
  if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return true;
  if(method==='POST'&&url.pathname==='/auth/v1/logout')return true;
  if(method==='GET'&&url.pathname==='/auth/v1/user')return true;
  if(method==='GET'&&url.pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method==='POST'&&url.pathname==='/rest/v1/rpc/iberfit_notification_preferences_status_v1')return true;
  if(method==='POST'&&url.pathname===WEBAUTHN_PATH){
    try{evidence.webauthnActions.push(String(request.postDataJSON()?.action||'unknown'));}catch{}
    return true;
  }
  if(readOnlyPushConfig(request,url,method))return true;
  const rpcPrefix='/rest/v1/rpc/';
  if(method==='POST'&&url.pathname.startsWith(rpcPrefix)){
    const rpc=url.pathname.slice(rpcPrefix.length);
    if(READ_ONLY_RPCS.has(rpc))return true;
    if(PHOTO_WRITE_RPCS.has(rpc)){evidence.privilegedMutations.push(rpc);return true;}
  }
  if(method==='GET'&&PHOTO_TABLES.has(url.pathname))return true;
  if(url.pathname.startsWith('/storage/v1/object/sign/iberfit-iri-photogrammetry/')){
    return method==='GET'||method==='POST';
  }
  if(method==='POST'&&url.pathname===REPORT_PATH){
    try{evidence.reportActions.push(String(request.postDataJSON()?.action||'unknown'));}catch{}
    return true;
  }
  if(method==='GET'&&url.pathname.startsWith('/storage/v1/object/sign/iberfit-iri-issued-reports/'))return true;
  return false;
}
async function installPolicy(context,evidence){
  await context.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}catch{
      evidence.blocked.push('INVALID_URL');await route.abort('blockedbyclient');return;
    }
    if(url.origin===CANARY_ORIGIN){await fulfillCurrentSource(route,url);return;}
    if(allowedQaRequest(request,evidence)){await route.continue();return;}
    evidence.blocked.push(request.method().toUpperCase()+' '+url.origin+' '+url.pathname);
    await route.abort('blockedbyclient');
  });
}
async function addAuthenticator(page){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const created=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,
    isUserVerified:true,automaticPresenceSimulation:true,
  }});
  return {cdp,authenticatorId:created.authenticatorId};
}
async function loginWithWebAuthn(page,email,password){
  await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});
  await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
  await page.locator('#m26-login-password').fill(password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const mfa=page.locator('[data-auth-action="mfa-continue-webauthn"]');
  await expect(mfa).toBeVisible({timeout:20_000});
  await mfa.click();
  await expect(page.locator('.m26-shell[data-m26-role="coach"]')).toBeVisible({timeout:30_000});
  await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:15_000});
}
async function openArea(page,area){
  const target=page.locator('[data-m26-area="'+area+'"]:visible').first();
  await expect(target,'Expected visible navigation area '+area).toBeVisible({timeout:15_000});
  await target.click();
}
async function openSyntheticClient(page){
  await openArea(page,'clientes');
  const button=page.locator('[data-m26-select-client="'+CLIENT_ID+'"]:visible').first();
  await expect(button,'Synthetic document fixture must be visible to the QA Coach').toBeVisible({timeout:20_000});
  await button.click();
  await expect(page.locator('[data-m26-area="iri"]:visible').first()).toBeVisible({timeout:15_000});
}
async function dismissCoachGuide(page){
  const dialog=page.getByRole('dialog',{name:'Tu centro Coach, sin perder tiempo'});
  if(!await dialog.isVisible().catch(()=>false))return;
  const skip=dialog.getByRole('button',{name:'Saltar guía'});
  if(await skip.isVisible().catch(()=>false))await skip.click();
  else await dialog.getByRole('button',{name:'Cerrar y continuar después'}).click();
  await expect(dialog).toBeHidden({timeout:10_000});
}
async function openPhotography(page){
  await openArea(page,'iri');
  await expect(page.getByRole('heading',{name:'Índice de Rendimiento IBERFIT'})).toBeVisible({timeout:20_000});
  await dismissCoachGuide(page);
  const form=page.locator('[data-workflow-form="iri"]');
  const jump=page.locator('[data-iri-step-jump="6"]');
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(form).toHaveAttribute('data-iri-step-index','6',{timeout:15_000});
  const shell=page.locator('[data-iri-photo-loaded="true"]');
  await expect(shell).toBeVisible({timeout:30_000});
  await expect(page.locator('[data-iri-photo-view]')).toHaveCount(4);
  return shell;
}
async function calibrateView(page,view){
  const viewButton=page.locator('[data-iri-photo-view-select="'+view+'"]');
  await expect(viewButton).toBeVisible();
  await viewButton.click();
  await expect(viewButton).toHaveAttribute('aria-pressed','true');
  const input=page.locator('[data-iri-photo-calibration-length="'+view+'"]');
  await expect(input).toBeVisible();
  await input.fill('50');
  await page.locator('[data-iri-photo-calibrate="'+view+'"]').click();
  const canvas=page.locator('[data-iri-photo-canvas="'+view+'"]');
  await canvas.scrollIntoViewIfNeeded();
  const first=await canvas.boundingBox();
  expect(first).not.toBeNull();
  await page.mouse.click(first.x+first.width*.10,first.y+first.height*.20);
  const second=await canvas.boundingBox();
  expect(second).not.toBeNull();
  await page.mouse.click(second.x+second.width*.10,second.y+second.height*.70);
  await expect(page.locator('[data-iri-photo-calibration-length="'+view+'"]')).toHaveValue('50');
}
async function setPhotoPublication(page,wantPublished){
  const button=page.locator('[data-iri-photo-report-permission]').first();
  await expect(button).toBeVisible({timeout:15_000});
  const expectedAction=wantPublished?'revoke':'grant';
  const current=await button.getAttribute('data-iri-photo-report-permission');
  if(current!==expectedAction)await button.click();
  await expect(page.locator('[data-iri-photo-report-permission]').first()).toHaveAttribute('data-iri-photo-report-permission',expectedAction,{timeout:20_000});
  await expect(page.locator('.m26-photo-consents')).toContainText(wantPublished?'Permitidas':'No permitidas');
}
async function issueClientPdf(page,context){
  await openArea(page,'informes');
  const issue=page.locator('[data-workflow-action="issue-client-iri-report"]').first();
  await expect(issue).toBeVisible({timeout:20_000});
  const popupPromise=context.waitForEvent('page',{timeout:20_000});
  await issue.click();
  const popup=await popupPromise;
  await popup.waitForURL(/\/storage\/v1\/object\/sign\/iberfit-iri-issued-reports\//u,{timeout:180_000});
  const signedUrl=popup.url();
  const response=await context.request.get(signedUrl,{timeout:60_000});
  expect(response.ok()).toBe(true);
  const body=await response.body();
  expect(body.byteLength).toBeGreaterThan(1000);
  expect(body.subarray(0,5).toString('utf8')).toBe('%PDF-');
  await popup.close().catch(()=>{});
  return body;
}

test('real Coach WebAuthn assurance validates v2, grants photo publication, emits Client PDF and revokes permission',async({browser})=>{
  const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD'];
  expect(required.filter((name)=>!process.env[name]),'Missing authorized QA environment').toEqual([]);
  expect(process.env.M26_PROJECT_REF).toBe(QA_REF);
  expect(String(process.env.M26_QA_ONLY).toLowerCase()).toBe('true');
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(QA_ORIGIN);
  expect(String(process.env.M26_QA_COACH_EMAIL||'').toLowerCase()).toBe('qa.rc74.coach@iberfit.cl');

  const evidence={
    schema:'iberfit.qa-coach-iri-document-privileged-ui.v1',
    projectRef:QA_REF,clientId:CLIENT_ID,synthetic:true,realPersonData:false,
    webauthnActions:[],privilegedMutations:[],reportActions:[],blocked:[],
    analysisValidated:false,photoPublicationGranted:false,clientPdfIssued:false,photoPublicationRevoked:false,
  };
  const context=await browser.newContext({
    ignoreHTTPSErrors:false,locale:'es-ES',timezoneId:'America/Santiago',
    serviceWorkers:'block',viewport:{width:1440,height:1000},hasTouch:true,
  });
  await installPolicy(context,evidence);
  const page=await context.newPage();
  const consoleErrors=[];
  const pageErrors=[];
  page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(String(message.text()||'').slice(0,500));});
  page.on('pageerror',(error)=>pageErrors.push(String(error?.message||error||'PAGE_ERROR').slice(0,500)));
  const {cdp,authenticatorId}=await addAuthenticator(page);
  let publicationGranted=false;
  try{
    const navigation=await page.goto(CANARY_ORIGIN+'/',{waitUntil:'networkidle',timeout:20_000});
    expect(navigation?.ok()).toBeTruthy();
    await loginWithWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
    expect(evidence.webauthnActions).toContain('registration-options');
    expect(evidence.webauthnActions).toContain('registration-verify');

    const logout=page.locator('[data-m26-action="logout"]').first();
    await expect(logout).toHaveCount(1,{timeout:10_000});
    await logout.evaluate((element)=>element.click());
    await expect(page.getByRole('textbox',{name:'Correo',exact:true})).toBeVisible({timeout:20_000});

    const secondStart=evidence.webauthnActions.length;
    await loginWithWebAuthn(page,process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
    const second=evidence.webauthnActions.slice(secondStart);
    expect(second).toContain('authentication-options');
    expect(second).toContain('authentication-verify');
    expect(second).not.toContain('registration-options');

    await openSyntheticClient(page);
    await openPhotography(page);
    await expect(page.locator('.m26-photo-consents')).toContainText('Autorizadas');
    const revisionNode=page.locator('[data-iri-analysis-revision]');
    const revisionBefore=Number(await revisionNode.getAttribute('data-iri-analysis-revision')||0);
    for(const view of ['front','back','left','right'])await calibrateView(page,view);
    const validate=page.locator('[data-iri-photo-analysis="validate"]');
    await expect(validate).toBeEnabled();
    await validate.click();
    await expect.poll(async()=>{
      return Number(await page.locator('[data-iri-analysis-revision]').getAttribute('data-iri-analysis-revision')||0);
    },{timeout:35_000}).toBeGreaterThan(revisionBefore);
    evidence.analysisValidated=true;

    await setPhotoPublication(page,true);
    publicationGranted=true;
    evidence.photoPublicationGranted=true;
    const pdf=await issueClientPdf(page,context);
    await mkdir(OUT_DIR,{recursive:true});
    await writeFile(path.join(OUT_DIR,'client-with-photo-permission.pdf'),pdf);
    evidence.clientPdfBytes=pdf.byteLength;
    evidence.clientPdfIssued=true;

    await openPhotography(page);
    await setPhotoPublication(page,false);
    publicationGranted=false;
    evidence.photoPublicationRevoked=true;
  }finally{
    if(publicationGranted){
      try{
        await openPhotography(page);
        await setPhotoPublication(page,false);
        evidence.photoPublicationRevoked=true;
      }catch(error){
        evidence.cleanupError=String(error?.message||error).slice(0,300);
      }
    }
    await mkdir(OUT_DIR,{recursive:true});
    evidence.generatedAt=new Date().toISOString();
    await writeFile(path.join(OUT_DIR,'evidence.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId}).catch(()=>{});
    await cdp.send('WebAuthn.disable').catch(()=>{});
    await context.close().catch(()=>{});
  }

  expect(evidence.blocked,'Only the explicitly authorized QA surface may be contacted').toEqual([]);
  expect(consoleErrors,'Privileged Coach IRI UI must keep a clean console').toEqual([]);
  expect(pageErrors,'Privileged Coach IRI UI must keep a clean page').toEqual([]);
  expect(evidence.privilegedMutations).toContain('iberfit_save_iri_photogrammetry_analysis_v2');
  expect(evidence.privilegedMutations).toContain('iberfit_record_iri_photo_report_permission_v1');
  expect(evidence.reportActions).toContain('issue');
  expect(evidence.analysisValidated).toBe(true);
  expect(evidence.photoPublicationGranted).toBe(true);
  expect(evidence.clientPdfIssued).toBe(true);
  expect(evidence.photoPublicationRevoked).toBe(true);
});
