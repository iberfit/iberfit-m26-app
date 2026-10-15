import {buildProgressHub} from '../engagement/progress-hub.js';
import {openEvolutionReportPreview} from './evolution-report-document.js';
import {createM26Id} from '../platform/id.js';
import {confirmedSessionExecutionsForClient,sessionExecutionId} from '../domain/session-execution-truth.js';
import {IRI_INITIAL_DIAGNOSTIC_KIND} from './iri-2-longitudinal.js';

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const DAY_MS=86_400_000;
const PREMIUM_TYPES=new Set(['iri','post-session','weekly','monthly','reassessment','quarterly','year-in-iberfit']);
export const PREMIUM_REPORT_MODEL_VERSION='iri2-premium-report-v1';
export const PREMIUM_REPORT_TYPES=Object.freeze([
  Object.freeze({id:'iri',label:'Diagnóstico IRI',cadence:'evaluación'}),
  Object.freeze({id:'post-session',label:'Informe post-sesión',cadence:'sesión'}),
  Object.freeze({id:'weekly',label:'Resumen semanal de entrenamiento',cadence:'semanal'}),
  Object.freeze({id:'monthly',label:'Informe mensual',cadence:'mensual'}),
  Object.freeze({id:'reassessment',label:'Informe de reevaluación',cadence:'reevaluación'}),
  Object.freeze({id:'quarterly',label:'Informe trimestral',cadence:'trimestral'}),
  Object.freeze({id:'year-in-iberfit',label:'Year in IBERFIT',cadence:'anual'}),
]);

