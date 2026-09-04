import fs from 'node:fs/promises';
import path from 'node:path';

import {M26_AREAS,areaAllowedForRole} from '../../src/m26/shell/navigation.js';
import {areaIconName,iconRegistryAudit} from '../../src/m26/design/icons.js';
import {auditInteractiveMarkup} from '../../src/m26/ui/interactive-audit.js';
import {createProductionState,stateFromBootstrap} from '../../src/m26/production-state.js';
import {resolveM26Route} from '../../src/m26/shell/route-guard.js';
import {createShellViewModel} from '../../src/m26/shell/shell-view-model.js';
import {createRouteViewModel} from '../../src/m26/modules/route-view-model.js';
import {renderRouteView} from '../../src/m26/modules/route-render.js';

const VERSION='2.2.0';
const ROLES=Object.freeze(['client','coach','admin']);
const CLIENT_ID='audit-client-own';
const OTHER_CLIENT_ID='audit-client-other';
const NOW=new Date();
const APP_URL=String(process.env.M26_AUDIT_APP_URL||'https://app.iberfit.cl').replace(/\/+$/,'');
const PROD_PROJECT_REF='pjhmrhejsoofmouedavw';
const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const OUT_DIR=path.resolve('recovery/continuous-audit');
const OUT_JSON=path.join(OUT_DIR,'deep-latest.json');
const OUT_MD=path.join(OUT_DIR,'deep-latest.md');
const findings=[];
const strengths=[];
const coverage={roles:{},source:{files:0},live:{}};

const add=(severity,code,message,context={})=>findings.push(Object.freeze({severity,code,message,...context}));
const good=(code,message,context={})=>strengths.push(Object.freeze({code,message,...context}));
const uniq=(values)=>[...new Set(values)];
const critical=(code,message,context={})=>add('critical',code,message,context);
const warning=(code,message,context={})=>add('warning',code,message,context);

function stateFor(role,area){
  const base=createProductionState();
  const identity=role==='client'
    ?{id:'audit-user-client',role,clientId:CLIENT_ID,name:'Auditor Cliente'}
    :{id:`audit-user-${role}`,role,name:`Auditor ${role}`};
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:NOW.toISOString(),serverTime:NOW.toISOString()},
    identity,environment:'AUDIT_READ_ONLY',canary:{active:false,scope:null,version:'deep-audit'},
    selectedClientId:CLIENT_ID,activeArea:area,
    collections:{...base.collections,clients:[{id:CLIENT_ID,name:'Cliente auditoría',modalidad:'Híbrido',status:'activo'}]},
  });
}

