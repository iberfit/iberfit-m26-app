import fs from 'node:fs/promises';
import path from 'node:path';

import {
  M26_AREAS,
  areaAllowedForRole,
} from '../../src/m26/shell/navigation.js';
import { areaIconName, iconRegistryAudit } from '../../src/m26/design/icons.js';
import { auditInteractiveMarkup } from '../../src/m26/ui/interactive-audit.js';
import { createProductionState, stateFromBootstrap } from '../../src/m26/production-state.js';
import { resolveM26Route } from '../../src/m26/shell/route-guard.js';
import { createShellViewModel } from '../../src/m26/shell/shell-view-model.js';
import { createRouteViewModel } from '../../src/m26/modules/route-view-model.js';
import { renderRouteView } from '../../src/m26/modules/route-render.js';

const VERSION='2.0.0';
const ROLES=Object.freeze(['client','coach','admin']);
const CLIENT_ID='audit-client-own';
const OTHER_CLIENT_ID='audit-client-other';
const NOW=new Date();
const APP_URL=String(process.env.M26_AUDIT_APP_URL||'https://app.iberfit.cl').replace(/\/+$/,'');
const PROD_PROJECT_REF='pjhmrhejsoofmouedavw';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const OUT_DIR=path.resolve(process.cwd(),'recovery','continuous-audit');
const OUT_JSON=path.join(OUT_DIR,'deep-latest.json');
const OUT_MD=path.join(OUT_DIR,'deep-latest.md');

const findings=[];
const strengths=[];
const coverage={roles:{},source:{files:0},live:{}};

function finding(severity,code,message,context={}){
  findings.push(Object.freeze({severity,code,message,...context}));
}
function strength(code,message,context={}){
  strengths.push(Object.freeze({code,message,...context}));
}
function unique(values){return [...new Set(values)];}

function emptyState(role,area){
  const base=createProductionState();
  const identity=role==='client'
    ? {id:'audit-user-client',role,clientId:CLIENT_ID,name:'Auditor Cliente'}
    : {id:`audit-user-${role}`,role,name:`Auditor ${role}`};
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:NOW.toISOString(),serverTime:NOW.toISOString()},
    identity,
    environment:'AUDIT_READ_ONLY',
    canary:{active:false,scope:null,version:'deep-audit'},
    selectedClientId:CLIENT_ID,
    activeArea:area,
    collections:{
      ...base.collections,
      clients:[{id:CLIENT_ID,name:'Cliente auditoría',modalidad:'Híbrido',status:'activo'}],
    },
  });
}

function duplicateIds(html){
  const ids=[...String(html).matchAll(/\bid="([^"]+)"/g)].map((m)=>m[1]);
  return unique(ids.filter((id,index)=>ids.indexOf(id)!==index));
}

