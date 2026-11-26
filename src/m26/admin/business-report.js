// IBERFIT internal management report: aggregate projection only, no names,
// identifiers, health data, private notes or additional backend access.
import {adminCan,ADMIN_CAPABILITIES as C} from './permission-policy.js';
import {adminCollection} from './admin-state.js';
import {coachCapacityEvidence} from './command-center.js';
import {deriveAdminOperationsTriage} from './operation-triage.js';
import {trainingServiceStatusFrom} from '../domain/training-service.js';
const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const esc=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const row=(label,value,note='')=>Object.freeze({label,value:count(value),note});
export function buildBusinessReport(state,clients=[]){
 const admin=state?.admin;
 if(state?.identity?.role!=='admin'||!adminCan(admin,C.ANALYTICS_READ))return null;
 const rawTime=admin.serverTime,instant=typeof rawTime==='string'&&/^\d{4}-\d{2}-\d{2}T/u.test(rawTime)?new Date(rawTime):null;
 const validTime=instant&&Number.isFinite(instant.getTime())?instant:null;
 const groups=[];
 const total=count(admin.analytics?.activeClients);
 groups.push({title:'Servicio · dato del backend',rows:[row('Clientes activos',total,'Indicador recibido de analítica; no se sustituye por un cero local.')]});
 if(adminCan(admin,C.CLIENT_LIFECYCLE_READ)){
  const byId=new Map(),conflicts=new Set();
  for(const c of Array.isArray(clients)?clients:[]){
   const id=typeof c?.id==='string'?c.id.trim():'';
   if(!id)continue;
   if(byId.has(id)){conflicts.add(id);continue;}byId.set(id,c);
  }
  const visible=[...byId].filter(([id])=>!conflicts.has(id)).map(([,c])=>c);
  const active=visible.filter(c=>trainingServiceStatusFrom(c)==='active'),paused=visible.filter(c=>trainingServiceStatusFrom(c)==='paused');
  const noTraining=visible.filter(c=>['none','ended'].includes(trainingServiceStatusFrom(c)));
  const rs=[row('Expedientes visibles sin duplicados',visible.length),row('En entrenamiento activo',active.length),row('En pausa',paused.length),row('Evaluados sin entrenamiento activo',noTraining.filter(c=>c.experience?.readiness?.iriConfirmed===true).length),row('Duplicados excluidos',conflicts.size)];
  if(adminCan(admin,C.ASSIGNMENT_READ))rs.push(row('Activos sin Coach en registros visibles',active.filter(c=>Array.isArray(c.assignments)&&!c.assignments.length).length));
  for(const [stage,label] of [['onboarding','Altas en incorporación'],['evaluation','En etapa de evaluación'],['planning','En etapa de planificación'],['scheduling','En etapa de programación']])rs.push(row(label,active.filter(c=>c.experience?.stage===stage).length));
  rs.push(row('Activos sin etapa informada',active.filter(c=>!c.experience?.stage).length));
  groups.push({title:'Recorrido y cobertura · expedientes visibles',rows:rs});
 }
 if(adminCan(admin,C.ASSIGNMENT_READ)){
  const coaches=adminCollection(state,'coachProfiles');
  const unique=new Map(),duplicates=new Set();
  for(const c of coaches){const id=String(c.userId||c.id||'').trim();if(!id)continue;if(unique.has(id))duplicates.add(id);else unique.set(id,c);}
  const capacity=[...unique].filter(([id])=>!duplicates.has(id)).map(([,c])=>coachCapacityEvidence(c));
  const known=capacity.filter(c=>c.loadRatio!==null);
  groups.push({title:'Capacidad del equipo · registros visibles',rows:[row('Perfiles Coach sin duplicados',capacity.length),row('Capacidad cuantificable',known.length),row('Sin capacidad cuantificable',capacity.length-known.length),row('Entre 85% y menos de 100%',known.filter(c=>c.loadRatio>=.85&&c.loadRatio<1).length),row('Al 100% o superior',known.filter(c=>c.loadRatio>=1).length)]});
 }
 if(adminCan(admin,C.OPERATION_READ)){
  const t=deriveAdminOperationsTriage({tasks:adminCollection(state,'operationalTasks'),now:validTime||new Date(),timeZone:admin.organization?.timezone||'America/Santiago'});
  groups.push({title:'Control operativo · registros visibles',rows:[row('Incidencias abiertas verificadas',t.open.length),row('Prioridad alta o crítica',t.open.filter(x=>x.priorityRank<=1).length),row('Vencidas',validTime?t.open.filter(x=>x.overdue).length:null,'Sin fecha de corte del servidor no se calcula vencimiento.'),row('Pendientes de verificación',t.unverifiedCount)]});
 }
 return Object.freeze({asOf:validTime?validTime.toISOString():null,groups:Object.freeze(groups.map(g=>Object.freeze({...g,rows:Object.freeze(g.rows)}))),scope:'Registros visibles según permisos; no certifica cobertura de toda la organización.'});
}
export function renderBusinessReportContent(report){
 if(!report)return '';
 const table=report.groups.map(g=>'<section class="m26-business-group"><h3>'+esc(g.title)+'</h3><dl>'+g.rows.map(r=>'<div><dt>'+esc(r.label)+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</dt><dd>'+esc(r.value===null?'Sin datos':r.value)+'</dd></div>').join('')+'</dl></section>').join('');
 return '<p class="m26-business-scope">'+esc(report.scope)+' Fecha de corte del servidor: '+esc(report.asOf??'no disponible')+'.</p>'+table+'<p class="m26-business-scope">Los estados operativos no equivalen a abandono, impago, resultados de salud ni tasas históricas. No contiene expedientes individuales.</p>';
}
export function buildBusinessReportHtml(report){
 if(!report)throw Error('M26_BUSINESS_REPORT_FORBIDDEN');
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IBERFIT · Informe de dirección</title><meta name="robots" content="noindex,nofollow,noarchive"><link rel="stylesheet" href="/m26/business-report.css?v=elite-1"></head><body><button id="print" type="button">Imprimir / guardar PDF</button><header><p>IBERFIT · USO INTERNO</p><h1>Informe de dirección</h1>Gestión del servicio y capacidad operativa</header>'+renderBusinessReportContent(report)+'<footer>IBERFIT · Informe agregado de consulta interna, no archivado ni firmado.</footer></body></html>';
}
export function openBusinessReport(report,scope=globalThis){
 const origin=scope.location?.origin;
 if(!origin||!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))throw Error('M26_BUSINESS_REPORT_ORIGIN_INVALID');
 const html=buildBusinessReportHtml(report).replace('href="/m26/business-report.css','href="'+origin+'/m26/business-report.css');
 const w=scope.open?.('about:blank','_blank');
 if(!w)throw Error('M26_BUSINESS_REPORT_POPUP_BLOCKED');
 try{
  w.opener=null;
  // Parse the escaped, internally generated report in an inert document and
  // import its DOM into the user-opened window; never stream executable HTML.
  const parsed=new scope.DOMParser().parseFromString(html,'text/html');
  const doc=w.document;
  const root=doc.importNode(parsed.documentElement,true);
  if(!root.querySelector('#print'))throw Error('M26_BUSINESS_REPORT_PRINT_CONTROL_MISSING');
  const doctype=doc.implementation.createDocumentType('html','','');
  doc.replaceChildren(doctype,root);
  doc.getElementById('print').addEventListener('click',()=>w.print());
  return true;
 }catch(e){w.close?.();throw e;}
}
