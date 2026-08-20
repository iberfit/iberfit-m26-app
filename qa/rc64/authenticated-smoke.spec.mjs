import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const LOCAL_ORIGIN='http://127.0.0.1:4196';
const PROJECT_REF='pjhmrhejsoofmouedavw';
const SUPABASE_ORIGIN=`https://${PROJECT_REF}.supabase.co`;

const required=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY',
  'M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];

const READ_ONLY_RPCS=new Set([
  'iberfit_bootstrap_v26',
  'iberfit_authorized_application_roles_v13',
  'iberfit_appointment_change_requests_v13',
  'iberfit_application_context_v14',
  'iberfit_communication_bootstrap_v14',
  'm26_backend_bootstrap_v43',
  'm26_wearable_bootstrap_v44',
]);

function allowedExternalRequest(request){
  const url=new URL(request.url());
  const method=request.method().toUpperCase();

  if(url.origin!==SUPABASE_ORIGIN)return false;

  if(
    method==='POST' &&
    url.pathname==='/auth/v1/token' &&
    url.searchParams.get('grant_type')==='password'
  ){
    return true;
  }

  if(
    method==='GET' &&
    url.pathname==='/rest/v1/domain_command_registry_v26'
  ){
    return true;
  }

  const rpcPrefix='/rest/v1/rpc/';
  if(method==='POST'&&url.pathname.startsWith(rpcPrefix)){
    return READ_ONLY_RPCS.has(url.pathname.slice(rpcPrefix.length));
  }

  return false;
}


function sanitizeRuntimeTarget(rawUrl){
  if(!rawUrl)return Object.freeze({scope:'none',path:'none'});
  try{
    const url=new URL(String(rawUrl));
    let scope='external';
    if(url.origin===LOCAL_ORIGIN)scope='local';
    else if(url.origin===SUPABASE_ORIGIN)scope='supabase';
    if(scope==='external')return Object.freeze({scope,path:'external-origin'});
    const path=String(url.pathname||'/')
      .replace(/[^A-Za-z0-9_./:-]+/gu,'_')
      .slice(0,160)||'/';
    return Object.freeze({scope,path});
  }catch{
    return Object.freeze({scope:'invalid',path:'none'});
  }
}

function boundedInteger(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>=0&&number<=1_000_000?number:0;
}

function sanitizedPhase(phase){
  return phase==='auth'?'auth':'preauth';
}

function consoleErrorProjection(message,phase){
  const location=message.location?.()||{};
  const target=sanitizeRuntimeTarget(location.url||'');
  return Object.freeze({
    phase:sanitizedPhase(phase),
    source:target.scope,
    path:target.path,
    line:boundedInteger(location.lineNumber),
    column:boundedInteger(location.columnNumber),
  });
}

function httpErrorProjection(response,phase){
  const target=sanitizeRuntimeTarget(response.url());
  const rawMethod=String(response.request().method()||'').toUpperCase();
  const method=/^[A-Z]{1,12}$/u.test(rawMethod)?rawMethod:'UNCLASSIFIED';
  const status=Number(response.status());
  return Object.freeze({
    phase:sanitizedPhase(phase),
    method,
    source:target.scope,
    path:target.path,
    status:Number.isInteger(status)&&status>=100&&status<=599?status:0,
  });
}

function requestFailureProjection(request,phase){
  const target=sanitizeRuntimeTarget(request.url());
  const rawMethod=String(request.method()||'').toUpperCase();
  const method=/^[A-Z]{1,12}$/u.test(rawMethod)?rawMethod:'UNCLASSIFIED';
  const rawFailure=String(request.failure?.()?.errorText||'');
  const knownFailures=new Set([
    'net::ERR_ABORTED',
    'net::ERR_FAILED',
    'net::ERR_BLOCKED_BY_CLIENT',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_CONNECTION_CLOSED',
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_TIMED_OUT',
  ]);
  const failure=knownFailures.has(rawFailure)?rawFailure:'NET_UNCLASSIFIED';
  return Object.freeze({
    phase:sanitizedPhase(phase),
    method,
    source:target.scope,
    path:target.path,
    failure,
  });
}

