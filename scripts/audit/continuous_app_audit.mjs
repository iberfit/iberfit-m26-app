import fs from 'node:fs/promises';
import path from 'node:path';

import {
  M26_AREAS,
  areaAllowedForRole,
  navigationForRole,
} from '../../src/m26/shell/navigation.js';
import { resolveM26Route } from '../../src/m26/shell/route-guard.js';
import { createProductionState } from '../../src/m26/production-state.js';
import { createShellViewModel } from '../../src/m26/shell/shell-view-model.js';
import { createRouteViewModel } from '../../src/m26/modules/route-view-model.js';
import { renderRouteView } from '../../src/m26/modules/route-render.js';

const AUDIT_VERSION='1.0.0';
const ROLES=Object.freeze(['client','coach','admin']);
const CLIENT_ID='continuous-audit-client';
const NOW=new Date();
const APP_URL=String(process.env.M26_AUDIT_APP_URL||'https://app.iberfit.cl').replace(/\/+$/,'');
const PROD_PROJECT_REF='pjhmrhejsoofmouedavw';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const OUTPUT_DIR=path.resolve(process.cwd(),'recovery','continuous-audit');
const OUTPUT_JSON=path.join(OUTPUT_DIR,'latest.json');
const OUTPUT_MD=path.join(OUTPUT_DIR,'latest.md');

const findings=[];
const strengths=[];
const coverage={roles:{},live:{}};

function addFinding(severity,code,message,context={}){
  findings.push(Object.freeze({severity,code,message,...context}));
}

function addStrength(code,message,context={}){
  strengths.push(Object.freeze({code,message,...context}));
}

function unique(values){return [...new Set(values)];}

function navigationKeys(role){
  const nav=navigationForRole(role);
  return {
    primary:nav.primary.map((item)=>item.key),
    context:nav.context.map((item)=>item.key),
    tools:nav.tools.map((item)=>item.key),
    mobile:nav.mobile.map((item)=>item.key),
  };
}

function clientBottomNavAreas(){
  const html=renderRouteView({kind:'placeholder',role:'client',title:'Auditoría continua'});
  return unique(
    [...html.matchAll(/data-m26-area="([^"]+)"/g)]
      .map((match)=>match[1])
      .filter(Boolean)
  );
}

function stateFor(role,area){
  const base=createProductionState();
  const identity=role==='client'
    ? {id:'audit-user-client',role,clientId:CLIENT_ID,name:'Auditor Cliente'}
    : {id:`audit-user-${role}`,role,name:`Auditor ${role}`};

  return createProductionState({
    hydration:{
      status:'ready',
      error:null,
      confirmedAt:NOW.toISOString(),
      serverTime:NOW.toISOString(),
    },
    identity,
    environment:'AUDIT_READ_ONLY',
    canary:{active:false,scope:null,version:'continuous-audit'},
    selectedClientId:CLIENT_ID,
    activeArea:area,
    collections:{
      ...base.collections,
      clients:[{
        id:CLIENT_ID,
        name:'Cliente auditoría',
        modalidad:'Híbrido',
        status:'activo',
      }],
    },
  });
}

function auditAreaMetadata(){
  const validScopes=new Set([
    'public','global','selected-client','client-context','admin-global',
  ]);

  for(const [area,definition] of Object.entries(M26_AREAS)){
    if(definition?.key!==area){
      addFinding('critical','AREA_KEY_MISMATCH',`El área ${area} no coincide con definition.key.`,{area});
    }
    if(!validScopes.has(definition?.scope)){
      addFinding('critical','AREA_SCOPE_UNKNOWN',`El área ${area} usa un scope no reconocido: ${definition?.scope}.`,{area});
    }
    if(!Array.isArray(definition?.roles)){
      addFinding('critical','AREA_ROLES_INVALID',`El área ${area} no declara roles como array.`,{area});
      continue;
    }
    for(const role of definition.roles){
      if(!ROLES.includes(role)){
        addFinding('critical','AREA_ROLE_UNKNOWN',`El área ${area} declara un rol no reconocido: ${role}.`,{area,role});
        continue;
      }
      if(!areaAllowedForRole(area,role)){
        addFinding(
          'critical',
          'ROLE_METADATA_POLICY_CONTRADICTION',
          `El área ${area} declara ${role}, pero la política real lo bloquea.`,
          {area,role},
        );
      }
    }
  }

  const genericAdminLeak=Object.values(M26_AREAS)
    .filter((definition)=>definition.roles?.includes('admin'))
    .filter((definition)=>!definition.key.startsWith('admin-'))
    .map((definition)=>definition.key);

  if(genericAdminLeak.length){
    addFinding(
      'critical',
      'ADMIN_NAMESPACE_LEAK',
      `Admin aparece en áreas genéricas fuera de admin-*: ${genericAdminLeak.join(', ')}.`,
      {areas:genericAdminLeak},
    );
  }else{
    addStrength(
      'ADMIN_NAMESPACE_ISOLATED',
      'Admin permanece aislado en el namespace admin-*; las superficies Cliente/Coach no amplían privilegios.',
    );
  }
}