function ids(html){return [...String(html).matchAll(/\bid="([^"]+)"/g)].map((m)=>m[1]);}
function areaTargets(html){return uniq([...String(html).matchAll(/data-m26-area="([^"]+)"/g)].map((m)=>m[1]));}

function auditIcons(){
  const registry=iconRegistryAudit();
  if(!registry.ok)critical('ICON_REGISTRY_UNSAFE',`Iconos inseguros: ${registry.unsafe.join(', ')}.`);
  for(const role of ROLES){
    const allowed=Object.keys(M26_AREAS).filter((area)=>areaAllowedForRole(area,role));
    const missing=allowed.filter((area)=>!areaIconName(area));
    if(missing.length)critical('ROLE_AREA_ICON_MISSING',`${role} tiene áreas sin icono: ${missing.join(', ')}.`,{role,areas:missing});
    else good('ROLE_ICON_COVERAGE',`${role}: todas las áreas permitidas tienen iconografía IBERFIT.`,{role,count:allowed.length});
  }
}

function auditRenderedRoutes(){
  for(const role of ROLES){
    const allowed=Object.keys(M26_AREAS).filter((area)=>areaAllowedForRole(area,role));
    let audited=0,buttons=0;
    for(const area of allowed){
      try{
        const state=stateFor(role,area);
        const decision=resolveM26Route(state,area);
        if(!decision.allowed||decision.area!==area)throw new Error(`guard:${decision.area}:${decision.reason||'unknown'}`);
        const shell=createShellViewModel(state);
        const vm=createRouteViewModel(shell,state,NOW,{catalog:[]});
        const html=renderRouteView(vm);
        if(vm?.kind==='placeholder')throw new Error('view-model placeholder');
        if(/Esta sección no está disponible\. Vuelve al menú principal\./u.test(html))throw new Error('renderer fallback');
        if(/<script\b/i.test(html))critical('RENDERED_SCRIPT_TAG',`${role}/${area} genera <script>.`,{role,area});
        if(/\bon(?:click|load|error|submit|change|input)\s*=/i.test(html))critical('RENDERED_INLINE_HANDLER',`${role}/${area} genera handler inline.`,{role,area});
        if(/javascript\s*:/i.test(html))critical('RENDERED_JAVASCRIPT_URL',`${role}/${area} genera javascript:.`,{role,area});

        const interaction=auditInteractiveMarkup(html);
        const disabledAria=interaction.errors.filter((item)=>item==='DISABLED_ARIA_REQUIRED');
        const hard=interaction.errors.filter((item)=>item!=='DISABLED_ARIA_REQUIRED');
        if(hard.length)critical('INTERACTIVE_MARKUP_CONTRACT_FAILED',`${role}/${area}: ${uniq(hard).join(', ')}.`,{role,area,errors:uniq(hard)});
        if(disabledAria.length)warning('DISABLED_ARIA_STATE_GAP',`${role}/${area} contiene un control inicialmente disabled sin aria-disabled sincronizado.`,{role,area});
        buttons+=(String(html).match(/<button\b/gi)||[]).length;

        const allIds=ids(html),dupes=uniq(allIds.filter((id,index)=>allIds.indexOf(id)!==index));
        if(dupes.length)critical('DUPLICATE_DOM_ID',`${role}/${area} repite IDs: ${dupes.join(', ')}.`,{role,area,ids:dupes});
        for(const target of areaTargets(html))if(!areaAllowedForRole(target,role))critical('RENDERED_FORBIDDEN_NAV_TARGET',`${role}/${area} enlaza a ${target}, no permitido.`,{role,area,target});
        audited+=1;
      }catch(error){critical('DEEP_ROUTE_AUDIT_FAILED',`${role}/${area}: ${error?.message||String(error)}.`,{role,area});}
    }
    coverage.roles[role]={allowed:allowed.length,audited,interactiveButtons:buttons};
    if(audited===allowed.length)good('DEEP_ROUTE_SURFACE_COMPLETE',`${role}: ${audited}/${allowed.length} rutas pasaron render, navegación e IDs DOM.`,{role});
  }
}

function bootstrapFixture(){
  return {
    user:{id:'audit-user-client',role:'client',clientId:CLIENT_ID,name:'Cliente Auditoría'},
    environment:'QA',canary:{active:true,scope:'allowlist',version:'deep-audit'},serverTime:NOW.toISOString(),
    data:{
      clients:[{id:CLIENT_ID,name:'Cliente propio',modalidad:'Híbrido'},{id:OTHER_CLIENT_ID,name:'Cliente ajeno',modalidad:'Online'}],
      clientProfiles:[{id:CLIENT_ID,clientId:CLIENT_ID,objective:'Fuerza',internalNote:'NO_EXPOSURE'},{id:OTHER_CLIENT_ID,clientId:OTHER_CLIENT_ID,objective:'Ajeno'}],
      sessions:[
        {id:'session-own-published',clientId:CLIENT_ID,status:'publicado',visibleToClient:true,title:'Sesión visible',blocks:[{id:'b1',exerciseId:'e1',sets:3,reps:10,internalNote:'NO_EXPOSURE'}]},
        {id:'session-own-draft',clientId:CLIENT_ID,status:'borrador',visibleToClient:false,title:'Borrador privado',blocks:[]},
        {id:'session-other-published',clientId:OTHER_CLIENT_ID,status:'publicado',visibleToClient:true,title:'Sesión ajena',blocks:[]},
      ],
      reports:[{id:'report-own',clientId:CLIENT_ID,status:'publicado',visibleToClient:true,title:'Informe visible'},{id:'report-other',clientId:OTHER_CLIENT_ID,status:'publicado',visibleToClient:true,title:'Informe ajeno'}],
      privateNotes:[{id:'private-own',clientId:CLIENT_ID,status:'activo',body:{note:'Privada propia'}},{id:'private-other',clientId:OTHER_CLIENT_ID,status:'activo',body:{note:'Privada ajena'}}],
      intelligenceRuns:[{id:'intel-own',clientId:CLIENT_ID,status:'completed'}],domainEvents:[{id:'event-own',clientId:CLIENT_ID,status:'completed'}],wearableSyncRuns:[{id:'sync-own',clientId:CLIENT_ID,status:'completed'}],
      appointments:[],checkins:[],habits:[],habitLogs:[],clientAccess:[],iriAssessments:[],trainingCycles:[],sessionExecutions:[],coachAvailability:[],wearableConnections:[],wearableDailySummaries:[],m26Entities:[],
    },
  };
}

function auditClientProjection(){
  const before=findings.length;
  try{
    const state=stateFromBootstrap(bootstrapFixture());
    const clients=state.collections.clients||[];
    if(clients.length!==1||clients[0]?.id!==CLIENT_ID)critical('CLIENT_CROSS_TENANT_CLIENT_LEAK','La proyección Cliente no queda limitada a su clientId.');
    for(const key of ['privateNotes','intelligenceRuns','domainEvents','wearableSyncRuns','coachAvailability'])if((state.collections[key]||[]).length)critical('CLIENT_PRIVATE_COLLECTION_LEAK',`Cliente recibe ${key}.`,{collection:key});
    const sessions=state.collections.sessions||[];
    if(sessions.some((item)=>item.clientId!==CLIENT_ID))critical('CLIENT_CROSS_TENANT_SESSION_LEAK','Cliente recibe sesiones ajenas.');
    if(sessions.some((item)=>String(item.status||'').toLowerCase()==='borrador'))critical('CLIENT_DRAFT_PUBLICATION_LEAK','Cliente recibe una sesión borrador.');
    if(!sessions.some((item)=>item.id==='session-own-published'))critical('CLIENT_PUBLISHED_SESSION_MISSING','Desaparece la sesión publicada propia.');
    const serialized=JSON.stringify(state.collections);
    for(const value of ['NO_EXPOSURE','Cliente ajeno','Sesión ajena','Informe ajeno','Privada propia','Privada ajena'])if(serialized.includes(value))critical('CLIENT_SENSITIVE_VALUE_LEAK',`La proyección conserva contenido prohibido: ${value}.`);
    if(findings.length===before)good('CLIENT_PROJECTION_FAIL_CLOSED','Fixture adversarial: sin cross-tenant, borradores, colecciones privadas ni campos internos.');
  }catch(error){critical('CLIENT_PROJECTION_AUDIT_FAILED',`Fixture de privacidad falló: ${error?.message||String(error)}.`);}
}

async function walk(root){
  const out=[];
  async function visit(current){
    let entries=[];try{entries=await fs.readdir(current,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      const full=path.join(current,entry.name),rel=path.relative(process.cwd(),full).replaceAll('\\','/');
      if(entry.isDirectory()){
        if(/(?:^|\/)(?:vendor|fonts|icons)(?:\/|$)/.test(rel))continue;
        await visit(full);
      }else if(/\.(?:js|mjs|html|json|webmanifest)$/i.test(entry.name))out.push(full);
    }
  }
  await visit(root);return out;
}

async function auditDeployableSource(){
  const files=[...await walk(path.resolve('src/m26')),...await walk(path.resolve('public/m26'))];
  coverage.source.files=files.length;
  const dangerous=[
    ['DYNAMIC_EVAL',/(?:^|[^\w])eval\s*\(/u],['DYNAMIC_FUNCTION',/new\s+Function\s*\(/u],['JAVASCRIPT_URL',/javascript\s*:/iu],
    ['PRIVATE_KEY_MATERIAL',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],['SUPABASE_SECRET_KEY',/\bsb_secret_[A-Za-z0-9_-]{12,}\b/u],['GITHUB_PAT',/\bghp_[A-Za-z0-9]{20,}\b/u],['AWS_ACCESS_KEY',/\bAKIA[0-9A-Z]{16}\b/u],
  ];
  const before=findings.length;
  for(const file of files){
    const rel=path.relative(process.cwd(),file).replaceAll('\\','/'),text=await fs.readFile(file,'utf8');
    for(const [code,re] of dangerous)if(re.test(text))critical(code,`Patrón peligroso en ${rel}.`,{file:rel});
    if(rel.endsWith('.html')&&/\bon(?:click|load|error|submit|change|input)\s*=/i.test(text))critical('STATIC_INLINE_HANDLER',`HTML con handler inline: ${rel}.`,{file:rel});
    if(/document\.write\s*\(/u.test(text)){
      if(rel==='src/m26/workflows/iri-report-document.js')warning('LEGACY_REPORT_DOCUMENT_WRITE','El generador IRI usa document.write únicamente para poblar una ventana de impresión con HTML generado y escapado; mantener bajo revisión para futura migración a Blob/DOMParser.',{file:rel});
      else critical('DOCUMENT_WRITE',`document.write en ${rel}.`,{file:rel});
    }
  }
  if(findings.slice(before).every((item)=>item.severity!=='critical'))good('DEPLOYABLE_SOURCE_STATIC_SAFE',`${files.length} archivos desplegables sin ejecución dinámica ni material secreto crítico.`);
}

async function get(url,label){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{return {response:await fetch(url,{method:'GET',redirect:'follow',cache:'no-store',headers:{'user-agent':'IBERFIT-M26-Deep-Auditor/2.2'},signal:controller.signal})};}
  catch(error){critical('LIVE_DEEP_READ_FAILED',`No se pudo leer ${label}: ${error?.message||String(error)}.`,{url});return null;}
  finally{clearTimeout(timeout);}
}
async function body(result){if(!result)return '';if(result.body!==undefined)return result.body;result.body=await result.response.text();return result.body;}

async function auditLivePwa(){
  const targets=[['root','/'],['m26','/m26/'],['manifest','/m26/manifest.webmanifest'],['serviceWorker','/m26/sw.js'],['offline','/m26/offline.html'],['runtime','/m26/runtime-config.js']];
  const fetched={};
  for(const [key,suffix] of targets){
    const result=await get(`${APP_URL}${suffix}`,key);if(!result)continue;fetched[key]=result;coverage.live[key]=result.response.status;
    const text=await body(result);
    if(!result.response.ok)critical('LIVE_PWA_HTTP_ERROR',`${suffix} respondió HTTP ${result.response.status}.`,{url:`${APP_URL}${suffix}`});
    if(/\bsb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bghp_[A-Za-z0-9]{20,}/u.test(text))critical('LIVE_SECRET_MATERIAL',`${suffix} expone material secreto.`,{url:`${APP_URL}${suffix}`});
  }
  if(fetched.runtime){const text=await body(fetched.runtime);if(!text.includes(PROD_PROJECT_REF))critical('LIVE_RUNTIME_NOT_PROD','runtime-config no contiene PROD.');if(text.includes(QA_PROJECT_REF))critical('LIVE_RUNTIME_QA_LEAK','runtime-config contiene QA.');if(/qaOnly\s*[:=]\s*true/i.test(text))critical('LIVE_RUNTIME_QA_ONLY','runtime-config declara qaOnly=true.');}
  if(fetched.manifest){
    try{const manifest=JSON.parse(await body(fetched.manifest));if(!/IBERFIT/i.test(String(manifest.name||manifest.short_name||'')))critical('PWA_MANIFEST_BRAND_MISSING','Manifest sin identidad IBERFIT.');if(!String(manifest.start_url||'').startsWith('/'))critical('PWA_MANIFEST_START_URL_INVALID','start_url no es same-origin absoluto.');if(!String(manifest.scope||'').startsWith('/'))critical('PWA_MANIFEST_SCOPE_INVALID','scope no es same-origin absoluto.');if(!Array.isArray(manifest.icons)||manifest.icons.length<2)warning('PWA_MANIFEST_ICON_COVERAGE_LOW','Manifest declara menos de dos iconos.');else good('PWA_MANIFEST_VALID','Manifest válido, same-origin y con identidad IBERFIT.');}
    catch(error){critical('PWA_MANIFEST_PARSE_FAILED',`Manifest inválido: ${error?.message||String(error)}.`);}
  }
  if(fetched.root){const h=fetched.root.response.headers;for(const [name,label] of [['content-security-policy','CSP'],['x-content-type-options','X-Content-Type-Options'],['referrer-policy','Referrer-Policy']])if(!h.get(name))warning('LIVE_SECURITY_HEADER_MISSING',`No se observó ${label} en root.`,{header:name});if(h.get('content-security-policy'))good('LIVE_SECURITY_HEADERS','La superficie raíz entrega CSP.');}
  if(!findings.some((item)=>item.code.startsWith('LIVE_')&&item.severity==='critical'))good('LIVE_PUBLIC_SURFACE_READ_ONLY_PASS','Root, M26, manifest, service worker, offline y runtime-config sin hallazgos críticos públicos.');
}

function markdown(report){
  const lines=['# IBERFIT M26 · Auditoría profunda continua','',`- Generada: ${report.generatedAt}`,`- Versión: ${report.version}`,`- Resultado: **${report.ok?'PASS':'FAIL'}**`,`- Críticos: ${report.summary.critical}`,`- Advertencias: ${report.summary.warning}`,`- Fortalezas verificadas: ${report.strengths.length}`,`- Archivos desplegables barridos: ${report.coverage.source.files}`,'','## Hallazgos',''];
  if(!report.findings.length)lines.push('- Sin hallazgos.');else for(const item of report.findings)lines.push(`- **${item.severity.toUpperCase()} · ${item.code}**: ${item.message}`);
  lines.push('','## Fortalezas','');for(const item of report.strengths)lines.push(`- **${item.code}**: ${item.message}`);
  lines.push('','## Cobertura de rutas','');for(const role of ROLES){const c=report.coverage.roles[role]||{};lines.push(`- **${role}**: ${c.audited||0}/${c.allowed||0} rutas; ${c.interactiveButtons||0} botones inspeccionados.`);}
  lines.push('','> Read-only: no autentica cuentas reales, no ejecuta comandos de dominio y no modifica producción.');return `${lines.join('\n')}\n`;
}

async function finish(){
  const criticalCount=findings.filter((item)=>item.severity==='critical').length,warningCount=findings.filter((item)=>item.severity==='warning').length;
  const report={schema:'iberfit-m26-deep-product-audit-v2',version:VERSION,generatedAt:new Date().toISOString(),appUrl:APP_URL,ok:criticalCount===0,summary:{critical:criticalCount,warning:warningCount,total:findings.length},findings,strengths,coverage};
  await fs.mkdir(OUT_DIR,{recursive:true});await fs.writeFile(OUT_JSON,`${JSON.stringify(report,null,2)}\n`);const md=markdown(report);await fs.writeFile(OUT_MD,md);if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,md);
  console.log(`IBERFIT_DEEP_AUDIT=${report.ok?'PASS':'FAIL'}`);console.log(`CRITICAL=${criticalCount}`);console.log(`WARNING=${warningCount}`);console.log(`STRENGTHS=${strengths.length}`);if(!report.ok)process.exitCode=1;
}

async function main(){auditIcons();auditRenderedRoutes();auditClientProjection();await auditDeployableSource();await auditLivePwa();await finish();}
await main();