function recoverablePreauthStylesheetAbort(item,fullStylePaths){
  return (
    item?.phase==='preauth'&&
    item?.method==='GET'&&
    item?.source==='local'&&
    item?.failure==='net::ERR_ABORTED'&&
    fullStylePaths instanceof Set&&
    fullStylePaths.has(item?.path)
  );
}

function pageErrorProjection(error,phase){
  const rawName=String(error?.name||'');
  const name=/^[A-Za-z][A-Za-z0-9]{0,39}$/u.test(rawName)?rawName:'Error';
  return Object.freeze({phase:sanitizedPhase(phase),name});
}

function pendingRequestProjection(request,phase){
  const target=sanitizeRuntimeTarget(request.url());
  const rawMethod=String(request.method()||'').toUpperCase();
  const method=/^[A-Z]{1,12}$/u.test(rawMethod)?rawMethod:'UNCLASSIFIED';
  return Object.freeze({
    phase:sanitizedPhase(phase),
    method,
    source:target.scope,
    path:target.path,
  });
}

function safeRemoteCode(value){
  const code=String(value||'').trim().toUpperCase();
  return /^(?:PGRST[0-9]{3}|[0-9]{5}|[A-Z][A-Z0-9_]{1,39})$/u.test(code)
    ?code
    :'NONE';
}

function jwtShape(value){
  const token=String(value||'');
  const parts=token.split('.');
  return parts.length===3&&parts.every((part)=>/^[A-Za-z0-9_-]{1,6000}$/u.test(part));
}

function corsValueKind(value){
  const normalized=String(value||'').trim();
  if(!normalized)return 'none';
  if(normalized==='*')return 'wildcard';
  if(normalized===LOCAL_ORIGIN)return 'local-origin';
  return 'other';
}

async function readOnlyRegistryControl({token,publishableKey}){
  const select='command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,enabled';
  const url=`${SUPABASE_ORIGIN}/rest/v1/domain_command_registry_v26?select=${encodeURIComponent(select)}&order=command_type.asc&limit=100`;
  const commonHeaders={
    apikey:publishableKey,
    authorization:`Bearer ${token}`,
    'x-client-info':'iberfit-m26-web/26.0.0-rc64-2b-authenticated-readonly',
  };

  const safeFetch=async(headers)=>{
    try{
      const response=await fetch(url,{
        method:'GET',
        headers,
        cache:'no-store',
        redirect:'error',
      });
      let remoteCode='NONE';
      if(response.status>=400){
        const payload=await response.json().catch(()=>null);
        remoteCode=safeRemoteCode(payload?.code);
      }
      return Object.freeze({
        status:Number(response.status)||0,
        code:remoteCode,
        allowOrigin:corsValueKind(response.headers.get('access-control-allow-origin')),
      });
    }catch{
      return Object.freeze({status:0,code:'FETCH_FAILED',allowOrigin:'none'});
    }
  };

  const direct=await safeFetch(commonHeaders);
  const withOrigin=await safeFetch({...commonHeaders,origin:LOCAL_ORIGIN});

  let preflight;
  try{
    const response=await fetch(url,{
      method:'OPTIONS',
      headers:{
        origin:LOCAL_ORIGIN,
        'access-control-request-method':'GET',
        'access-control-request-headers':'apikey,authorization,x-client-info',
      },
      cache:'no-store',
      redirect:'error',
    });
    const allowHeaders=String(response.headers.get('access-control-allow-headers')||'')
      .toLowerCase()
      .split(',')
      .map((item)=>item.trim())
      .filter(Boolean);
    preflight=Object.freeze({
      status:Number(response.status)||0,
      allowOrigin:corsValueKind(response.headers.get('access-control-allow-origin')),
      allowsApikey:allowHeaders.includes('apikey')||allowHeaders.includes('*'),
      allowsAuthorization:allowHeaders.includes('authorization')||allowHeaders.includes('*'),
      allowsClientInfo:allowHeaders.includes('x-client-info')||allowHeaders.includes('*'),
    });
  }catch{
    preflight=Object.freeze({
      status:0,
      allowOrigin:'none',
      allowsApikey:false,
      allowsAuthorization:false,
      allowsClientInfo:false,
    });
  }

  return Object.freeze({direct,withOrigin,preflight});
}