function m26AreaTargets(html){
  return unique([...String(html).matchAll(/data-m26-area="([^"]+)"/g)].map((m)=>m[1]));
}

function auditIcons(){
  const registry=iconRegistryAudit();
  if(!registry.ok){
    finding('critical','ICON_REGISTRY_UNSAFE',`El registro de iconos contiene nodos inseguros: ${registry.unsafe.join(', ')}.`);
  }

  for(const role of ROLES){
    const allowed=Object.keys(M26_AREAS).filter((area)=>areaAllowedForRole(area,role));
    const missing=allowed.filter((area)=>!areaIconName(area));
    if(missing.length){
      finding('critical','ROLE_AREA_ICON_MISSING',`${role} tiene áreas navegables sin icono: ${missing.join(', ')}.`,{role,areas:missing});
    }else{
      strength('ROLE_ICON_COVERAGE',`${role}: todas las áreas permitidas tienen iconografía del sistema IBERFIT.`,{role,count:allowed.length});
    }
  }
}

function auditRenderedRoutes(){
  for(const role of ROLES){
    const allowed=Object.keys(M26_AREAS).filter((area)=>areaAllowedForRole(area,role));
    let audited=0;
    let interactiveButtons=0;

    for(const area of allowed){
      try{
        const state=emptyState(role,area);
        const decision=resolveM26Route(state,area);
        if(!decision.allowed||decision.area!==area){
          throw new Error(`guard:${decision.area}:${decision.reason||'unknown'}`);
        }
        const shell=createShellViewModel(state);
        const vm=createRouteViewModel(shell,state,NOW,{catalog:[]});
        const html=renderRouteView(vm);

        if(vm?.kind==='placeholder')throw new Error('view-model placeholder');
        if(/Esta sección no está disponible\. Vuelve al menú principal\./u.test(html))throw new Error('renderer fallback');
        if(/<script\b/i.test(html))finding('critical','RENDERED_SCRIPT_TAG',`${role}/${area} genera una etiqueta script.`,{role,area});
        if(/\bon(?:click|load|error|submit|change|input)\s*=/i.test(html))finding('critical','RENDERED_INLINE_HANDLER',`${role}/${area} genera un handler inline.`,{role,area});
        if(/javascript\s*:/i.test(html))finding('critical','RENDERED_JAVASCRIPT_URL',`${role}/${area} genera una URL javascript:.`,{role,area});

        const interaction=auditInteractiveMarkup(html);
        if(!interaction.ok){
          finding(
            'critical',
            'INTERACTIVE_MARKUP_CONTRACT_FAILED',
            `${role}/${area}: ${unique(interaction.errors).join(', ')}.`,
            {role,area,errors:unique(interaction.errors)},
          );
        }
        interactiveButtons+=(String(html).match(/<button\b/gi)||[]).length;

        const duplicates=duplicateIds(html);
        if(duplicates.length){
          finding('critical','DUPLICATE_DOM_ID',`${role}/${area} repite IDs DOM: ${duplicates.join(', ')}.`,{role,area,ids:duplicates});
        }

        for(const target of m26AreaTargets(html)){
          if(!areaAllowedForRole(target,role)){
            finding('critical','RENDERED_FORBIDDEN_NAV_TARGET',`${role}/${area} renderiza navegación hacia ${target}, que no está permitida para el rol.`,{role,area,target});
          }
        }
        audited+=1;
      }catch(error){
        finding('critical','DEEP_ROUTE_AUDIT_FAILED',`${role}/${area}: ${error?.message||String(error)}.`,{role,area});
      }
    }

    coverage.roles[role]={allowed:allowed.length,audited,interactiveButtons};
    if(audited===allowed.length){
      strength('DEEP_ROUTE_SURFACE_COMPLETE',`${role}: ${audited}/${allowed.length} rutas pasaron render, interactividad, navegación interna e IDs DOM.`,{role});
    }
  }
}

function bootstrapFixture(){
  return {
    user:{id:'audit-user-client',role:'client',clientId:CLIENT_ID,name:'Cliente Auditoría'},
    environment:'QA',
    canary:{active:true,scope:'allowlist',version:'deep-audit'},
    serverTime:NOW.toISOString(),
    data:{
      clients:[
        {id:CLIENT_ID,name:'Cliente propio',modalidad:'Híbrido'},
        {id:OTHER_CLIENT_ID,name:'Cliente ajeno',modalidad:'Online'},
      ],
      clientProfiles:[
        {id:CLIENT_ID,clientId:CLIENT_ID,objective:'Fuerza',internalNote:'NO_EXPOSURE'},
        {id:OTHER_CLIENT_ID,clientId:OTHER_CLIENT_ID,objective:'Ajeno'},
      ],
      sessions:[
        {id:'session-own-published',clientId:CLIENT_ID,status:'publicado',visibleToClient:true,title:'Sesión visible',blocks:[{id:'b1',exerciseId:'e1',sets:3,reps:10,internalNote:'NO_EXPOSURE'}]},
        {id:'session-own-draft',clientId:CLIENT_ID,status:'borrador',visibleToClient:false,title:'Borrador privado',blocks:[]},
        {id:'session-other-published',clientId:OTHER_CLIENT_ID,status:'publicado',visibleToClient:true,title:'Sesión ajena',blocks:[]},
      ],
      reports:[
        {id:'report-own',clientId:CLIENT_ID,status:'publicado',visibleToClient:true,title:'Informe visible'},
        {id:'report-other',clientId:OTHER_CLIENT_ID,status:'publicado',visibleToClient:true,title:'Informe ajeno'},
      ],
      privateNotes:[
        {id:'private-own',clientId:CLIENT_ID,status:'activo',body:{note:'Privada propia'}},
        {id:'private-other',clientId:OTHER_CLIENT_ID,status:'activo',body:{note:'Privada ajena'}},
      ],
      intelligenceRuns:[{id:'intel-own',clientId:CLIENT_ID,status:'completed'}],
      domainEvents:[{id:'event-own',clientId:CLIENT_ID,status:'completed'}],
      wearableSyncRuns:[{id:'sync-own',clientId:CLIENT_ID,status:'completed'}],
      appointments:[],checkins:[],habits:[],habitLogs:[],clientAccess:[],iriAssessments:[],trainingCycles:[],sessionExecutions:[],coachAvailability:[],wearableConnections:[],wearableDailySummaries:[],m26Entities:[],
    },
  };
}

function auditClientProjection(){
  try{
    const state=stateFromBootstrap(bootstrapFixture());
    const clients=state.collections.clients||[];
    if(clients.length!==1||clients[0]?.id!==CLIENT_ID){
      finding('critical','CLIENT_CROSS_TENANT_CLIENT_LEAK','La proyección Cliente no quedó limitada a su propio clientId.');
    }

    for(const key of ['privateNotes','intelligenceRuns','domainEvents','wearableSyncRuns','coachAvailability']){
      if((state.collections[key]||[]).length){
        finding('critical','CLIENT_PRIVATE_COLLECTION_LEAK',`Cliente recibe registros en colección privada ${key}.`,{collection:key});
      }
    }

    const sessions=state.collections.sessions||[];
    if(sessions.some((item)=>item.clientId!==CLIENT_ID)){
      finding('critical','CLIENT_CROSS_TENANT_SESSION_LEAK','Cliente recibe sesiones de otro expediente.');
    }
    if(sessions.some((item)=>String(item.status||'').toLowerCase()==='borrador')){
      finding('critical','CLIENT_DRAFT_PUBLICATION_LEAK','Cliente recibe una sesión en borrador.');
    }
    if(!sessions.some((item)=>item.id==='session-own-published')){
      finding('critical','CLIENT_PUBLISHED_SESSION_MISSING','La sesión publicada propia desapareció de la proyección Cliente.');
    }

    const serialized=JSON.stringify(state.collections);
    for(const forbidden of ['NO_EXPOSURE','Cliente ajeno','Sesión ajena','Informe ajeno','Privada propia','Privada ajena']){
      if(serialized.includes(forbidden)){
        finding('critical','CLIENT_SENSITIVE_VALUE_LEAK',`La proyección Cliente conserva contenido prohibido: ${forbidden}.`);
      }
    }

    if(!findings.some((item)=>item.code.startsWith('CLIENT_'))){
      strength('CLIENT_PROJECTION_FAIL_CLOSED','La proyección Cliente elimina otros expedientes, borradores, colecciones privadas y campos internos en el fixture adversarial.');
    }
  }catch(error){
    finding('critical','CLIENT_PROJECTION_AUDIT_FAILED',`No se pudo completar el fixture adversarial de privacidad: ${error?.message||String(error)}.`);
  }
}

async function walkFiles(root){
  const output=[];
  async function visit(current){
    let entries=[];
    try{entries=await fs.readdir(current,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      const full=path.join(current,entry.name);
      const rel=path.relative(process.cwd(),full).replaceAll('\\','/');
      if(entry.isDirectory()){
        if(/(?:^|\/)(?:vendor|fonts|icons)(?:\/|$)/.test(rel))continue;
        await visit(full);
      }else if(/\.(?:js|mjs|html|json|webmanifest)$/i.test(entry.name)){
        output.push(full);
      }
    }
  }
  await visit(root);
  return output;
}

async function auditDeployableSource(){
  const roots=[path.resolve('src/m26'),path.resolve('public/m26')];
  const files=[];
  for(const root of roots)files.push(...await walkFiles(root));
  coverage.source.files=files.length;

  const dangerous=[
    ['DYNAMIC_EVAL',/(?:^|[^\w])eval\s*\(/u],
    ['DYNAMIC_FUNCTION',/new\s+Function\s*\(/u],
    ['DOCUMENT_WRITE',/document\.write\s*\(/u],
    ['JAVASCRIPT_URL',/javascript\s*:/iu],
    ['PRIVATE_KEY_MATERIAL',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ['SUPABASE_SECRET_KEY',/\bsb_secret_[A-Za-z0-9_-]{12,}\b/u],
    ['GITHUB_PAT',/\bghp_[A-Za-z0-9]{20,}\b/u],
    ['AWS_ACCESS_KEY',/\bAKIA[0-9A-Z]{16}\b/u],
  ];

  for(const file of files){
    const rel=path.relative(process.cwd(),file).replaceAll('\\','/');
    const text=await fs.readFile(file,'utf8');
    for(const [code,pattern] of dangerous){
      if(pattern.test(text))finding('critical',code,`Patrón peligroso en fuente desplegable: ${rel}.`,{file:rel});
    }
    if(rel.endsWith('.html')&&/\bon(?:click|load|error|submit|change|input)\s*=/i.test(text)){
      finding('critical','STATIC_INLINE_HANDLER',`HTML desplegable contiene handler inline: ${rel}.`,{file:rel});
    }
  }

  const sourceCritical=findings.filter((item)=>item.file&&item.severity==='critical');
  if(!sourceCritical.length){
    strength('DEPLOYABLE_SOURCE_STATIC_SAFE',`${files.length} archivos desplegables pasaron el barrido de ejecución dinámica, handlers inline y material secreto de alto riesgo.`);
  }
}

async function get(url,label){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(url,{method:'GET',redirect:'follow',cache:'no-store',headers:{'user-agent':'IBERFIT-M26-Deep-Auditor/2.0'},signal:controller.signal});
    const body=await response.text();
    return {response,body};
  }catch(error){
    finding('critical','LIVE_DEEP_READ_FAILED',`No se pudo leer ${label}: ${error?.message||String(error)}.`,{url});
    return null;
  }finally{clearTimeout(timeout);}
}

async function auditLivePwa(){
  const targets=[
    ['root','/'],
    ['m26','/m26/'],
    ['manifest','/m26/manifest.webmanifest'],
    ['serviceWorker','/m26/sw.js'],
    ['offline','/m26/offline.html'],
    ['runtime','/m26/runtime-config.js'],
  ];
  const fetched={};
  for(const [key,suffix] of targets){
    const result=await get(`${APP_URL}${suffix}`,key);
    if(!result)continue;
    fetched[key]=result;
    coverage.live[key]=result.response.status;
    if(!result.response.ok)finding('critical','LIVE_PWA_HTTP_ERROR',`${suffix} respondió HTTP ${result.response.status}.`,{url:`${APP_URL}${suffix}`});
    if(/\bsb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bghp_[A-Za-z0-9]{20,}/u.test(result.body)){
      finding('critical','LIVE_SECRET_MATERIAL',`${suffix} expone material secreto de alto riesgo.`,{url:`${APP_URL}${suffix}`});
    }
  }

  if(fetched.runtime){
    const body=fetched.runtime.body;
    if(!body.includes(PROD_PROJECT_REF))finding('critical','LIVE_RUNTIME_NOT_PROD','runtime-config no contiene el project ref PROD esperado.');
    if(body.includes(QA_PROJECT_REF))finding('critical','LIVE_RUNTIME_QA_LEAK','runtime-config contiene el project ref QA.');
    if(/qaOnly\s*[:=]\s*true/i.test(body))finding('critical','LIVE_RUNTIME_QA_ONLY','runtime-config declara qaOnly=true.');
  }

  if(fetched.manifest){
    try{
      const manifest=JSON.parse(fetched.manifest.body);
      if(!/IBERFIT/i.test(String(manifest.name||manifest.short_name||'')))finding('critical','PWA_MANIFEST_BRAND_MISSING','El manifest no identifica IBERFIT.');
      if(!String(manifest.start_url||'').startsWith('/'))finding('critical','PWA_MANIFEST_START_URL_INVALID','El manifest no usa start_url same-origin absoluto.');
      if(!String(manifest.scope||'').startsWith('/'))finding('critical','PWA_MANIFEST_SCOPE_INVALID','El manifest no usa scope same-origin absoluto.');
      if(!Array.isArray(manifest.icons)||manifest.icons.length<2)finding('warning','PWA_MANIFEST_ICON_COVERAGE_LOW','El manifest declara menos de dos iconos.');
      else strength('PWA_MANIFEST_VALID','Manifest PWA válido, same-origin y con identidad IBERFIT.');
    }catch(error){
      finding('critical','PWA_MANIFEST_PARSE_FAILED',`No se pudo parsear manifest.webmanifest: ${error?.message||String(error)}.`);
    }
  }

  if(fetched.root){
    const h=fetched.root.response.headers;
    const requiredHeaders=[
      ['content-security-policy','CSP'],
      ['x-content-type-options','X-Content-Type-Options'],
      ['referrer-policy','Referrer-Policy'],
    ];
    for(const [name,label] of requiredHeaders){
      if(!h.get(name))finding('warning','LIVE_SECURITY_HEADER_MISSING',`No se observó ${label} en la respuesta raíz.`,{header:name});
    }
    if(h.get('content-security-policy'))strength('LIVE_SECURITY_HEADERS','La superficie raíz entrega CSP; el resto de cabeceras se audita individualmente.');
  }

  const liveCritical=findings.filter((item)=>item.code.startsWith('LIVE_')&&item.severity==='critical');
  if(!liveCritical.length)strength('LIVE_PUBLIC_SURFACE_READ_ONLY_PASS','Root, M26, manifest, service worker, offline y runtime-config respondieron sin hallazgos críticos públicos.');
}

function reportMarkdown(report){
  const lines=[
    '# IBERFIT M26 · Auditoría profunda continua',
    '',
    `- Generada: ${report.generatedAt}`,
    `- Versión: ${report.version}`,
    `- Resultado: **${report.ok?'PASS':'FAIL'}**`,
    `- Críticos: ${report.summary.critical}`,
    `- Advertencias: ${report.summary.warning}`,
    `- Fortalezas verificadas: ${report.strengths.length}`,
    `- Archivos desplegables barridos: ${report.coverage.source.files}`,
    '',
    '## Hallazgos',
    '',
  ];
  if(!report.findings.length)lines.push('- Sin hallazgos.');
  else for(const item of report.findings)lines.push(`- **${item.severity.toUpperCase()} · ${item.code}**: ${item.message}`);
  lines.push('','## Fortalezas','');
  for(const item of report.strengths)lines.push(`- **${item.code}**: ${item.message}`);
  lines.push('','## Cobertura de rutas','');
  for(const role of ROLES){
    const c=report.coverage.roles[role]||{};
    lines.push(`- **${role}**: ${c.audited||0}/${c.allowed||0} rutas; ${c.interactiveButtons||0} botones inspeccionados.`);
  }
  lines.push('','> Read-only: esta auditoría no autentica cuentas reales, no ejecuta comandos de dominio y no modifica producción.');
  return `${lines.join('\n')}\n`;
}

async function writeReport(){
  const critical=findings.filter((item)=>item.severity==='critical').length;
  const warning=findings.filter((item)=>item.severity==='warning').length;
  const report={
    schema:'iberfit-m26-deep-product-audit-v2',
    version:VERSION,
    generatedAt:new Date().toISOString(),
    appUrl:APP_URL,
    ok:critical===0,
    summary:{critical,warning,total:findings.length},
    findings,
    strengths,
    coverage,
  };
  await fs.mkdir(OUT_DIR,{recursive:true});
  await fs.writeFile(OUT_JSON,`${JSON.stringify(report,null,2)}\n`,'utf8');
  const markdown=reportMarkdown(report);
  await fs.writeFile(OUT_MD,markdown,'utf8');
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,markdown,'utf8');
  console.log(`IBERFIT_DEEP_AUDIT=${report.ok?'PASS':'FAIL'}`);
  console.log(`CRITICAL=${critical}`);
  console.log(`WARNING=${warning}`);
  console.log(`STRENGTHS=${strengths.length}`);
  if(!report.ok)process.exitCode=1;
}

async function main(){
  auditIcons();
  auditRenderedRoutes();
  auditClientProjection();
  await auditDeployableSource();
  await auditLivePwa();
  await writeReport();
}

await main();
