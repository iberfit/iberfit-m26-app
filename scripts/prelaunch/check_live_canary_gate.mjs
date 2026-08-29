import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN=`https://${QA_REF}.supabase.co`;
const BASE_BRANCH='canary/rc74-4';
const EVIDENCE_DIR=path.resolve('recovery','prelaunch-live');
const expectedSha=String(
  process.env.M26_EXPECTED_CANARY_SHA ||
  (process.env.GITHUB_REF_NAME===BASE_BRANCH ? process.env.GITHUB_SHA : '') ||
  ''
).trim().toLowerCase();

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
    qaOnly:raw?.qaOnly===true,
    projectRef:String(raw?.projectRef||'').trim(),
    version:String(raw?.version||'').trim().slice(0,120),
  });
}

async function fetchJson(url){
  const response=await fetch(url,{
    method:'GET',
    cache:'no-store',
    redirect:'error',
    headers:{'cache-control':'no-cache','pragma':'no-cache'},
  });
  invariant(response.ok,`PRELAUNCH_LIVE_HTTP_${response.status}`);
  return response.json();
}

async function inspectViewport(browser,{name,width,height}){
  const context=await browser.newContext({
    viewport:{width,height},
    locale:'es-ES',
    timezoneId:'America/Santiago',
    serviceWorkers:'block',
  });
  const page=await context.newPage();
  const blockedMutations=[];
  const forbiddenOrigins=[];
  const consoleErrors=[];
  const pageErrors=[];

  await page.route('**/*',async(route)=>{
    const request=route.request();
    let url;
    try{url=new URL(request.url());}
    catch{return route.abort();}
    const method=request.method().toUpperCase();
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      blockedMutations.push({method,origin:url.origin,path:url.pathname.slice(0,180)});
      return route.abort();
    }
    if(url.hostname.endsWith('.supabase.co')&&url.origin!==QA_ORIGIN){
      forbiddenOrigins.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });

  page.on('console',(message)=>{
    if(message.type()==='error'){
      consoleErrors.push(String(message.text()||'').slice(0,300));
    }
  });
  page.on('pageerror',(error)=>{
    pageErrors.push(String(error?.name||'Error').slice(0,80));
  });

  try{
    const response=await page.goto(`${CANARY_ORIGIN}/?prelaunch=${Date.now()}`,{
      waitUntil:'networkidle',
      timeout:45_000,
    });
    invariant(response?.ok(),'PRELAUNCH_LIVE_DOCUMENT_NOT_OK');
    invariant(new URL(page.url()).origin===CANARY_ORIGIN,'PRELAUNCH_LIVE_REDIRECTED_ORIGIN');

    const lang=await page.locator('html').getAttribute('lang');
    invariant(lang==='es-ES','PRELAUNCH_LIVE_LANG_INVALID');

    const heading=page.getByRole('heading',{name:'Entrenamiento personal con criterio'});
    invariant(await heading.isVisible(),'PRELAUNCH_LIVE_HEADING_MISSING');

    const login=page.locator('form[data-auth-form="login"]');
    invariant(await login.isVisible(),'PRELAUNCH_LIVE_LOGIN_FORM_MISSING');

    const enter=page.getByRole('button',{name:'Entrar'});
    invariant(await enter.isVisible(),'PRELAUNCH_LIVE_ENTER_MISSING');
    invariant(await enter.isEnabled(),'PRELAUNCH_LIVE_ENTER_DISABLED');

    invariant(await page.locator('.m26-notice.is-warning').count()===0,'PRELAUNCH_LIVE_WARNING_VISIBLE');

    const runtime=await page.evaluate(()=>{
      const raw=globalThis.__IBERFIT_M26_RUNTIME__||{};
      return {
        enabled:raw.enabled===true,
        qaOnly:raw.qaOnly===true,
        projectRef:String(raw.projectRef||''),
        url:String(raw.url||''),
        keyPresent:Boolean(String(raw.publishableKey||raw.anonKey||'')),
        version:String(raw.version||'').slice(0,120),
      };
    });
    invariant(runtime.enabled===true,'PRELAUNCH_LIVE_RUNTIME_DISABLED');
    invariant(runtime.qaOnly===true,'PRELAUNCH_LIVE_RUNTIME_NOT_QA');
    invariant(runtime.projectRef===QA_REF,'PRELAUNCH_LIVE_PROJECT_REF_MISMATCH');
    invariant(new URL(runtime.url).origin===QA_ORIGIN,'PRELAUNCH_LIVE_QA_ORIGIN_MISMATCH');
    invariant(runtime.keyPresent===true,'PRELAUNCH_LIVE_PUBLIC_KEY_MISSING');

    const layout=await page.evaluate(()=>({
      scrollWidth:document.documentElement.scrollWidth,
      clientWidth:document.documentElement.clientWidth,
      scrollHeight:document.documentElement.scrollHeight,
      clientHeight:document.documentElement.clientHeight,
    }));
    invariant(layout.scrollWidth<=layout.clientWidth+1,'PRELAUNCH_LIVE_HORIZONTAL_OVERFLOW');

    invariant(blockedMutations.length===0,'PRELAUNCH_LIVE_UNEXPECTED_MUTATION_REQUEST');
    invariant(forbiddenOrigins.length===0,'PRELAUNCH_LIVE_FORBIDDEN_SUPABASE_ORIGIN');
    invariant(pageErrors.length===0,'PRELAUNCH_LIVE_PAGE_ERROR');
    invariant(consoleErrors.length===0,'PRELAUNCH_LIVE_CONSOLE_ERROR');

    const screenshot=path.join(EVIDENCE_DIR,`PRELAUNCH_LIVE_CANARY_${name.toUpperCase()}.png`);
    await page.screenshot({path:screenshot,fullPage:true});

    return Object.freeze({
      name,width,height,
      runtime,
      layout,
      blockedMutationRequests:blockedMutations.length,
      forbiddenSupabaseOrigins:forbiddenOrigins.length,
      consoleErrors:consoleErrors.length,
      pageErrors:pageErrors.length,
      screenshot:path.relative(process.cwd(),screenshot).replaceAll(path.sep,'/'),
    });
  }finally{
    await context.close().catch(()=>{});
  }
}