function auditRoleNavigation(){
  const clientAuxiliary=clientBottomNavAreas();

  for(const role of ROLES){
    const nav=navigationKeys(role);
    const desktop=[...nav.primary,...nav.context,...nav.tools];
    const duplicates=desktop.filter((key,index)=>desktop.indexOf(key)!==index);
    if(duplicates.length){
      addFinding(
        'critical',
        'NAVIGATION_DUPLICATE',
        `La navegación ${role} repite áreas: ${unique(duplicates).join(', ')}.`,
        {role,areas:unique(duplicates)},
      );
    }

    for(const area of desktop){
      if(!M26_AREAS[area]){
        addFinding('critical','NAVIGATION_UNKNOWN_AREA',`La navegación ${role} apunta a un área inexistente: ${area}.`,{role,area});
      }else if(!areaAllowedForRole(area,role)){
        addFinding('critical','NAVIGATION_FORBIDDEN_AREA',`La navegación ${role} expone un área que su política bloquea: ${area}.`,{role,area});
      }
    }

    for(const area of nav.mobile){
      if(!M26_AREAS[area]||!areaAllowedForRole(area,role)){
        addFinding('critical','MOBILE_NAVIGATION_FORBIDDEN_AREA',`La navegación móvil ${role} contiene un destino inválido: ${area}.`,{role,area});
      }
    }

    const allowed=Object.keys(M26_AREAS)
      .filter((area)=>areaAllowedForRole(area,role));
    const discoverable=new Set([
      ...desktop,
      ...(role==='client'?clientAuxiliary:[]),
    ]);
    const hidden=allowed.filter((area)=>!discoverable.has(area));

    if(hidden.length){
      addFinding(
        'critical',
        'ALLOWED_ROUTE_NOT_DISCOVERABLE',
        `${role} tiene rutas permitidas sin entrada de navegación: ${hidden.join(', ')}.`,
        {role,areas:hidden},
      );
    }else{
      addStrength(
        'ROLE_NAVIGATION_COMPLETE',
        `Todas las rutas permitidas para ${role} son descubribles desde su navegación normal.`,
        {role,count:allowed.length},
      );
    }

    coverage.roles[role]={
      allowedAreas:allowed,
      desktopNavigation:desktop,
      mobileNavigation:nav.mobile,
      clientAuxiliary:role==='client'?clientAuxiliary:[],
    };
  }
}

