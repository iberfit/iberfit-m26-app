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

    const runtimeDiagnostics=[];
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
    page.on('requestfailed',()=>{requestFailures+=1;});
    page.on('console',(message)=>{if(message.type()==='error')consoleErrors+=1;});
    page.on('pageerror',()=>{pageErrors+=1;});

    const response=await page.goto('/',{waitUntil:'networkidle'});
    expect(response?.ok()).toBeTruthy();

    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button',{name:'Entrar'}).click();

    const authenticatedRole=page.locator(`[data-m26-role="${account.role}"]`);
    const authDeadline=Date.now()+20_000;
    while(Date.now()<authDeadline){
      if(blockedExternalPaths.length){
        throw new Error(`RC64_2B_BLOCKED_EXTERNAL_DURING_AUTH:${blockedExternalPaths.join('|')}`);
      }
      if(pageErrors>0||consoleErrors>0){
        await new Promise((resolve)=>setTimeout(resolve,100));
        const diagnostics=runtimeDiagnostics.slice(0,8);
        const diagnosticSummary=diagnostics.length
          ?diagnostics.map((item)=>`${item.stage}/${item.code}/${item.status===null?'NA':item.status}`).join('|')
          :'none';
        const unclassified=Math.max(0,consoleErrors-diagnostics.length);
        throw new Error(
          `RC64_2B_RUNTIME_ERROR_DURING_AUTH:page=${pageErrors}:console=${consoleErrors}:diagnostics=${diagnosticSummary}:unclassified=${unclassified}`
        );
      }
      if(await authenticatedRole.isVisible().catch(()=>false))break;
      await page.waitForTimeout(100);
    }
    await expect(authenticatedRole).toBeVisible();
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