test('RC64.2B current-source authenticated smoke is real QA and mutation-blocked',async({browser})=>{
  const missing=required.filter((name)=>!process.env[name]);
  expect(missing,'Missing authorized QA environment').toEqual([]);
  expect(new URL(process.env.M26_SUPABASE_URL).origin).toBe(SUPABASE_ORIGIN);
  expect(String(process.env.M26_SUPABASE_PUBLISHABLE_KEY)).not.toMatch(/service[_-]?role/iu);

  const accounts=[
    {name:'coach',role:'coach',email:process.env.M26_QA_COACH_EMAIL,password:process.env.M26_QA_COACH_PASSWORD},
    {name:'client_a',role:'client',email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD},
  ];

  const evidenceRoles=[];

  const idbProbeModes=[
    'raw-open',
    'raw-cursor',
    'module-custom',
    'canonical-single',
    'canonical-concurrent',
  ];

  async function closeProbeContext(context){
    await Promise.race([
      context.close().catch(()=>{}),
      new Promise((resolve)=>setTimeout(resolve,1_000)),
    ]);
  }

  async function runIdbEngineProbe(mode){
    const probeContext=await browser.newContext({
      baseURL:LOCAL_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
    });
    const probePage=await probeContext.newPage();
    try{
      await probePage.goto('/',{waitUntil:'domcontentloaded',timeout:10_000});
      const operation=probePage.evaluate(async(probeMode)=>{
        const rawOpen=async({dbName,withCursor=false})=>{
          const db=await new Promise((resolve,reject)=>{
            const request=indexedDB.open(dbName,1);
            request.onupgradeneeded=()=>{
              const opened=request.result;
              if(!opened.objectStoreNames.contains('probe'))opened.createObjectStore('probe');
            };
            request.onsuccess=()=>resolve(request.result);
            request.onerror=()=>reject(request.error||new Error('RAW_OPEN_FAILED'));
            request.onblocked=()=>reject(new Error('RAW_OPEN_BLOCKED'));
          });
          try{
            if(withCursor){
              await new Promise((resolve,reject)=>{
                const tx=db.transaction('probe','readonly');
                const request=tx.objectStore('probe').openKeyCursor();
                request.onerror=()=>reject(request.error||new Error('RAW_CURSOR_FAILED'));
                request.onsuccess=()=>{
                  const cursor=request.result;
                  if(!cursor){resolve();return;}
                  cursor.continue();
                };
              });
            }
          }finally{
            db.close();
          }
          return true;
        };

        if(probeMode==='raw-open'){
          return rawOpen({dbName:'iberfit-rc64-idb-probe-open'});
        }
        if(probeMode==='raw-cursor'){
          return rawOpen({dbName:'iberfit-rc64-idb-probe-cursor',withCursor:true});
        }

        const module=await import('/src/m26/platform/key-value-store.js');
        const create=module.createIndexedDbKeyValueStore;

        if(probeMode==='module-custom'){
          const store=create({
            dbName:'iberfit-rc64-idb-probe-custom',
            storeName:'probe',
          });
          await store.keys('');
          return true;
        }

        if(probeMode==='canonical-single'){
          const store=create({storeName:'key_value'});
          await store.keys('m26:operation:');
          return true;
        }

        if(probeMode==='canonical-concurrent'){
          const core=create({storeName:'key_value'});
          const wearable=create({storeName:'wearable_sync_v44'});
          await Promise.all([
            core.keys('m26:operation:'),
            wearable.keys('m26:wearable-sync:v44:'),
          ]);
          return true;
        }

        throw new Error('UNKNOWN_PROBE_MODE');
      },mode)
        .then(()=>({kind:'pass'}))
        .catch((error)=>({
          kind:'page-error',
          code:/^[A-Z0-9_:-]{2,80}$/u.test(String(error?.message||''))
            ?String(error.message)
            :'PROBE_PAGE_ERROR',
        }));

      const outcome=await Promise.race([
        operation,
        new Promise((resolve)=>setTimeout(
          ()=>resolve({kind:'node-timeout'}),
          3_000,
        )),
      ]);

      console.log(`RC64_2B_IDB_ENGINE_PROBE:${mode}:${outcome.kind}`);
      return outcome;
    }finally{
      await closeProbeContext(probeContext);
    }
  }

  for(const mode of idbProbeModes){
    const outcome=await runIdbEngineProbe(mode);
    if(outcome.kind!=='pass'){
      throw new Error(
        `RC64_2B_IDB_ENGINE_PROBE_FAILED:${mode}:${outcome.kind}`
      );
    }
  }
  console.log('RC64_2B_IDB_ENGINE_PROBE=PASS');

  for(const account of accounts){
    expect(String(account.email||'').toLowerCase()).toMatch(/^iberfit\.cl\+qa\./u);
    expect(String(account.password||'').length).toBeGreaterThanOrEqual(8);

    const context=await browser.newContext({
      baseURL:LOCAL_ORIGIN,
      locale:'es-ES',
      timezoneId:'America/Santiago',
      serviceWorkers:'block',
    });

    let blockedExternal=0;
    const blockedExternalPaths=[];
    let requestFailures=0;
    let consoleErrors=0;
    let pageErrors=0;
    let runtimePhase='preauth';
    const consoleErrorMeta=[];
    const httpErrorMeta=[];
    const requestFailureMeta=[];
    const pageErrorMeta=[];
    const pendingRequestMeta=new Map();
    const authResponseMeta=[];
    const responseDiagnosticTasks=new Set();
    let loginAccessToken='';
    let registryAuthorization='';
    let registryApikeyMatchesExpected=false;
    let registryRemoteCode='NONE';
    let registryWwwAuthenticate=false;
    let registryControl=null;

    const runtimeDiagnostics=[];
    const qaStages=[];
    let qaStageEpoch=0;
    await context.exposeBinding('__rc64RecordDiagnostic',(_source,detail)=>{
      if(runtimeDiagnostics.length>=8)return;
      const candidate=detail&&typeof detail==='object'?detail:{};
      const rawStage=String(candidate.stage||'');
      const rawCode=String(candidate.code||'');
      const stage=/^[a-z0-9_-]{1,60}$/iu.test(rawStage)?rawStage:'unclassified';
      const code=/^M26_[A-Z0-9_:-]{2,120}$/u.test(rawCode)?rawCode:'M26_UNCLASSIFIED_DIAGNOSTIC';
      const status=Number.isInteger(candidate.status)&&candidate.status>=0&&candidate.status<=599?candidate.status:null;
      runtimeDiagnostics.push(Object.freeze({stage,code,status}));
    });

    await context.exposeBinding('__rc64RecordStage',(_source,rawStage)=>{
      if(qaStages.length>=96)return;
      const stage=String(rawStage||'');
      if(!/^rc64-[a-z0-9-]{1,64}$/u.test(stage))return;
      const elapsedMs=qaStageEpoch
        ?Math.max(0,Math.min(Date.now()-qaStageEpoch,60_000))
        :0;
      qaStages.push(Object.freeze({stage,elapsedMs}));
    });

    await context.addInitScript(()=>{
      globalThis.addEventListener('m26:diagnostic',(event)=>{
        const detail=event?.detail&&typeof event.detail==='object'?event.detail:{};
        const rawStage=String(detail.stage||'');
        const rawCode=String(detail.code||'');
        const stage=/^[a-z0-9_-]{1,60}$/iu.test(rawStage)?rawStage:'unclassified';
        const code=/^M26_[A-Z0-9_:-]{2,120}$/u.test(rawCode)?rawCode:'M26_UNCLASSIFIED_DIAGNOSTIC';
        const status=Number.isInteger(detail.status)&&detail.status>=0&&detail.status<=599?detail.status:null;
        const forward=globalThis.__rc64RecordDiagnostic;
        if(typeof forward!=='function')return;
        void forward({stage,code,status}).catch(()=>{});
      });
      globalThis.__IBERFIT_M26_QA_STAGE__=(stage)=>{
        const forward=globalThis.__rc64RecordStage;
        if(typeof forward!=='function')return;
        void forward(String(stage||'')).catch(()=>{});
      };
    });

    await context.route('**/*',async(route)=>{
      const request=route.request();
      const url=new URL(request.url());

      if(url.origin===LOCAL_ORIGIN){
        await route.continue();
        return;
      }

      if(allowedExternalRequest(request)){
        await route.continue();
        return;
      }

      blockedExternal+=1;
      if(blockedExternalPaths.length<8){
        const method=request.method().toUpperCase();
        blockedExternalPaths.push(
          url.origin===SUPABASE_ORIGIN
            ?`${method} ${url.pathname}`
            :`${method} external-origin`,
        );
      }
      await route.abort('blockedbyclient');
    });

    const page=await context.newPage();
    page.on('request',(request)=>{
      if(pendingRequestMeta.size<16){
        pendingRequestMeta.set(request,pendingRequestProjection(request,runtimePhase));
      }
      const target=sanitizeRuntimeTarget(request.url());
      if(
        runtimePhase==='auth'&&
        target.scope==='supabase'&&
        target.path==='/rest/v1/domain_command_registry_v26'&&
        request.method().toUpperCase()==='GET'
      ){
        const task=request.allHeaders()
          .then((headers)=>{
            registryAuthorization=String(headers.authorization||'');
            registryApikeyMatchesExpected=
              String(headers.apikey||'')===String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'');
          })
          .catch(()=>{})
          .finally(()=>responseDiagnosticTasks.delete(task));
        responseDiagnosticTasks.add(task);
      }
    });
    page.on('requestfinished',(request)=>{
      pendingRequestMeta.delete(request);
    });
    page.on('requestfailed',(request)=>{
      pendingRequestMeta.delete(request);
      requestFailures+=1;
      if(requestFailureMeta.length<8){
        requestFailureMeta.push(requestFailureProjection(request,runtimePhase));
      }
    });
    page.on('response',(response)=>{
      const projection=httpErrorProjection(response,runtimePhase);
      if(
        runtimePhase==='auth'&&
        projection.source==='supabase'&&
        authResponseMeta.length<16
      ){
        authResponseMeta.push(projection);
      }
      if(projection.status>=400&&httpErrorMeta.length<8){
        httpErrorMeta.push(projection);
      }

      if(
        runtimePhase==='auth'&&
        projection.source==='supabase'&&
        projection.path==='/auth/v1/token'&&
        projection.status===200
      ){
        const task=response.json()
          .then((payload)=>{
            const candidate=String(payload?.access_token||'');
            if(candidate&&candidate.length<=16_384&&!/[\u0000-\u001f\u007f]/u.test(candidate)){
              loginAccessToken=candidate;
            }
          })
          .catch(()=>{})
          .finally(()=>responseDiagnosticTasks.delete(task));
        responseDiagnosticTasks.add(task);
      }

      if(
        runtimePhase==='auth'&&
        projection.source==='supabase'&&
        projection.path==='/rest/v1/domain_command_registry_v26'&&
        projection.status>=400
      ){
        const task=Promise.all([
          response.json().catch(()=>null),
          response.allHeaders().catch(()=>({})),
        ])
          .then(([payload,headers])=>{
            registryRemoteCode=safeRemoteCode(payload?.code);
            registryWwwAuthenticate=Boolean(
              String(headers['www-authenticate']||'').trim()
            );
          })
          .catch(()=>{})
          .finally(()=>responseDiagnosticTasks.delete(task));
        responseDiagnosticTasks.add(task);
      }
    });
    page.on('console',(message)=>{
      if(message.type()!=='error')return;
      consoleErrors+=1;
      if(consoleErrorMeta.length<8){
        consoleErrorMeta.push(consoleErrorProjection(message,runtimePhase));
      }
    });
    page.on('pageerror',(error)=>{
      pageErrors+=1;
      if(pageErrorMeta.length<8){
        pageErrorMeta.push(pageErrorProjection(error,runtimePhase));
      }
    });

    console.log(`RC64_2B_ACCOUNT_BEGIN:${account.name}`);
    const response=await page.goto('/',{waitUntil:'networkidle'});
    expect(response?.ok()).toBeTruthy();

    const preauthStyleState=await page.evaluate(()=>{
      const links=[...document.querySelectorAll('link[data-iberfit-full-style]')];
      const items=links.map((link)=>{
        const url=new URL(link.href,globalThis.location.href);
        let readable=false;
        try{
          if(link.sheet){
            void link.sheet.cssRules.length;
            readable=true;
          }
        }catch{
          readable=false;
        }
        return Object.freeze({
          path:url.origin===globalThis.location.origin?url.pathname:'external',
          media:String(link.media||''),
          readable,
        });
      });
      return Object.freeze({
        count:items.length,
        ready:
          items.length>0&&
          items.every((item)=>
            item.path.startsWith('/')&&
            item.media==='all'&&
            item.readable===true
          ),
        paths:items.map((item)=>item.path),
      });
    });

    if(
      preauthStyleState.count<=0||
      preauthStyleState.ready!==true
    ){
      throw new Error('RC64_2B_PREAUTH_STYLE_NOT_READY');
    }

    if(
      blockedExternalPaths.length>0||
      consoleErrors>0||
      pageErrors>0||
      runtimeDiagnostics.length>0||
      httpErrorMeta.length>0
    ){
      throw new Error('RC64_2B_PREAUTH_RUNTIME_FAILURE');
    }

    if(requestFailures>0){
      const fullStylePaths=new Set(preauthStyleState.paths);
      const capturedAll=requestFailures===requestFailureMeta.length;
      const recoverable=
        capturedAll&&
        requestFailureMeta.every((item)=>
          recoverablePreauthStylesheetAbort(item,fullStylePaths)
        );

      if(!recoverable){
        throw new Error('RC64_2B_PREAUTH_REQUEST_FAILURE');
      }

      console.log(
        `RC64_2B_PREAUTH_STYLESHEET_ABORT_RECOVERED:${account.name}:count=${requestFailures}`
      );
      requestFailures=0;
      requestFailureMeta.length=0;
    }

    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    qaStages.length=0;
    qaStageEpoch=Date.now();
    runtimePhase='auth';
    await page.getByRole('button',{name:'Entrar'}).click();

    const authenticatedRole=page.locator(`[data-m26-role="${account.role}"]`);
    const runtimeFailureMessage=(code)=>{
      const diagnostics=runtimeDiagnostics.slice(0,8);
      const diagnosticSummary=diagnostics.length
        ?diagnostics.map((item)=>`${item.stage}/${item.code}/${item.status===null?'NA':item.status}`).join('|')
        :'none';
      const consoleSummary=consoleErrorMeta.length
        ?consoleErrorMeta.map((item)=>`${item.phase}/${item.source}/${item.path}/${item.line}/${item.column}`).join('|')
        :'none';
      const httpSummary=httpErrorMeta.length
        ?httpErrorMeta.map((item)=>`${item.phase}/${item.method}/${item.source}/${item.path}/${item.status}`).join('|')
        :'none';
      const requestFailureSummary=requestFailureMeta.length
        ?requestFailureMeta.map((item)=>`${item.phase}/${item.method}/${item.source}/${item.path}/${item.failure}`).join('|')
        :'none';
      const pageSummary=pageErrorMeta.length
        ?pageErrorMeta.map((item)=>`${item.phase}/${item.name}`).join('|')
        :'none';
      const responseSummary=authResponseMeta.slice(-8);
      const responses=responseSummary.length
        ?responseSummary.map((item)=>`${item.phase}/${item.method}/${item.source}/${item.path}/${item.status}`).join('|')
        :'none';
      const pendingSummary=[...pendingRequestMeta.values()].slice(0,8);
      const pending=pendingSummary.length
        ?pendingSummary.map((item)=>`${item.phase}/${item.method}/${item.source}/${item.path}`).join('|')
        :'none';
      const bearerPrefix='Bearer ';
      const bearerToken=registryAuthorization.startsWith(bearerPrefix)
        ?registryAuthorization.slice(bearerPrefix.length)
        :'';
      const browserRegistry=[
        `authHeader=${registryAuthorization?'present':'missing'}`,
        `bearer=${bearerToken?'yes':'no'}`,
        `jwtShape=${jwtShape(bearerToken)?'yes':'no'}`,
        `matchesLogin=${loginAccessToken&&bearerToken===loginAccessToken?'yes':'no'}`,
        `apikeyMatch=${registryApikeyMatchesExpected?'yes':'no'}`,
        `remoteCode=${registryRemoteCode}`,
        `wwwAuth=${registryWwwAuthenticate?'yes':'no'}`,
      ].join('/');
      const control=registryControl
        ?[
          `direct=${registryControl.direct.status}/${registryControl.direct.code}/${registryControl.direct.allowOrigin}`,
          `origin=${registryControl.withOrigin.status}/${registryControl.withOrigin.code}/${registryControl.withOrigin.allowOrigin}`,
          `preflight=${registryControl.preflight.status}/${registryControl.preflight.allowOrigin}/${registryControl.preflight.allowsApikey?'apikey':'no-apikey'}/${registryControl.preflight.allowsAuthorization?'authorization':'no-authorization'}/${registryControl.preflight.allowsClientInfo?'client-info':'no-client-info'}`,
        ].join('|')
        :'none';
      const stageSummary=qaStages.length
        ?qaStages.map((item)=>`${item.stage}@${item.elapsedMs}`).join('|')
        :'none';
      const unclassified=Math.max(0,consoleErrors-consoleErrorMeta.length);
      return `${code}:account=${account.name}:page=${pageErrors}:console=${consoleErrors}:diagnostics=${diagnosticSummary}:consoleMeta=${consoleSummary}:httpErrors=${httpSummary}:requestFailures=${requestFailureSummary}:pageMeta=${pageSummary}:responses=${responses}:pending=${pending}:browserRegistry=${browserRegistry}:nodeControl=${control}:stages=${stageSummary}:unclassified=${unclassified}`;
    };

    const runtimeFailureState=()=>{
      if(blockedExternalPaths.length){
        return `RC64_2B_BLOCKED_EXTERNAL_DURING_AUTH:account=${account.name}:${blockedExternalPaths.join('|')}`;
      }
      if(
        pageErrors>0||
        consoleErrors>0||
        runtimeDiagnostics.length>0||
        httpErrorMeta.length>0||
        requestFailures>0
      ){
        return runtimeFailureMessage('RC64_2B_RUNTIME_ERROR_DURING_AUTH');
      }
      return null;
    };

    const authStartedAt=Date.now();
    let runtimeWatchTimer=null;
    let nativeDeadlineTimer=null;

    const roleOutcome=authenticatedRole
      .waitFor({state:'visible',timeout:20_000})
      .then(()=>Object.freeze({kind:'authenticated'}))
      .catch(()=>Object.freeze({kind:'not-visible'}));

    const runtimeOutcome=new Promise((resolve)=>{
      runtimeWatchTimer=setInterval(()=>{
        const failure=runtimeFailureState();
        if(!failure)return;
        clearInterval(runtimeWatchTimer);
        runtimeWatchTimer=null;
        resolve(Object.freeze({kind:'runtime-failure',failure}));
      },50);
    });

    const deadlineOutcome=new Promise((resolve)=>{
      nativeDeadlineTimer=setTimeout(
        ()=>resolve(Object.freeze({kind:'native-timeout'})),
        20_500,
      );
    });

    const outcome=await Promise.race([
      roleOutcome,
      runtimeOutcome,
      deadlineOutcome,
    ]);

    if(runtimeWatchTimer!==null){
      clearInterval(runtimeWatchTimer);
      runtimeWatchTimer=null;
    }
    if(nativeDeadlineTimer!==null){
      clearTimeout(nativeDeadlineTimer);
      nativeDeadlineTimer=null;
    }

    if(outcome.kind==='runtime-failure'){
      await new Promise((resolve)=>setTimeout(resolve,150));
      await Promise.allSettled([...responseDiagnosticTasks]);
      if(
        loginAccessToken&&
        registryAuthorization
      ){
        registryControl=await readOnlyRegistryControl({
          token:loginAccessToken,
          publishableKey:String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||''),
        });
      }
      throw new Error(runtimeFailureState()||outcome.failure);
    }

    if(outcome.kind!=='authenticated'){
      await new Promise((resolve)=>setTimeout(resolve,150));
      await Promise.allSettled([...responseDiagnosticTasks]);
      const failure=runtimeFailureState();
      if(failure)throw new Error(failure);
      throw new Error(runtimeFailureMessage('RC64_2B_AUTH_TIMEOUT'));
    }

    const authElapsedMs=Math.max(0,Math.min(Date.now()-authStartedAt,60_000));
    console.log(`RC64_2B_ACCOUNT_AUTHENTICATED:${account.name}:elapsedMs=${authElapsedMs}`);
    await expect(page.getByRole('button',{name:'Cerrar sesión'})).toBeVisible();

    const quality=await page.evaluate(async()=>{
      const collector=await globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__;
      return collector?.snapshot?.()||null;
    });

    expect(quality?.schemaVersion).toBe('iberfit.quality-runtime-observability.v1');
    expect(quality?.storage).toBe('memory-only');
    expect(quality?.transport).toBe('none');
    expect(quality?.identityIncluded).toBe(false);
    expect(quality?.healthDataIncluded).toBe(false);

    expect(blockedExternal).toBe(0);
    expect(requestFailures).toBe(0);
    expect(consoleErrors).toBe(0);
    expect(pageErrors).toBe(0);

    evidenceRoles.push(Object.freeze({
      role:account.role,
      authenticated:true,
      blockedExternal,
      requestFailures,
      consoleErrors,
      pageErrors,
      qualityObservability:'memory-only-no-transport',
    }));

    console.log(`RC64_2B_ACCOUNT_PASS:${account.name}`);
    await context.close();
  }

  const evidence=Object.freeze({
    schema:'iberfit.rc64.2b.authenticated-readonly-browser-evidence.v1',
    source:'current-source-qa-surface',
    projectRef:PROJECT_REF,
    mode:'authenticated-readonly-browser',
    mutationsPerformed:false,
    identityPersisted:false,
    healthDataPersisted:false,
    credentialsPersisted:false,
    roles:evidenceRoles,
  });

  await mkdir('recovery',{recursive:true});
  await writeFile(
    'recovery/RC64_2B_AUTHENTICATED_SMOKE.json',
    `${JSON.stringify(evidence,null,2)}\n`,
    'utf8',
  );
});