function auditRouteGuardAndRendering(){
  for(const role of ROLES){
    const allowed=coverage.roles[role]?.allowedAreas||[];
    let rendered=0;

    for(const area of allowed){
      const state=stateFor(role,area);
      const decision=resolveM26Route(state,area);
      if(!decision.allowed||decision.area!==area){
        addFinding(
          'critical',
          'ROUTE_GUARD_REJECTS_ALLOWED_AREA',
          `El guard rechaza ${role}/${area}: ${decision.reason||'sin motivo'}.`,
          {role,area,decision},
        );
        continue;
      }

      try{
        const shellVm=createShellViewModel(state);
        if(shellVm.mode!=='authenticated'||shellVm.activeArea!==area){
          throw new Error(`shell=${shellVm.mode}/${shellVm.activeArea}`);
        }
        const routeVm=createRouteViewModel(shellVm,state,NOW,{catalog:[]});
        const html=renderRouteView(routeVm);
        if(routeVm?.kind==='placeholder'){
          throw new Error('view-model placeholder');
        }
        if(typeof html!=='string'||html.trim().length<40){
          throw new Error('renderer vacío');
        }
        if(/Esta sección no está disponible\. Vuelve al menú principal\./u.test(html)){
          throw new Error('renderer fallback no disponible');
        }
        rendered+=1;
      }catch(error){
        addFinding(
          'critical',
          'ROUTE_RENDER_SMOKE_FAILED',
          `Falló el smoke read-only de ${role}/${area}: ${error?.message||String(error)}.`,
          {role,area},
        );
      }
    }

    coverage.roles[role].renderedAreas=rendered;
    if(rendered===allowed.length){
      addStrength(
        'ROLE_RENDER_CHAIN_COMPLETE',
        `${role}: guard → shell VM → route VM → renderer completó ${rendered}/${allowed.length} rutas permitidas.`,
        {role,count:rendered},
      );
    }
  }
}

async function fetchAuditUrl(url,label){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{
      method:'GET',
      redirect:'follow',
      cache:'no-store',
      headers:{
        'accept':'text/html,application/javascript,text/plain;q=0.9,*/*;q=0.8',
        'user-agent':'IBERFIT-M26-Continuous-Auditor/1.0',
      },
      signal:controller.signal,
    });
    const body=await response.text();
    return {response,body};
  }catch(error){
    addFinding('critical','LIVE_READ_FAILED',`No se pudo leer ${label}: ${error?.message||String(error)}.`,{url});
    return null;
  }finally{
    clearTimeout(timeout);
  }
}

