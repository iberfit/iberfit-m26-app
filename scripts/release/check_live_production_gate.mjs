import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const PROD_ORIGIN='https://app.iberfit.cl';
const PROD_REF='pjhmrhejsoofmouedavw';
const PROD_SUPABASE_ORIGIN=`https://${PROD_REF}.supabase.co`;
const SOURCE_BRANCH='prep/final-production-rc74-4';
const EVIDENCE_DIR=path.resolve('recovery','final-production-live');
const expectedSha=String(process.env.M26_EXPECTED_PROD_SOURCE_SHA||'').trim().toLowerCase();

function invariant(condition,code){
  if(!condition)throw new Error(code);
}
function canonicalSha(value){
  const sha=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{40}$/u.test(sha)?sha:'';
}
function sanitizeVersion(raw){
  return Object.freeze({
    sourceSha:canonicalSha(raw?.sourceSha||raw?.commit||raw?.sha),
    sourceBranch:String(raw?.sourceBranch||raw?.branch||'').trim(),
    environment:String(raw?.environment||'').trim(),
    production:raw?.production===true,
    qaOnly:raw?.qaOnly===true,
    projectRef:String(raw?.projectRef||'').trim(),
    version:String(raw?.version||'').trim().slice(0,120),
  });
}
async function fetchJson(url){
  const response=await fetch(url,{
    method:'GET',cache:'no-store',redirect:'error',
    headers:{'cache-control':'no-cache','pragma':'no-cache'},
  });
  invariant(response.ok,`FINAL_PROD_LIVE_HTTP_${response.status}`);
  return response.json();
}
async function inspectViewport(browser,{name,width,height}){
  const context=await browser.newContext({
    viewport:{width,height},locale:'es-ES',timezoneId:'America/Santiago',serviceWorkers:'block',
  });
  const page=await context.newPage();
  const blockedMutations=[];
  const forbiddenOrigins=[];
  const consoleErrors=[];
  const pageErrors=[];
  const requestFailures=[];
  const badResponses=[];

  await page.route('**/*',async(route)=>{
    const request=route.request();
    let url;try{url=new URL(request.url());}catch{return route.abort();}
    const method=request.method().toUpperCase();
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      blockedMutations.push({method,origin:url.origin,path:url.pathname.slice(0,180)});
      return route.abort();
    }
    if(url.hostname.endsWith('.supabase.co')&&url.origin!==PROD_SUPABASE_ORIGIN){
      forbiddenOrigins.push(url.origin);return route.abort();
    }
    return route.continue();
  });
  page.on('console',(message)=>{
    if(message.type()==='error')consoleErrors.push({text:String(message.text()||'').slice(0,500)});
  });
  page.on('pageerror',(error)=>pageErrors.push({name:String(error?.name||'Error'),message:String(error?.message||'').slice(0,500)}));
  page.on('requestfailed',(request)=>requestFailures.push({method:request.method(),url:String(request.url()).slice(0,300),error:String(request.failure()?.errorText||'').slice(0,300)}));
  page.on('response',(response)=>{if(response.status()>=400)badResponses.push({status:response.status(),url:String(response.url()).slice(0,300)});});

  try{
    const response=await page.goto(`${PROD_ORIGIN}/?final_prod_gate=${Date.now()}`,{waitUntil:'networkidle',timeout:45_000});
    invariant(response?.ok(),'FINAL_PROD_LIVE_DOCUMENT_NOT_OK');
    invariant(new URL(page.url()).origin===PROD_ORIGIN,'FINAL_PROD_LIVE_REDIRECTED_ORIGIN');
    invariant((await page.locator('html').getAttribute('lang'))==='es-ES','FINAL_PROD_LIVE_LANG_INVALID');
    invariant(await page.getByRole('heading',{name:'Entrenamiento personal con criterio'}).isVisible(),'FINAL_PROD_LIVE_HEADING_MISSING');
    invariant(await page.locator('form[data-auth-form="login"]').isVisible(),'FINAL_PROD_LIVE_LOGIN_FORM_MISSING');
    const enter=page.getByRole('button',{name:'Entrar'});
    invariant(await enter.isVisible(),'FINAL_PROD_LIVE_ENTER_MISSING');
    invariant(await enter.isEnabled(),'FINAL_PROD_LIVE_ENTER_DISABLED');
    invariant(await page.locator('.m26-notice.is-warning').count()===0,'FINAL_PROD_LIVE_WARNING_VISIBLE');

    const runtime=await page.evaluate(()=>{
      const raw=globalThis.__IBERFIT_M26_RUNTIME__||{};
      return {
        enabled:raw.enabled===true,qaOnly:raw.qaOnly===true,
        projectRef:String(raw.projectRef||''),url:String(raw.url||''),
        keyPresent:Boolean(String(raw.publishableKey||raw.anonKey||'')),version:String(raw.version||'').slice(0,120),
      };
    });
    invariant(runtime.enabled===true,'FINAL_PROD_LIVE_RUNTIME_DISABLED');
    invariant(runtime.qaOnly===false,'FINAL_PROD_LIVE_RUNTIME_IS_QA');
    invariant(runtime.projectRef===PROD_REF,'FINAL_PROD_LIVE_PROJECT_REF_MISMATCH');
    invariant(new URL(runtime.url).origin===PROD_SUPABASE_ORIGIN,'FINAL_PROD_LIVE_SUPABASE_ORIGIN_MISMATCH');
    invariant(runtime.keyPresent===true,'FINAL_PROD_LIVE_PUBLIC_KEY_MISSING');

    const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight}));
    const screenshot=path.join(EVIDENCE_DIR,`FINAL_PROD_LIVE_${name.toUpperCase()}.png`);
    await page.screenshot({path:screenshot,fullPage:true});
    const diagnostic={schema:'iberfit.final-production.live-diagnostic.v1',generatedAt:new Date().toISOString(),name,width,height,pageUrl:page.url(),runtime,layout,blockedMutations,forbiddenOrigins,consoleErrors,pageErrors,requestFailures,badResponses,screenshot:path.relative(process.cwd(),screenshot).replaceAll(path.sep,'/')};
    const diagnosticPath=path.join(EVIDENCE_DIR,`FINAL_PROD_LIVE_${name.toUpperCase()}_DIAGNOSTIC.json`);
    await writeFile(diagnosticPath,`${JSON.stringify(diagnostic,null,2)}\n`,'utf8');

    invariant(layout.scrollWidth<=layout.clientWidth+1,'FINAL_PROD_LIVE_HORIZONTAL_OVERFLOW');
    invariant(blockedMutations.length===0,'FINAL_PROD_LIVE_UNEXPECTED_MUTATION_REQUEST');
    invariant(forbiddenOrigins.length===0,'FINAL_PROD_LIVE_FORBIDDEN_SUPABASE_ORIGIN');
    invariant(pageErrors.length===0,'FINAL_PROD_LIVE_PAGE_ERROR');
    invariant(consoleErrors.length===0,'FINAL_PROD_LIVE_CONSOLE_ERROR');
    invariant(requestFailures.length===0,'FINAL_PROD_LIVE_REQUEST_FAILURE');
    invariant(badResponses.length===0,'FINAL_PROD_LIVE_BAD_RESPONSE');
    return {name,width,height,runtime,layout,diagnostic:path.relative(process.cwd(),diagnosticPath).replaceAll(path.sep,'/'),screenshot:path.relative(process.cwd(),screenshot).replaceAll(path.sep,'/')};
  }finally{await context.close().catch(()=>{});}
}

