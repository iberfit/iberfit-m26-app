import {test,expect} from '@playwright/test';
import {CANARY_ORIGIN,installCurrentSourceQaNetworkPolicy} from '../rc64/secure-current-source-auth.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co',LIVE=CANARY_ORIGIN;
const PAGED='/rest/v1/rpc/iberfit_client_completed_history_page_free_v1';
const R=new Set(['iberfit_bootstrap_v26','iberfit_authorized_application_roles_v13','iberfit_appointment_change_requests_v13','iberfit_application_context_v14','iberfit_privileged_assurance_context_v65d','iberfit_communication_bootstrap_v14','m26_backend_bootstrap_v43','m26_wearable_bootstrap_v44','iberfit_exercise_catalog_public_v1','iberfit_exercise_measurement_profiles_public_v1','iberfit_exercise_media_manifest_v1','iberfit_notification_preferences_status_v1','iberfit_client_completed_history_page_free_v1']);
function pathOf(raw){try{return new URL(raw)}catch{return null}}
// The candidate must be exercised against the exact local authenticated QA
// surface, never the previous LIVE Canary SHA. Canonical network policy still
// blocks any foreign request or business mutation; all private RPCs hit REAL QA.
async function perimeter(context){
 const violations=[];
 await installCurrentSourceQaNetworkPolicy(context,{
  readOnlyRpcs:R,
  onBlocked:label=>violations.push('blocked:'+String(label).slice(0,72)),
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
test('Client A atomically restores full completed sessions AND execution results after explicit click',async({page,context},testInfo)=>{
 test.skip(testInfo.project.name!=='authenticated-readonly-chromium','Only the single read-only Chromium QA account A/browser probe');
 test.setTimeout(220000);
 environment();
 const blocked=await perimeter(context),pages=[],measured=[],jobs=[],fail=[],pageErrors=[],compactBootstraps=[];
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
    pages.push({schema:p.schema,section:p.section,total:p.total,ids:p.rows?.map(x=>x.entityId)||[],
     fingerprint:p.fingerprint,hasMore:p.hasMore,status:res.status()});
   }else if(res.status()===200){
    // P0_FREE_QA_COMPACT_REF_V1: use the same authenticated bootstrap already
    // captured for wire measurement. No extra RPC and never persist response.
    const data=JSON.parse(bytes.toString('utf8'))?.data;
    if(Array.isArray(data?.sessions)&&Array.isArray(data?.sessionExecutions)
       &&Array.isArray(data?.m26Entities)){
      const canon=new Set(data.m26Entities.map(e=>String(e?.entityType)+':'+String(e?.entityId)));
      const summarize=(rows,type)=>{
        // Inspect the FINAL browser RPC after outer role/privacy projection.
        // Sessions carry id+status+empty blocks so the outer publication
        // filter retains them. Executions have id+empty safe projection.
        const compact=rows.filter(x=>{
          if(!x||typeof x.id!=='string')return false;
          const keys=Object.keys(x);
          if(type==='session')return keys.every(k=>['id','status','blocks'].includes(k))
            &&keys.includes('status')&&x.status==='publicado'
            &&Array.isArray(x.blocks)&&x.blocks.length===0;
          return keys.every(k=>['id','results','feedback','planSnapshot','sourceSnapshot'].includes(k))
            &&Array.isArray(x.results)&&x.results.length===0
            &&!('revision' in x);
        });
        return {total:rows.length,compact:compact.length,
          resolved:compact.filter(x=>canon.has(type+':'+x.id)).length};
      };
      compactBootstraps.push({sessions:summarize(data.sessions,'session'),
        executions:summarize(data.sessionExecutions,'session_execution')});
    }
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
 expect(blocked,'QA current-source perimeter must reject no required operation').toEqual([]);
 expect(pageErrors).toEqual([]);
 expect(pages.length).toBeGreaterThanOrEqual(34);
 expect(pages.every(p=>p.schema==='iberfit.client.completed-history.page.qa.v1'&&p.status===200&&p.ids.length<=24)).toBe(true);
 const totals={};
 for(const section of ['session','session_execution']){
  const group=pages.filter(p=>p.section===section);
  expect(group.length,section+' must be paged by an explicit request').toBeGreaterThanOrEqual(17);
  expect(new Set(group.map(p=>p.fingerprint)).size,section+' fingerprint stable').toBe(1);
  expect(new Set(group.map(p=>p.total)).size,section+' total stable').toBe(1);
  const total=group[0].total;
  expect(total,section+' historical count').toBeGreaterThanOrEqual(396);
  expect(group.reduce((a,p)=>a+p.ids.length,0),section+' no partial history').toBe(total);
  expect(new Set(group.flatMap(p=>p.ids)).size,section+' no duplicate records').toBe(total);
  expect(group.filter(p=>p.hasMore===false),section+' exactly one terminal page').toHaveLength(1);
  totals[section]=total;
 }
 expect(totals.session_execution,'complete execution results must accompany sessions').toBe(totals.session);
 const h=measured.filter(x=>x.group==='history');
 const evidence={schema:'iberfit.qa.free.history.live.v1',client:'synthetic-A',
  pages:pages.length,uniqueSessions:totals.session,uniqueExecutions:totals.session_execution,
  sectionPages:{session:pages.filter(p=>p.section==='session').length,
   session_execution:pages.filter(p=>p.section==='session_execution').length},httpErrors:measured.filter(x=>x.status>=400).length,
  decodedHistoryBytes:h.reduce((a,x)=>a+x.decoded,0),
  chromiumNetworkBodyBytes:h.reduce((a,x)=>a+(x.wireBody||0),0),
  chromiumNetworkHeadersBytes:h.reduce((a,x)=>a+(x.wireHeaders||0),0),
  networkSizesAvailable:h.filter(x=>x.wireBody!==null).length,
  decodedBootstrapBytes:measured.filter(x=>x.group==='bootstrap').reduce((a,x)=>a+x.decoded,0),
  blockedRequests:blocked.length,bodyOrJWTRecorded:false,notBillingEgress:true};
 expect(evidence.httpErrors).toBe(0);
 expect(evidence.chromiumNetworkBodyBytes).toBeGreaterThan(0);
 // A legacy row without a safe canonical match must remain full, not be
 // silently dropped. Compact references require the canon in this same reply.
 expect(compactBootstraps.length,'authenticated Client A bootstrap present').toBeGreaterThan(0);
 const compact=compactBootstraps.at(-1);
 expect(compact.sessions.total).toBeGreaterThanOrEqual(396);
 expect(compact.executions.total).toBeGreaterThanOrEqual(396);
 expect(compact.sessions.compact).toBeGreaterThanOrEqual(396);
 expect(compact.executions.compact).toBeGreaterThanOrEqual(396);
 expect(compact.sessions.resolved).toBe(compact.sessions.compact);
 expect(compact.executions.resolved).toBe(compact.executions.compact);
 evidence.compactLegacyRefs={sessions:compact.sessions,executions:compact.executions};
 expect(evidence.notBillingEgress).toBe(true);
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