function cleanText(value,max){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
function safeId(value){const id=String(value||'').trim();return SAFE_ID.test(id)?id:null;}
function validDate(value){const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const date=new Date(`${text}T00:00:00Z`);if(!Number.isFinite(date.getTime()))return null;return date.toISOString().slice(0,10)===text?text:null;}
function reportType(value){const type=String(value||'').trim();return PREMIUM_TYPES.has(type)?type:null;}
function evidenceRows(value){return Object.freeze((Array.isArray(value)?value:[]).slice(0,12).map((item)=>Object.freeze({label:cleanText(item?.label,120),text:cleanText(item?.text,500),source:cleanText(item?.source,120),quality:cleanText(item?.quality,80)})).filter((item)=>item.label&&item.text&&item.source));}
function recordBody(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record||{};}
function recordValue(record,...keys){const source=recordBody(record);for(const key of keys){const candidate=record?.[key]??source?.[key];if(candidate!==undefined&&candidate!==null&&candidate!=='')return candidate;}return null;}
function clientOf(record){return String(recordValue(record,'clientId','client_id')||'').trim();}
function recordsForClient(state,key,clientId){return (state?.collections?.[key]||[]).filter((record)=>clientOf(record)===String(clientId||''));}
function civil(value){const match=String(value||'').trim().match(/^(\d{4}-\d{2}-\d{2})/);if(!match)return null;const date=new Date(`${match[1]}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===match[1]?match[1]:null;}
function recordDate(record){return civil(recordValue(record,'completedAt','completed_at','executedAt','executed_at','assessmentDate','assessment_date','evaluatedAt','evaluated_at','startAt','start_at','scheduledAt','scheduled_at','date','createdAt','created_at'));}
function timestamp(date){return date?new Date(`${date}T00:00:00Z`).getTime():NaN;}
function sortNewest(records){return [...records].sort((a,b)=>(timestamp(recordDate(b))||0)-(timestamp(recordDate(a))||0));}
function uniqueConfirmedExecutions(records){const seen=new Set();return sortNewest(records).filter((record)=>{const id=sessionExecutionId(record);if(!id)return true;if(seen.has(id))return false;seen.add(id);return true;});}
function dateOffset(endDate,days){const time=timestamp(endDate);if(!Number.isFinite(time))return null;return new Date(time-(Math.max(1,days)-1)*DAY_MS).toISOString().slice(0,10);}
function inWindow(record,start,end){const date=recordDate(record);return Boolean(date&&date>=start&&date<=end);}
function confirmedIri(record){const status=String(recordValue(record,'status','estado')||'').toLowerCase();return Boolean(recordValue(record,'firstSessionCompletedAt','first_session_completed_at'))||/(?:complet|confirmad|approved|aprob)/i.test(status);}
function isInitialIri(record){
  const type=String(recordValue(record,'assessmentType','assessment_type','type','assessmentKind','kind','phase')||'').trim().toLowerCase();
  // Historical untyped assessment rows remain readable; explicitly typed
  // follow-up records must never be projected as the initial diagnosis.
  return !type||['inicial','initial',IRI_INITIAL_DIAGNOSTIC_KIND].includes(type);
}
function objectiveMeasurement(candidate){if(candidate===null||candidate===undefined||candidate==='')return false;if(Array.isArray(candidate))return candidate.some(objectiveMeasurement);if(typeof candidate==='object')return Object.values(candidate).some(objectiveMeasurement);if(typeof candidate==='number')return Number.isFinite(candidate);if(typeof candidate==='string')return candidate.trim()!==''&&Number.isFinite(Number(candidate));return false;}
function iriCoverage(record){if(!record)return 0;const finalHr=recordValue(record,'stepFinalHr','step_final_hr'),oneMinuteHr=recordValue(record,'stepOneMinuteHr','step_one_minute_hr');const cardio=objectiveMeasurement(finalHr)&&objectiveMeasurement(oneMinuteHr);const composition=objectiveMeasurement(recordValue(record,'bodyComposition','body_composition'));const strength=objectiveMeasurement(recordValue(record,'strengthPatterns','strength_patterns'));return [cardio,composition,strength].filter(Boolean).length;}
function evidence(label,value,source,quality='confirmada'){return Object.freeze({label,text:cleanText(value,500),source,quality});}
function normalizedRevision(value){if(value===null||value===undefined||value==='')return null;const revision=Number(value);return Number.isInteger(revision)&&revision>=0?revision:null;}
function reportModel({id,label,ready,reason,periodStart,periodEnd,title,summary,conclusions,recommendations,evidence=[],assessmentId=null,assessmentRevision=null,sourceType=null,sourceId=null}){return Object.freeze({id,label,status:ready?'ready':'insufficient-data',ready:Boolean(ready),reason:ready?null:cleanText(reason,500),periodStart:periodStart||null,periodEnd:periodEnd||null,title:cleanText(title,140),summary:cleanText(summary,2500),conclusions:cleanText(conclusions,2500),recommendations:cleanText(recommendations,2500),evidence:Object.freeze(evidence),assessmentId:assessmentId?String(assessmentId):null,assessmentRevision:normalizedRevision(assessmentRevision),sourceType,sourceId,coachComment:'',coachCommentLabel:'Comentario del coach',dataPolicy:'canonical-only'});}
function iriId(record){return recordValue(record,'id');}
function sessionLabel(record){return cleanText(recordValue(record,'title','name','nombre')||'Sesión IBERFIT',120);}
function narrative(parts){return parts.filter(Boolean).join(' ');}

export function buildPremiumReportPortfolio(state,clientId,{now=new Date()}={}){
  if(!clientId)return Object.freeze([]);
  const end=new Date(now).toISOString().slice(0,10);
  const iris=sortNewest(recordsForClient(state,'iriAssessments',clientId).filter(record=>confirmedIri(record)&&isInitialIri(record)));
  const executions=uniqueConfirmedExecutions(confirmedSessionExecutionsForClient(state,clientId,{requireCompleted:true,requireDate:true})).filter(record=>recordDate(record)&&recordDate(record)<=end);
  // The first confirmed initial assessment is the diagnostic baseline.
  // A more recent assessment of type "inicial" must not silently replace it.
  const latestIri=[...iris].sort((a,b)=>{
    const at=timestamp(recordDate(a)),bt=timestamp(recordDate(b));
    const byDate=(Number.isFinite(at)?at:Infinity)-(Number.isFinite(bt)?bt:Infinity);
    return Number.isFinite(byDate)&&byDate!==0?byDate:
      (normalizedRevision(recordValue(b,'revision'))??-1)-(normalizedRevision(recordValue(a,'revision'))??-1);
  })[0]||null;
  const latestExecution=executions[0]||null;
  const progress=buildProgressHub(state,clientId,{now});
  const progressEvidence=(progress?.pillars||[]).filter((pillar)=>pillar.status!=='insufficient');
  const latestIriDate=recordDate(latestIri);
  const latestSessionDate=recordDate(latestExecution);
  const assessmentId=iriId(latestIri);
  const assessmentRevision=normalizedRevision(recordValue(latestIri,'revision'));
  const coverage=iriCoverage(latestIri);
  const weeklyStart=dateOffset(end,7);
  const monthlyStart=dateOffset(end,30);
  const quarterlyStart=dateOffset(end,90);
  const yearlyStart=dateOffset(end,365);
  const weeklySessions=executions.filter((record)=>inWindow(record,weeklyStart,end));
  const monthlySessions=executions.filter((record)=>inWindow(record,monthlyStart,end));
  const quarterlySessions=executions.filter((record)=>inWindow(record,quarterlyStart,end));
  const yearlySessions=executions.filter((record)=>inWindow(record,yearlyStart,end));
  const datedHistory=executions.map(recordDate).filter(Boolean).sort();
  const historyDays=datedHistory.length?Math.floor((timestamp(end)-timestamp(datedHistory[0]))/DAY_MS)+1:0;
  // A confirmed shell without measured domains is not a releasable IRI diagnosis.
  const iriReady=Boolean(latestIri&&latestIriDate&&coverage>0);
  const iriReport=reportModel({id:'iri',label:'Diagnóstico IRI',ready:iriReady,reason:'Se necesita una evaluación IRI inicial confirmada con alguna medición objetiva registrada para generar este documento.',periodStart:latestIriDate,periodEnd:latestIriDate,assessmentId,assessmentRevision,sourceType:'iri_assessment',sourceId:assessmentId||null,title:'Diagnóstico IRI',summary:iriReady?`Evaluación IRI confirmada el ${latestIriDate}, con evidencia objetiva registrada en ${coverage} de 3 dominios.`:'',conclusions:iriReady?'El informe conserva únicamente los dominios medidos y mantiene como no evaluado cualquier dominio sin evidencia confirmada.':'',recommendations:iriReady?'Revisar el diagnóstico IRI confirmado y definir los próximos pasos de entrenamiento según los resultados registrados.':'',evidence:iriReady?[evidence('Cobertura objetiva',`${coverage} de 3 dominios registrados`,'iriAssessments')]:[]});
  const postReady=Boolean(latestExecution&&latestSessionDate&&sessionExecutionId(latestExecution));
  const postReport=reportModel({id:'post-session',label:'Informe post-sesión',ready:postReady,reason:'Se necesita al menos una ejecución de sesión confirmada e identificable.',periodStart:latestSessionDate,periodEnd:latestSessionDate,sourceType:'session_execution',sourceId:latestExecution?sessionExecutionId(latestExecution):null,title:latestExecution?`Post-sesión · ${sessionLabel(latestExecution)}`:'Informe post-sesión',summary:postReady?`Sesión confirmada el ${latestSessionDate}: ${sessionLabel(latestExecution)}. El documento se limita a la evidencia registrada en la ejecución.`:'',conclusions:postReady?'La sesión consta como ejecutada en el historial canónico del cliente; no se añaden métricas que no estén registradas.':'',recommendations:postReady?'Añadir la interpretación profesional del coach y utilizarla para orientar la siguiente sesión sin modificar automáticamente la planificación.':'',evidence:postReady?[evidence('Sesión confirmada',`${sessionLabel(latestExecution)} · ${latestSessionDate}`,'sessionExecutions')]:[]});

  // An observed Health Connect activity is never a confirmed IBERFIT execution.
  // The weekly summary deliberately uses only canonical completed sessions.
  const weeklyDays=new Set(weeklySessions.map(recordDate).filter(Boolean)).size;
  const weeklyReady=weeklySessions.length>0;
  const weeklyReport=reportModel({
    id:'weekly',label:'Resumen semanal de entrenamiento',ready:weeklyReady,
    reason:'Se necesita al menos una sesión IBERFIT finalizada y confirmada durante los últimos 7 días.',
    periodStart:weeklyStart,periodEnd:end,sourceType:'session_execution_period',
    title:'Resumen semanal de entrenamiento',
    summary:weeklyReady?`En los últimos 7 días se han confirmado ${weeklySessions.length} ${weeklySessions.length===1?'sesión':'sesiones'} de entrenamiento en ${weeklyDays} día${weeklyDays===1?'':'s'}.`:'',
    conclusions:weeklyReady?'Este resumen refleja únicamente sesiones IBERFIT realmente finalizadas; las actividades detectadas por un dispositivo no se consideran sesiones confirmadas.':'',
    recommendations:weeklyReady?'Revisar los resultados y el esfuerzo registrados en cada sesión y acordar con el coach la planificación de la siguiente semana.':'',
    evidence:weeklyReady?[
      evidence('Sesiones confirmadas',String(weeklySessions.length),'sessionExecutions'),
      evidence('Días con entrenamiento confirmado',String(weeklyDays),'sessionExecutions'),
      evidence('Última sesión confirmada',`${sessionLabel(weeklySessions[0])} · ${recordDate(weeklySessions[0])}`,'sessionExecutions'),
    ]:[],
  });
  const monthlyReady=Boolean(monthlySessions.length>0&&progressEvidence.length>0);
  const monthlyReport=reportModel({id:'monthly',label:'Informe mensual',ready:monthlyReady,reason:'Se necesita al menos una sesión confirmada y una señal de progreso con evidencia en los últimos 30 días.',periodStart:monthlyStart,periodEnd:end,sourceType:'session_execution_period',title:'Informe mensual IBERFIT',summary:monthlyReady?`En los últimos 30 días constan ${monthlySessions.length} ${monthlySessions.length===1?'sesión ejecutada':'sesiones ejecutadas'} y ${progressEvidence.length} área${progressEvidence.length===1?'':'s'} del Progress Hub con evidencia reciente.`:'',conclusions:monthlyReady?narrative(progressEvidence.slice(0,3).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',recommendations:monthlyReady?'Revisar con el cliente la evolución del periodo y registrar el comentario profesional antes de aprobar o publicar el informe.':'',evidence:monthlyReady?[evidence('Sesiones ejecutadas',String(monthlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,4).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[]});
  // A second initial IRI is not a follow-up measurement. Until the canonical
  // evolution-followup source and protocol comparator are wired end-to-end,
  // do not offer an invented reassessment based on assessment recency.
  const reassessmentReport=reportModel({
    id:'reassessment',label:'Informe de reevaluación',ready:false,
    reason:'Se necesitan mediciones de seguimiento confirmadas, fechadas y comparables por protocolo. Dos diagnósticos IRI iniciales no constituyen una reevaluación.',
    periodStart:null,periodEnd:null,title:'Reevaluación IBERFIT',
    summary:'',conclusions:'',recommendations:'',evidence:[],
  });
  const quarterlyReady=Boolean(quarterlySessions.length>0&&progressEvidence.length>=2);
  const quarterlyReport=reportModel({id:'quarterly',label:'Informe trimestral',ready:quarterlyReady,reason:'Se necesita al menos una sesión confirmada y dos áreas de progreso con evidencia suficiente en el seguimiento reciente.',periodStart:quarterlyStart,periodEnd:end,sourceType:'session_execution_period',title:'Informe trimestral IBERFIT',summary:quarterlyReady?`En la ventana de 90 días constan ${quarterlySessions.length} sesiones ejecutadas y ${progressEvidence.length} áreas de progreso con evidencia confirmada.`:'',conclusions:quarterlyReady?narrative(progressEvidence.slice(0,4).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',recommendations:quarterlyReady?'Revisar objetivos, continuidad y próximos hitos con el cliente antes de aprobar el informe trimestral.':'',evidence:quarterlyReady?[evidence('Sesiones ejecutadas',String(quarterlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,5).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[]});
  const yearReady=Boolean(historyDays>=300&&yearlySessions.length>0&&progressEvidence.length>0);
  const yearReport=reportModel({id:'year-in-iberfit',label:'Year in IBERFIT',ready:yearReady,reason:'Se necesitan al menos 300 días de historial de entrenamiento confirmado, una sesión ejecutada en el último año y evidencia reciente de progreso.',periodStart:yearlyStart,periodEnd:end,sourceType:'session_execution_period',title:'Year in IBERFIT',summary:yearReady?`El historial canónico cubre ${historyDays} días y registra ${yearlySessions.length} sesiones ejecutadas en los últimos 365 días.`:'',conclusions:yearReady?narrative(progressEvidence.slice(0,4).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',recommendations:yearReady?'Cerrar el año con la interpretación del coach, reconocer los hitos confirmados y acordar el siguiente ciclo de objetivos.':'',evidence:yearReady?[evidence('Historial disponible',`${historyDays} días`,'canonical-store'),evidence('Sesiones del último año',String(yearlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,4).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[]});
  return Object.freeze([iriReport,postReport,weeklyReport,monthlyReport,reassessmentReport,quarterlyReport,yearReport]);
}

export function premiumReportByType(state,clientId,type,options={}){return buildPremiumReportPortfolio(state,clientId,options).find((report)=>report.id===String(type||''))||null;}
export function premiumReportUiCandidates(state,role,clientId,options={}){const normalizedRole=String(role||'').trim().toLowerCase();if(!['coach','admin'].includes(normalizedRole)||!clientId)return Object.freeze([]);return buildPremiumReportPortfolio(state,clientId,options);}

function premiumEvidenceSignature(candidate){return JSON.stringify({modelVersion:PREMIUM_REPORT_MODEL_VERSION,id:candidate?.id||null,assessmentId:candidate?.id==='iri'?(candidate?.assessmentId||null):null,assessmentRevision:candidate?.id==='iri'?normalizedRevision(candidate?.assessmentRevision):null,sourceType:candidate?.sourceType||null,sourceId:candidate?.sourceId||null,periodStart:candidate?.periodStart||null,periodEnd:candidate?.periodEnd||null,evidence:(candidate?.evidence||[]).map((row)=>[row.label,row.text,row.source,row.quality])});}
function premiumPortfolioSignature(portfolio){return JSON.stringify((portfolio||[]).map((candidate)=>[candidate.id,candidate.ready,candidate.periodStart,candidate.periodEnd,candidate.reason,premiumEvidenceSignature(candidate)]));}
const PREMIUM_REPORT_UI_STYLE_ID='m26-premium-report-ui-style';
function browserReportContext(scope=globalThis){const app=scope?.__IBERFIT_M26_APP__;const state=app?.getState?.()||null;const role=String(state?.identity?.role||'').trim().toLowerCase();const clientId=role==='client'?state?.identity?.clientId:state?.selectedClientId;return {state,role,clientId:String(clientId||'').trim()};}
function reportFormValue(form,name){return String(form?.elements?.namedItem?.(name)?.value||'').trim();}
function setReportFormValue(form,name,value){const field=form?.elements?.namedItem?.(name);if(!field)return false;field.value=value==null?'':String(value);const EventCtor=form?.ownerDocument?.defaultView?.Event||globalThis.Event;if(typeof EventCtor==='function')field.dispatchEvent?.(new EventCtor('input',{bubbles:true}));return true;}
function premiumMetadataFromActiveEditor(draft,scope=globalThis){
  const document=scope?.document;if(!document?.querySelector)return null;const form=document.querySelector('[data-workflow-form="report-approval"]');if(!form)return null;
  const type=reportType(reportFormValue(form,'reportType'));if(!type)return null;
  const context=browserReportContext(scope);if(!context.state||!['coach','admin'].includes(context.role)||context.clientId!==String(draft?.clientId||''))return null;
  const candidate=premiumReportByType(context.state,context.clientId,type,{now:new Date()});const expectedSignature=reportFormValue(form,'premiumEvidenceSignature');const evidenceSignature=premiumEvidenceSignature(candidate);
  const sameEvidence=Boolean(candidate?.ready&&(candidate.assessmentId||'')===String(draft?.assessmentId||'')&&candidate.periodStart===String(draft?.periodStart||'')&&candidate.periodEnd===String(draft?.periodEnd||'')&&expectedSignature&&evidenceSignature===expectedSignature);
  if(!sameEvidence)throw new Error('M26_REPORT_DRAFT_INVALID:premium-evidence-stale');
  return {reportType:type,coachComment:reportFormValue(form,'coachComment'),evidence:candidate.evidence,reportModelVersion:PREMIUM_REPORT_MODEL_VERSION,evidenceSignature,sourceAssessmentId:type==='iri'?candidate.assessmentId:null,sourceAssessmentRevision:type==='iri'?candidate.assessmentRevision:null,sourceType:candidate.sourceType,sourceId:candidate.sourceId};
}
function ensurePremiumReportStyles(document){
  return Boolean(document?.head);
}
function createTextElement(document,tag,text,className=''){const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(text||'');return node;}
function ensureHiddenField(form,document,name){if(form?.elements?.namedItem?.(name))return;const hidden=document.createElement('input');hidden.type='hidden';hidden.name=name;hidden.value='';form.append(hidden);}
function ensurePremiumEditorFields(form,document){
  ensureHiddenField(form,document,'reportType');ensureHiddenField(form,document,'premiumEvidenceSignature');
  if(!form?.elements?.namedItem?.('coachComment')){const label=document.createElement('label');label.className='m26-premium-coach-comment';label.append(createTextElement(document,'span','Comentario del coach'));const textarea=document.createElement('textarea');textarea.name='coachComment';textarea.maxLength=2500;textarea.placeholder='Interpretación profesional, contexto o próximos pasos que quieras dejar registrados.';label.append(textarea);const approve=form.querySelector?.('[data-workflow-action="approve-report"]');if(approve)approve.before(label);else form.append(label);}
  if(!form.querySelector?.('[data-m44-report-preview]')){
    const button=document.createElement('button');button.type='button';
    button.dataset.m44ReportPreview='true';button.textContent='Vista previa editorial A4';
    button.setAttribute('aria-label','Abrir vista previa privada del informe de evolución en formato A4');
    const actions=form.querySelector?.('.m26-inline-actions');
    if(actions)actions.append(button);else form.append(button);
  }
}
function renderPremiumReportCards(host,portfolio,document){
  host.replaceChildren();const intro=document.createElement('div');intro.className='m26-panel-heading';const copy=document.createElement('div');copy.append(createTextElement(document,'p','Informes automáticos','m26-eyebrow'),createTextElement(document,'h2','Preparar desde evidencia real'),createTextElement(document,'p','Selecciona un formato disponible. IBERFIT precarga únicamente datos canónicos; el Coach revisa y aprueba antes de cualquier publicación.'));intro.append(copy);host.append(intro);
  const availability=portfolio.filter(candidate=>candidate.ready).length;copy.append(createTextElement(document,'p',`${availability} de ${portfolio.length} informes disponibles para revisar. Los demás explican qué evidencia falta.`,'m26-premium-report-availability'));const grid=document.createElement('div');grid.className='m26-premium-report-grid';
  for(const candidate of portfolio){const card=document.createElement('article');card.className='m26-premium-report-card';card.dataset.ready=candidate.ready?'true':'false';card.append(createTextElement(document,'span',candidate.ready?'Listo para revisar':'Datos insuficientes','m26-premium-report-state'),createTextElement(document,'h3',candidate.label));const period=candidate.periodStart&&candidate.periodEnd?`${candidate.periodStart} → ${candidate.periodEnd}`:candidate.reason;card.append(createTextElement(document,'p',period||'Sin periodo disponible'));if(candidate.ready&&candidate.evidence.length){const list=document.createElement('ul');list.className='m26-premium-report-evidence';for(const row of candidate.evidence.slice(0,3))list.append(createTextElement(document,'li',`${row.label}: ${row.text}`));card.append(list);}if(candidate.ready){const button=document.createElement('button');button.type='button';button.dataset.premiumReportType=candidate.id;button.textContent='Preparar borrador';card.append(button);}else{card.append(createTextElement(document,'p',candidate.reason||'Todavía no hay evidencia suficiente.'));}grid.append(card);}
  host.append(grid);
}
function prefillPremiumReport(form,candidate){
  // Switching candidates always starts a new report identity; never reuse an older report ID.
  setReportFormValue(form,'entityId','');
  setReportFormValue(form,'reportType',candidate.id);setReportFormValue(form,'premiumEvidenceSignature',premiumEvidenceSignature(candidate));setReportFormValue(form,'assessmentId',candidate.assessmentId);setReportFormValue(form,'title',candidate.title);setReportFormValue(form,'periodStart',candidate.periodStart);setReportFormValue(form,'periodEnd',candidate.periodEnd);setReportFormValue(form,'summary',candidate.summary);setReportFormValue(form,'conclusions',candidate.conclusions);setReportFormValue(form,'recommendations',candidate.recommendations);setReportFormValue(form,'coachComment','');const review=form.elements?.namedItem?.('reviewAccepted');if(review)review.checked=false;const status=form.ownerDocument?.querySelector?.('[data-workflow-status="report"]');if(status){status.textContent=`${candidate.label} preparado con evidencia canónica. Revisa el contenido y añade tu comentario antes de aprobar.`;status.dataset.status='info';}form.scrollIntoView?.({behavior:'smooth',block:'start'});form.querySelector?.('[name="summary"]')?.focus?.({preventScroll:true});
}
export function installPremiumReportUi({scope=globalThis,root=scope?.document?.querySelector?.('#app')}={}){
  const document=scope?.document;if(!document?.createElement||!root?.addEventListener||typeof scope.MutationObserver!=='function')return null;if(scope.__IBERFIT_M26_PREMIUM_REPORT_UI__)return scope.__IBERFIT_M26_PREMIUM_REPORT_UI__;ensurePremiumReportStyles(document);let destroyed=false;
  function enhance(){
    if(destroyed)return false;const form=root.querySelector?.('[data-workflow-form="report-approval"]');if(!form)return false;const context=browserReportContext(scope);
    if(!context.state||!['coach','admin'].includes(context.role)||!context.clientId){root.querySelector?.('[data-premium-report-candidates]')?.remove?.();return false;}
    ensurePremiumEditorFields(form,document);let host=root.querySelector?.('[data-premium-report-candidates]');if(!host){host=document.createElement('section');host.className='m26-panel m26-panel-soft';host.dataset.premiumReportCandidates='true';form.before(host);}
    const portfolio=premiumReportUiCandidates(context.state,context.role,context.clientId,{now:new Date()});const signature=premiumPortfolioSignature(portfolio);if(host.dataset.premiumReportSignature!==signature){renderPremiumReportCards(host,portfolio,document);host.dataset.premiumReportSignature=signature;}return true;
  }
  async function onClick(event){
    const preview=event.target?.closest?.('[data-m44-report-preview]');
    if(preview&&root.contains?.(preview)){
      event.preventDefault?.();
      const form=preview.closest?.('[data-workflow-form="report-approval"]');
      const context=browserReportContext(scope);
      const message=(detail,tone='error')=>{
        const target=root.querySelector?.('[data-workflow-status="report"]');
        if(target){target.textContent=detail;target.dataset.status=tone;}
      };
      if(!form||!context.state||!['coach','admin'].includes(context.role)||!context.clientId){
        message('No tienes acceso a la previsualización de este expediente.');return;
      }
      const type=reportType(reportFormValue(form,'reportType'));
      if(!type||type==='iri'||type==='reassessment'){
        message('Elige primero un informe de entrenamiento con evidencia confirmada. El IRI y la reevaluación tienen circuitos propios.','info');return;
      }
      const candidate=premiumReportByType(context.state,context.clientId,type,{now:new Date()});
      if(!candidate?.ready||!candidate.evidence?.length){
        message('No existe evidencia suficiente para preparar este informe.');return;
      }
      if(reportFormValue(form,'premiumEvidenceSignature')!==premiumEvidenceSignature(candidate)
        ||reportFormValue(form,'periodStart')!==candidate.periodStart
        ||reportFormValue(form,'periodEnd')!==candidate.periodEnd){
        message('La evidencia o la ventana han cambiado. Selecciona de nuevo el formato antes de crear la vista previa.');return;
      }
      const client=(context.state?.collections?.clients||[]).find(item=>
        String(recordValue(item,'id')||'')===context.clientId);
      const clientName=cleanText(recordValue(client,'displayName','fullName','name','nombre')||'Cliente IBERFIT',130);
      const actor=context.state.identity||{};
      const coachName=cleanText(actor.fullName||actor.name||'Equipo IBERFIT',130);
      const edited={
        ...candidate,
        title:reportFormValue(form,'title'),
        summary:reportFormValue(form,'summary'),
        conclusions:reportFormValue(form,'conclusions'),
        recommendations:reportFormValue(form,'recommendations'),
        coachComment:reportFormValue(form,'coachComment'),
      };
      try{
        // Open synchronously from the user gesture. No command, remote write or publish.
        openEvolutionReportPreview({report:edited,clientName,coachName,scope});
        message('Vista previa privada abierta. No se ha aprobado ni publicado nada.','info');
      }catch(error){
        message(error?.message==='M44_REPORT_PREVIEW_POPUP_BLOCKED'
          ?'El navegador ha bloqueado la ventana. Permite ventanas de IBERFIT para previsualizar el informe.'
          :'No fue posible preparar la vista previa A4. Conservamos el borrador sin cambios.');
      }
      return;
    }
    const button=event.target?.closest?.('[data-premium-report-type]');
    if(!button||!root.contains?.(button))return;
    const form=root.querySelector?.('[data-workflow-form="report-approval"]');
    if(!form)return;
    const context=browserReportContext(scope);
    if(!context.state||!['coach','admin'].includes(context.role))return;
    const candidate=premiumReportByType(context.state,context.clientId,button.dataset.premiumReportType,{now:new Date()});
    if(!candidate?.ready)return;
    const pending={wait:null},EventType=scope.CustomEvent||globalThis.CustomEvent;
    if(typeof EventType==='function')root.dispatchEvent(new EventType('m26:report-before-switch',{detail:pending}));
    try{if(pending.wait)await pending.wait;}
    catch{
      const status=root.querySelector?.('[data-workflow-status="report"]');
      if(status){status.textContent='No pudimos conservar el informe anterior. Comprueba el almacenamiento antes de cambiar de formato.';status.dataset.status='error';}
      return;
    }
    if(!root.contains?.(form)||browserReportContext(scope).clientId!==context.clientId)return;
    prefillPremiumReport(form,candidate);
  }
  const observer=new scope.MutationObserver(()=>enhance());observer.observe(root,{childList:true,subtree:true});root.addEventListener('click',onClick);for(const delay of [0,250,1000,2500])scope.setTimeout?.(()=>enhance(),delay);
  const api=Object.freeze({refresh:enhance,destroy(){destroyed=true;observer.disconnect();root.removeEventListener('click',onClick);if(scope.__IBERFIT_M26_PREMIUM_REPORT_UI__===api)scope.__IBERFIT_M26_PREMIUM_REPORT_UI__=null;}});scope.__IBERFIT_M26_PREMIUM_REPORT_UI__=api;return api;
}
if(typeof globalThis.document!=='undefined'&&typeof globalThis.MutationObserver==='function')globalThis.queueMicrotask?.(()=>{try{installPremiumReportUi();}catch{}});

export function validateReportDraft(draft={}){
  const errors=[];
  if(!safeId(draft.clientId))errors.push('clientId');
  // Only the IRI diagnosis and untyped legacy reports require the initial assessment.
  const type=reportType(draft.reportType);
  if((type==='iri'||draft.reportType==null)&&!safeId(draft.assessmentId))errors.push('assessmentId');
  if(!cleanText(draft.title,140))errors.push('title');
  if(!validDate(draft.periodStart))errors.push('periodStart');
  if(!validDate(draft.periodEnd))errors.push('periodEnd');
  if(draft.periodStart&&draft.periodEnd&&new Date(`${draft.periodEnd}T00:00:00Z`)<new Date(`${draft.periodStart}T00:00:00Z`))errors.push('chronology');
  if(!cleanText(draft.summary,2500))errors.push('summary');
  if(!cleanText(draft.conclusions,2500))errors.push('conclusions');
  if(!cleanText(draft.recommendations,2500))errors.push('recommendations');
  if(draft.reportType!=null&&!reportType(draft.reportType))errors.push('reportType');
  if(draft.reviewAccepted!==true)errors.push('reviewAccepted');
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}
export function normalizeReportDraft(draft={}){
  const check=validateReportDraft(draft);if(!check.ok)throw new Error(`M26_REPORT_DRAFT_INVALID:${check.errors.join(',')}`);
  const normalized={id:safeId(draft.id)||createM26Id(),clientId:safeId(draft.clientId),assessmentId:reportType(draft.reportType)==='iri'||draft.reportType==null?safeId(draft.assessmentId):null,title:cleanText(draft.title,140),periodStart:draft.periodStart,periodEnd:draft.periodEnd,summary:cleanText(draft.summary,2500),conclusions:cleanText(draft.conclusions,2500),recommendations:cleanText(draft.recommendations,2500),format:'a4-premium',visibility:'coach',singleReport:true,status:'aprobado',visibleToClient:false};
  const type=reportType(draft.reportType);if(type)normalized.reportType=type;
  const coachComment=cleanText(draft.coachComment,2500);if(coachComment)normalized.coachComment=coachComment;
  const evidence=evidenceRows(draft.evidence);if(evidence.length)normalized.evidence=evidence;
  if(type){
    normalized.dataPolicy='canonical-only';
    normalized.reportModelVersion=PREMIUM_REPORT_MODEL_VERSION;
    if(type==='iri'){
      normalized.sourceAssessmentId=normalized.assessmentId;
      normalized.sourceAssessmentRevision=normalizedRevision(draft.sourceAssessmentRevision??draft.assessmentRevision);
      normalized.sourceType='iri_assessment';
      normalized.sourceId=normalized.assessmentId;
    }else if(type==='post-session'){
      normalized.sourceType='session_execution';
      normalized.sourceId=safeId(draft.sourceId);
    }else if(['weekly','monthly','quarterly','year-in-iberfit'].includes(type)){
      normalized.sourceType='session_execution_period';
      normalized.sourceId=null;
    }
    normalized.evidenceSignature=premiumEvidenceSignature({id:type,assessmentId:normalized.sourceAssessmentId,assessmentRevision:normalized.sourceAssessmentRevision,sourceType:normalized.sourceType,sourceId:normalized.sourceId,periodStart:normalized.periodStart,periodEnd:normalized.periodEnd,evidence});
  }
  return Object.freeze(normalized);
}
export function buildApproveReportDraftCommand(draft,baseRevision=0){const browserMetadata=premiumMetadataFromActiveEditor(draft);const normalized=normalizeReportDraft(browserMetadata?{...draft,...browserMetadata}:draft);return {type:'INFORME_APROBAR',entityType:'report',entityId:normalized.id,clientId:normalized.clientId,baseRevision:Number.isInteger(Number(baseRevision))&&Number(baseRevision)>=0?Number(baseRevision):0,payload:{patch:structuredClone(normalized)}};}