invariant(canonicalSha(expectedSha)===expectedSha,'FINAL_PROD_EXPECTED_SHA_REQUIRED');
await mkdir(EVIDENCE_DIR,{recursive:true});
const version=sanitizeVersion(await fetchJson(`${PROD_ORIGIN}/version.json?final_prod_gate=${Date.now()}`));
invariant(version.sourceSha===expectedSha,'FINAL_PROD_LIVE_DEPLOY_SHA_MISMATCH');
invariant(version.sourceBranch===SOURCE_BRANCH,'FINAL_PROD_LIVE_VERSION_BRANCH_MISMATCH');
invariant(version.environment==='PRODUCTION','FINAL_PROD_LIVE_ENVIRONMENT_MISMATCH');
invariant(version.production===true,'FINAL_PROD_LIVE_PRODUCTION_FLAG_MISSING');
invariant(version.qaOnly===false,'FINAL_PROD_LIVE_VERSION_IS_QA');
invariant(version.projectRef===PROD_REF,'FINAL_PROD_LIVE_VERSION_PROJECT_MISMATCH');

const browser=await chromium.launch({headless:true});
let viewports;
try{
  viewports=[];
  viewports.push(await inspectViewport(browser,{name:'desktop',width:1440,height:1000}));
  viewports.push(await inspectViewport(browser,{name:'mobile',width:390,height:844}));
}finally{await browser.close().catch(()=>{});}

const evidence={schema:'iberfit.final-production.live-gate.v1',generatedAt:new Date().toISOString(),origin:PROD_ORIGIN,expectedSha,version,viewports,mutationsPerformed:false,ok:true};
const evidencePath=path.join(EVIDENCE_DIR,'FINAL_PRODUCTION_LIVE_GATE.json');
await writeFile(evidencePath,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:true,sourceSha:version.sourceSha,sourceBranch:version.sourceBranch,projectRef:version.projectRef,desktopOverflow:viewports[0].layout.scrollWidth>viewports[0].layout.clientWidth+1,mobileOverflow:viewports[1].layout.scrollWidth>viewports[1].layout.clientWidth+1,mutationsPerformed:false,evidence:path.relative(process.cwd(),evidencePath).replaceAll(path.sep,'/')},null,2));