await mkdir(EVIDENCE_DIR,{recursive:true});

const versionRaw=await fetchJson(`${CANARY_ORIGIN}/version.json?prelaunch=${Date.now()}`);
const version=sanitizeVersion(versionRaw);
invariant(version.sourceSha,'PRELAUNCH_LIVE_VERSION_SHA_INVALID');
invariant(version.sourceBranch===BASE_BRANCH,'PRELAUNCH_LIVE_VERSION_BRANCH_MISMATCH');
invariant(version.qaOnly===true,'PRELAUNCH_LIVE_VERSION_NOT_QA');
invariant(version.projectRef===QA_REF,'PRELAUNCH_LIVE_VERSION_PROJECT_MISMATCH');
if(expectedSha){
  invariant(canonicalSha(expectedSha)===expectedSha,'PRELAUNCH_EXPECTED_SHA_INVALID');
  invariant(version.sourceSha===expectedSha,'PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH');
}

const browser=await chromium.launch({headless:true});
let viewports;
try{
  viewports=[];
  viewports.push(await inspectViewport(browser,{name:'desktop',width:1440,height:1000}));
  viewports.push(await inspectViewport(browser,{name:'mobile',width:390,height:844}));
}finally{
  await browser.close().catch(()=>{});
}

const evidence=Object.freeze({
  schema:'iberfit.prelaunch.live-canary-gate.v1',
  generatedAt:new Date().toISOString(),
  origin:CANARY_ORIGIN,
  expectedSha:expectedSha||null,
  version,
  viewports,
  mutationsPerformed:false,
  productionTouched:false,
  ok:true,
});

const evidencePath=path.join(EVIDENCE_DIR,'PRELAUNCH_LIVE_CANARY_GATE.json');
await writeFile(evidencePath,`${JSON.stringify(evidence,null,2)}\n`,'utf8');

console.log(JSON.stringify({
  ok:true,
  sourceSha:version.sourceSha,
  sourceBranch:version.sourceBranch,
  qaOnly:version.qaOnly,
  projectRef:version.projectRef,
  desktopOverflow:viewports[0].layout.scrollWidth>viewports[0].layout.clientWidth+1,
  mobileOverflow:viewports[1].layout.scrollWidth>viewports[1].layout.clientWidth+1,
  mutationsPerformed:false,
  productionTouched:false,
  evidence:path.relative(process.cwd(),evidencePath).replaceAll(path.sep,'/'),
},null,2));
