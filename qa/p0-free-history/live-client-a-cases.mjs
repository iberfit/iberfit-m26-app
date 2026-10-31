import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co',LIVE='https://m26-canary.iberfit.cl';
const PAGED='/rest/v1/rpc/iberfit_client_completed_history_page_free_v1';
const R=new Set(['iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13','iberfit_appointment_change_requests_v13','iberfit_application_context_v14','iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14','m26_backend_bootstrap_v43','m26_wearable_bootstrap_v44','iberfit_exercise_catalog_public_v1','iberfit_exercise_measurement_profiles_public_v1','iberfit_exercise_media_manifest_v1','iberfit_notification_preferences_status_v1','iberfit_client_completed_history_page_free_v1']);
function pathOf(raw){try{return new URL(raw)}catch{return null}}
function safe(req){
 const u=pathOf(req.url()),m=req.method().toUpperCase();
 if(!u)return false;
 if(u.origin===LIVE)return m==='GET';
 if(u.origin!==QA)return false;
 if(u.pathname==='/auth/v1/token'&&m==='POST')return ['password','refresh_token'].includes(u.searchParams.get('grant_type'));
 if(u.pathname==='/auth/v1/user'&&m==='GET')return true;
 if(u.pathname==='/auth/v1/logout'&&m==='POST')return true;
 if(u.pathname==='/rest/v1/domain_command_registry_v26'&&m==='GET')return true;
 if(u.pathname.startsWith('/storage/v1/object/authenticated/iberfit-profile-avatars/')&&u.pathname.endsWith('/avatar.webp')&&m==='GET')return true;
 if(u.pathname==='/functions/v1/iberfit-web-push-sender-v1'&&m==='POST'){
  try{const b=req.postDataJSON();return b?.action==='config'&&Object.keys(b).length===1}catch{return false}
 }
 return m==='POST'&&u.pathname.startsWith('/rest/v1/rpc/')&&R.has(u.pathname.slice(13));
}
async function perimeter(context){
 const violations=[];
 await context.route('**/*',async route=>{
  const req=route.request();
  if(safe(req))return route.continue();
  violations.push('blocked:'+String(pathOf(req.url())?.pathname||'unknown').slice(0,72));
  return route.abort('blockedbyclient');
 });
 return violations;
}
function environment(){
 for(const x of ['M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD','M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'])expect(process.env[x],x).toBeTruthy();
 expect(process.env.M26_PROJECT_REF).toBe('gjztkdwfmunnzhtvxrsu');
 expect(process.env.M26_QA_ONLY).toBe('true');
 expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(QA);
 expect(process.env.M26_QA_CLIENT_A_EMAIL.toLowerCase()).toBe('qa.rc74.client-a@iberfit.cl');
 expect(process.env.M26_QA_CLIENT_B_EMAIL.toLowerCase()).toBe('qa.rc74.client-b@iberfit.cl');
}
async function login(page,email,password){
 await page.goto(LIVE+'/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.getByRole('textbox',{name:'Correo',exact:true}).fill(email);
 await page.locator('#m26-login-password').fill(password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:45000});
 await expect(page.locator('#app[data-m26-controllers="ready"]')).toHaveCount(1,{timeout:45000});
 const pause=page.locator('[data-m26-client-guided-welcome-pause]:visible').first();
 if(await pause.count())await pause.click();
 for(const s of ['[data-m26-guided-tour-close]:visible','[data-m26-client-context-guide-close]:visible']){
  const close=page.locator(s).first();if(await close.count())await close.click();
 }
}
// A dedicated test scope overrides the parent M43 screenshot-on-failure default.
// Do NOT persist traces, screenshots, videos, headers, JWTs or response bodies.
export function registerQaLiveHistoryTestSuite(){
test.describe('P0 QA free completed history live browser',()=>{
// Recording disabled in both Playwright configs. Test scope cannot change worker options.
test('Client A requests full archive only after a click and receives all 396+ sessions',async({page,context},testInfo)=>{
 test.skip(testInfo.project.name!=='authenticated-readonly-chromium','Only the single read-only Chromium QA account A/browser probe');
 test.setTimeout(220000);
 environment();
 const blocked=await perimeter(context),pages=[],measured=[],jobs=[],fail=[],pageErrors=[];
 page.on('pageerror',err=>pageErrors.push(String(err?.name||'Error').slice(0,30)));
 page.on('requestfailed',r=>{if(pathOf(r.url())?.pathname===PAGED)fail.push('transport')});
 page.on('response',res=>{
  const u=pathOf(res.url());if(u?.origin!==QA||![PAGED,'/rest/v1/rpc/iberfit_bootstrap_v26'].includes(u.pathname))return;
  const task=(async()=>{
   await res.finished();
   const sizes=await res.request().sizes().catch(()=>null);
   const bytes=await res.body();
   const archive=u.pathname===PAGED;
   measured.push({group:archive?'history':'bootstrap',status:res.status(),decoded:bytes.byteLength,
    wireBody:sizes?.responseBodySize??null,wireHeaders:sizes?.responseHeadersSize??null});
   if(archive){const p=JSON.parse(bytes.toString('utf8'));
    pages.push({schema:p.schema,total:p.total,ids:p.rows?.map(x=>x.entityId)||[],
     fingerprint:p.fingerprint,hasMore:p.hasMore,status:res.status()});
   }
  })();
  jobs.push(task);
 });
 await login(page,process.env.M26_QA_CLIENT_A_EMAIL,process.env.M26_QA_CLIENT_A_PASSWORD);
 await page.locator('[data-m26-area="sesion"]:visible').first().click();
 await expect(page.locator('[data-m26-free-history-open]')).toBeVisible({timeout:20000});
 await page.locator('[data-m26-area="planificacion"]:visible').first().click();
 await expect(page.locator('[data-m26-free-history-open]')).toBeVisible({timeout:20000});
 await page.locator('[data-m26-area="sesion"]:visible').first().click();
 await expect(page.locator('[data-m26-free-history-open]')).toBeVisible({timeout:20000});
 await Promise.all(jobs);
 expect(pages,'navigation must issue zero page RPCs').toHaveLength(0);
 await page.locator('[data-m26-free-history-open]').click();
 await expect(page.locator('[data-m26-free-history-status]')).toHaveCount(0,{timeout:160000});
 await Promise.all(jobs);
 expect(fail).toEqual([]);
 expect(pageErrors).toEqual([]);
 expect(pages.length).toBeGreaterThanOrEqual(17);
 expect(pages.every(p=>p.schema==='iberfit.client.completed-history.page.qa.v1'&&p.status===200&&p.ids.length<=24)).toBe(true);
 expect(new Set(pages.map(p=>p.fingerprint)).size).toBe(1);
 expect(new Set(pages.map(p=>p.total)).size).toBe(1);
 const total=pages[0].total;
 expect(total).toBeGreaterThanOrEqual(396);
 expect(pages.reduce((a,p)=>a+p.ids.length,0)).toBe(total);
 expect(new Set(pages.flatMap(p=>p.ids)).size).toBe(total);
 expect(pages.filter(p=>p.hasMore===false)).toHaveLength(1);
 const h=measured.filter(x=>x.group==='history');
 const evidence={schema:'iberfit.qa.free.history.live.v1',client:'synthetic-A',
  pages:pages.length,uniqueSessions:total,httpErrors:measured.filter(x=>x.status>=400).length,
  decodedHistoryBytes:h.reduce((a,x)=>a+x.decoded,0),
  chromiumNetworkBodyBytes:h.reduce((a,x)=>a+(x.wireBody||0),0),
  chromiumNetworkHeadersBytes:h.reduce((a,x)=>a+(x.wireHeaders||0),0),
  networkSizesAvailable:h.filter(x=>x.wireBody!==null).length,
  decodedBootstrapBytes:measured.filter(x=>x.group==='bootstrap').reduce((a,x)=>a+x.decoded,0),
  blockedRequests:blocked.length,bodyOrJWTRecorded:false,notBillingEgress:true};
 expect(evidence.httpErrors).toBe(0);
 expect(evidence.chromiumNetworkBodyBytes).toBeGreaterThan(0);
 await mkdir('recovery/p0-free-history',{recursive:true});
 await writeFile('recovery/p0-free-history/live-qa-wire.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('P0_QA_FREE_HISTORY_WIRE:'+JSON.stringify(evidence));
});
test('Client B never receives the history CTA or page RPCs',async({page,context},testInfo)=>{
 test.skip(testInfo.project.name!=='authenticated-readonly-chromium','Only the single read-only Chromium QA account B/browser probe');
 environment();await perimeter(context);let paged=0;
 page.on('request',r=>{if(pathOf(r.url())?.pathname===PAGED)paged++});
 await login(page,process.env.M26_QA_CLIENT_B_EMAIL,process.env.M26_QA_CLIENT_B_PASSWORD);
 await page.locator('[data-m26-area="sesion"]:visible').first().click();
 await expect(page.locator('[data-m26-free-history-open]')).toHaveCount(0);
 await page.locator('[data-m26-area="planificacion"]:visible').first().click();
 await expect(page.locator('[data-m26-free-history-open]')).toHaveCount(0);
 expect(paged).toBe(0);
});
});
}