async function auditLivePublicSurface(){
  const root=await fetchAuditUrl(`${APP_URL}/`,'la portada pública de producción');
  if(root){
    coverage.live.rootStatus=root.response.status;
    if(!root.response.ok){
      addFinding('critical','LIVE_ROOT_HTTP_ERROR',`Producción respondió HTTP ${root.response.status} en /.`,{url:`${APP_URL}/`});
    }
    if(!/IBERFIT/i.test(root.body)){
      addFinding('critical','LIVE_ROOT_BRAND_MISSING','La respuesta pública de producción no contiene la identidad IBERFIT.',{url:`${APP_URL}/`});
    }
    if(/service[_-]?role/i.test(root.body)){
      addFinding('critical','LIVE_SERVICE_ROLE_MARKER','La portada pública contiene un marcador service_role prohibido.',{url:`${APP_URL}/`});
    }

    const csp=root.response.headers.get('content-security-policy');
    coverage.live.contentSecurityPolicy=Boolean(csp);
    if(!csp){
      addFinding('warning','LIVE_CSP_HEADER_MISSING','No se observó Content-Security-Policy en la respuesta raíz.');
    }else{
      addStrength('LIVE_CSP_PRESENT','Producción entrega Content-Security-Policy en la superficie pública.');
    }
  }

  const runtime=await fetchAuditUrl(`${APP_URL}/m26/runtime-config.js`,'runtime-config de producción');
  if(runtime){
    coverage.live.runtimeStatus=runtime.response.status;
    if(!runtime.response.ok){
      addFinding('critical','LIVE_RUNTIME_HTTP_ERROR',`runtime-config respondió HTTP ${runtime.response.status}.`);
    }
    if(!runtime.body.includes(PROD_PROJECT_REF)){
      addFinding('critical','LIVE_PROD_PROJECT_REF_MISSING','runtime-config no referencia el proyecto PROD esperado.');
    }
    if(runtime.body.includes(QA_PROJECT_REF)){
      addFinding('critical','LIVE_QA_PROJECT_LEAK','runtime-config de producción contiene el project ref de QA.');
    }
    if(/qaOnly\s*[:=]\s*true|M26_QA_ONLY\s*[:=]\s*['"]?true/i.test(runtime.body)){
      addFinding('critical','LIVE_QA_ONLY_TRUE','runtime-config de producción declara QA-only=true.');
    }
    if(/service[_-]?role/i.test(runtime.body)){
      addFinding('critical','LIVE_RUNTIME_SERVICE_ROLE_MARKER','runtime-config contiene un marcador service_role prohibido.');
    }

    if(
      runtime.response.ok&&
      runtime.body.includes(PROD_PROJECT_REF)&&
      !runtime.body.includes(QA_PROJECT_REF)&&
      !/qaOnly\s*[:=]\s*true|M26_QA_ONLY\s*[:=]\s*['"]?true/i.test(runtime.body)
    ){
      addStrength(
        'LIVE_RUNTIME_PROD_BOUND',
        'runtime-config público está vinculado a PROD y no expone el project ref de QA ni QA-only=true.',
      );
    }
  }
}

function markdownReport(report){
  const lines=[
    '# IBERFIT M26 · Auditoría continua',
    '',
    `- Generada: ${report.generatedAt}`,
    `- Auditor: ${report.auditVersion}`,
    `- Objetivo público: ${report.appUrl}`,
    `- Resultado: **${report.ok?'PASS':'FAIL'}**`,
    `- Críticos: ${report.summary.critical}`,
    `- Advertencias: ${report.summary.warning}`,
    `- Fortalezas verificadas: ${report.strengths.length}`,
    '',
    '## Hallazgos',
    '',
  ];

  if(!report.findings.length){
    lines.push('- Sin hallazgos.');
  }else{
    for(const item of report.findings){
      const where=[item.role,item.area].filter(Boolean).join('/');
      lines.push(`- **${item.severity.toUpperCase()} · ${item.code}**${where?` · ${where}`:''}: ${item.message}`);
    }
  }

  lines.push('','## Fortalezas verificadas','');
  if(!report.strengths.length){
    lines.push('- Ninguna fortaleza pudo verificarse en esta ejecución.');
  }else{
    for(const item of report.strengths){
      lines.push(`- **${item.code}**: ${item.message}`);
    }
  }

  lines.push('','## Cobertura por rol','');
  for(const role of ROLES){
    const item=report.coverage.roles[role]||{};
    lines.push(`- **${role}**: ${item.renderedAreas||0}/${item.allowedAreas?.length||0} rutas permitidas completaron guard → VM → renderer.`);
  }
  lines.push('','> Auditoría estrictamente read-only: no autentica usuarios reales, no ejecuta mutaciones y no modifica producción.');
  return `${lines.join('\n')}\n`;
}

async function writeReport(){
  const critical=findings.filter((item)=>item.severity==='critical').length;
  const warning=findings.filter((item)=>item.severity==='warning').length;
  const report=Object.freeze({
    schema:'iberfit-m26-continuous-audit-v1',
    auditVersion:AUDIT_VERSION,
    generatedAt:new Date().toISOString(),
    appUrl:APP_URL,
    ok:critical===0,
    summary:{critical,warning,total:findings.length},
    findings,
    strengths,
    coverage,
  });

  await fs.mkdir(OUTPUT_DIR,{recursive:true});
  await fs.writeFile(OUTPUT_JSON,`${JSON.stringify(report,null,2)}\n`,'utf8');
  const markdown=markdownReport(report);
  await fs.writeFile(OUTPUT_MD,markdown,'utf8');

  if(process.env.GITHUB_STEP_SUMMARY){
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,markdown,'utf8');
  }

  console.log(`IBERFIT_CONTINUOUS_AUDIT=${report.ok?'PASS':'FAIL'}`);
  console.log(`CRITICAL=${critical}`);
  console.log(`WARNING=${warning}`);
  console.log(`STRENGTHS=${strengths.length}`);
  console.log(`REPORT_JSON=${path.relative(process.cwd(),OUTPUT_JSON)}`);
  console.log(`REPORT_MD=${path.relative(process.cwd(),OUTPUT_MD)}`);

  if(!report.ok)process.exitCode=1;
}

async function main(){
  auditAreaMetadata();
  auditRoleNavigation();
  auditRouteGuardAndRendering();
  await auditLivePublicSurface();
  await writeReport();
}

await main();
