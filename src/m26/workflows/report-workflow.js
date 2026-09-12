import {buildProgressHub} from '../engagement/progress-hub.js';
import {createM26Id} from '../platform/id.js';

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const DAY_MS=86_400_000;
const PREMIUM_TYPES=new Set(['iri','post-session','monthly','reassessment','quarterly','year-in-iberfit']);
export const PREMIUM_REPORT_MODEL_VERSION='iri2-premium-report-v1';
export const PREMIUM_REPORT_TYPES=Object.freeze([
  Object.freeze({id:'iri',label:'Diagnóstico IRI',cadence:'evaluación'}),
  Object.freeze({id:'post-session',label:'Informe post-sesión',cadence:'sesión'}),
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
function dateOffset(endDate,days){const time=timestamp(endDate);if(!Number.isFinite(time))return null;return new Date(time-(Math.max(1,days)-1)*DAY_MS).toISOString().slice(0,10);}
function inWindow(record,start,end){const date=recordDate(record);return Boolean(date&&date>=start&&date<=end);}
function confirmedIri(record){const status=String(recordValue(record,'status','estado')||'').toLowerCase();return Boolean(recordValue(record,'firstSessionCompletedAt','first_session_completed_at'))||/(?:complet|confirmad|approved|aprob)/i.test(status);}
function objectiveMeasurement(candidate){if(candidate===null||candidate===undefined||candidate==='')return false;if(Number.isFinite(Number(candidate)))return true;if(Array.isArray(candidate))return candidate.some(objectiveMeasurement);if(typeof candidate==='object')return Object.values(candidate).some(objectiveMeasurement);return false;}
function iriCoverage(record){if(!record)return 0;const cardio=Number.isFinite(Number(recordValue(record,'stepFinalHr','step_final_hr')))&&Number.isFinite(Number(recordValue(record,'stepOneMinuteHr','step_one_minute_hr')));const composition=objectiveMeasurement(recordValue(record,'bodyComposition','body_composition'));const strength=objectiveMeasurement(recordValue(record,'strengthPatterns','strength_patterns'));return [cardio,composition,strength].filter(Boolean).length;}
function evidence(label,value,source,quality='confirmada'){return Object.freeze({label,text:cleanText(value,500),source,quality});}
function normalizedRevision(value){const revision=Number(value);return Number.isInteger(revision)&&revision>=0?revision:null;}
function reportModel({id,label,ready,reason,periodStart,periodEnd,title,summary,conclusions,recommendations,evidence=[],assessmentId=null,assessmentRevision=null}){return Object.freeze({id,label,status:ready?'ready':'insufficient-data',ready:Boolean(ready),reason:ready?null:cleanText(reason,500),periodStart:periodStart||null,periodEnd:periodEnd||null,title:cleanText(title,140),summary:cleanText(summary,2500),conclusions:cleanText(conclusions,2500),recommendations:cleanText(recommendations,2500),evidence:Object.freeze(evidence),assessmentId:assessmentId?String(assessmentId):null,assessmentRevision:normalizedRevision(assessmentRevision),coachComment:'',coachCommentLabel:'Comentario del coach',dataPolicy:'canonical-only'});}
function iriId(record){return recordValue(record,'id');}
function sessionLabel(record){return cleanText(recordValue(record,'title','name','nombre')||'Sesión IBERFIT',120);}
function narrative(parts){return parts.filter(Boolean).join(' ');}

export function buildPremiumReportPortfolio(state,clientId,{now=new Date()}={}){
  if(!clientId)return Object.freeze([]);
  const end=new Date(now).toISOString().slice(0,10);
  const iris=sortNewest(recordsForClient(state,'iriAssessments',clientId).filter(confirmedIri));
  const executions=sortNewest(recordsForClient(state,'sessionExecutions',clientId).filter((record)=>recordDate(record)));
  const latestIri=iris[0]||null;
  const latestExecution=executions[0]||null;
  const progress=buildProgressHub(state,clientId,{now});
  const progressEvidence=(progress?.pillars||[]).filter((pillar)=>pillar.status!=='insufficient');
  const latestIriDate=recordDate(latestIri);
  const latestSessionDate=recordDate(latestExecution);
  const assessmentId=iriId(latestIri);
  const assessmentRevision=normalizedRevision(recordValue(latestIri,'revision'));
  const coverage=iriCoverage(latestIri);
  const monthlyStart=dateOffset(end,30);
  const quarterlyStart=dateOffset(end,90);
  const yearlyStart=dateOffset(end,365);
  const monthlySessions=executions.filter((record)=>inWindow(record,monthlyStart,end));
  const quarterlySessions=executions.filter((record)=>inWindow(record,quarterlyStart,end));
  const yearlySessions=executions.filter((record)=>inWindow(record,yearlyStart,end));
  const datedHistory=[...executions,...iris].map(recordDate).filter(Boolean).sort();
  const historyDays=datedHistory.length?Math.floor((timestamp(end)-timestamp(datedHistory[0]))/DAY_MS)+1:0;
  const iriReady=Boolean(latestIri&&latestIriDate);
  const iriReport=reportModel({id:'iri',label:'Diagnóstico IRI',ready:iriReady,reason:'Se necesita una evaluación IRI confirmada para generar este documento.',periodStart:latestIriDate,periodEnd:latestIriDate,assessmentId,assessmentRevision,title:'Diagnóstico IRI',summary:iriReady?`Evaluación IRI confirmada el ${latestIriDate}, con evidencia objetiva registrada en ${coverage} de 3 dominios.`:'',conclusions:iriReady?'El informe conserva únicamente los dominios medidos y mantiene como no evaluado cualquier dominio sin evidencia confirmada.':'',recommendations:iriReady?'Revisar el diagnóstico IRI confirmado y definir los próximos pasos de entrenamiento según los resultados registrados.':'',evidence:iriReady?[evidence('Cobertura objetiva',`${coverage} de 3 dominios registrados`,'iriAssessments')]:[]});
  const postReady=Boolean(latestExecution&&latestSessionDate&&assessmentId);
  const postReport=reportModel({id:'post-session',label:'Informe post-sesión',ready:postReady,reason:assessmentId?'Se necesita al menos una ejecución de sesión confirmada.':'Se necesita un IRI confirmado y una ejecución de sesión confirmada.',periodStart:latestSessionDate,periodEnd:latestSessionDate,assessmentId,assessmentRevision,title:latestExecution?`Post-sesión · ${sessionLabel(latestExecution)}`:'Informe post-sesión',summary:postReady?`Sesión confirmada el ${latestSessionDate}: ${sessionLabel(latestExecution)}. El documento se limita a la evidencia registrada en la ejecución.`:'',conclusions:postReady?'La sesión consta como ejecutada en el historial canónico del cliente; no se añaden métricas que no estén registradas.':'',recommendations:postReady?'Añadir la interpretación profesional del coach y utilizarla para orientar la siguiente sesión sin modificar automáticamente la planificación.':'',evidence:postReady?[evidence('Sesión confirmada',`${sessionLabel(latestExecution)} · ${latestSessionDate}`,'sessionExecutions')]:[]});
  const monthlyReady=Boolean(assessmentId&&monthlySessions.length>0&&progressEvidence.length>0);
  const monthlyReport=reportModel({id:'monthly',label:'Informe mensual',ready:monthlyReady,reason:assessmentId?'Se necesita al menos una sesión confirmada y una señal de progreso con evidencia en los últimos 30 días.':'Se necesita un IRI confirmado antes de preparar el informe mensual.',periodStart:monthlyStart,periodEnd:end,assessmentId,assessmentRevision,title:'Informe mensual IBERFIT',summary:monthlyReady?`En los últimos 30 días constan ${monthlySessions.length} sesión${monthlySessions.length===1?'':'es'} ejecutada${monthlySessions.length===1?'':'s'} y ${progressEvidence.length} área${progressEvidence.length===1?'':'s'} del Progress Hub con evidencia reciente.`:'',conclusions:monthlyReady?narrative(progressEvidence.slice(0,3).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',recommendations:monthlyReady?'Revisar con el cliente la evolución del periodo y registrar el comentario profesional antes de aprobar o publicar el informe.':'',evidence:monthlyReady?[evidence('Sesiones ejecutadas',String(monthlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,4).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[]});
  const previousIri=iris[1]||null;const previousDate=recordDate(previousIri);const reassessmentReady=Boolean(assessmentId&&previousIri&&latestIriDate&&previousDate);const previousCoverage=iriCoverage(previousIri);
  const reassessmentReport=reportModel({id:'reassessment',label:'Informe de reevaluación',ready:reassessmentReady,reason:'Se necesitan al menos dos evaluaciones IRI confirmadas y fechadas para comparar sin inventar resultados.',periodStart:previousDate,periodEnd:latestIriDate,assessmentId,assessmentRevision,title:'Reevaluación IBERFIT',summary:reassessmentReady?`Comparación entre evaluaciones IRI confirmadas del ${previousDate} y ${latestIriDate}. Cobertura objetiva registrada: ${previousCoverage} de 3 dominios en la evaluación anterior y ${coverage} de 3 en la actual.`:'',conclusions:reassessmentReady?'La comparación se limita a la cobertura y a los resultados realmente registrados en ambas evaluaciones; los dominios ausentes no se estiman.':'',recommendations:reassessmentReady?'Interpretar los cambios con criterio profesional y decidir si corresponde mantener, progresar o revisar la planificación.':'',evidence:reassessmentReady?[evidence('IRI anterior',`${previousDate} · ${previousCoverage}/3 dominios`,'iriAssessments'),evidence('IRI actual',`${latestIriDate} · ${coverage}/3 dominios`,'iriAssessments')]:[]});
  const quarterlyReady=Boolean(assessmentId&&quarterlySessions.length>0&&progressEvidence.length>=2);
  const quarterlyReport=reportModel({id:'quarterly',label:'Informe trimestral',ready:quarterlyReady,reason:assessmentId?'Se necesita al menos una sesión confirmada y dos áreas de progreso con evidencia suficiente en el seguimiento reciente.':'Se necesita un IRI confirmado antes de preparar el informe trimestral.',periodStart:quarterlyStart,periodEnd:end,assessmentId,assessmentRevision,title:'Informe trimestral IBERFIT',summary:quarterlyReady?`En la ventana de 90 días constan ${quarterlySessions.length} sesiones ejecutadas y ${progressEvidence.length} áreas de progreso con evidencia confirmada.`:'',conclusions:quarterlyReady?narrative(progressEvidence.slice(0,4).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',recommendations:quarterlyReady?'Revisar objetivos, continuidad y próximos hitos con el cliente antes de aprobar el informe trimestral.':'',evidence:quarterlyReady?[evidence('Sesiones ejecutadas',String(quarterlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,5).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[]});
  const yearReady=Boolean(assessmentId&&historyDays>=300&&yearlySessions.length>0&&progressEvidence.length>0);
  const yearReport=reportModel({id:'year-in-iberfit',label:'Year in IBERFIT',ready:yearReady,reason:assessmentId?'Se necesitan al menos 300 días de historial canónico, una sesión ejecutada en el último año y evidencia reciente de progreso.':'Se necesita un IRI confirmado antes de construir Year in IBERFIT.',periodStart:yearlyStart,periodEnd:end,assessmentId,assessmentRevision,title:'Year in IBERFIT',summary:yearReady?`El historial canónico cubre ${historyDays} días y registra ${yearlySessions.length} sesiones ejecutadas en los últimos 365 días.`:'',conclusions:yearReady?narrative(progressEvidence.slice(0,4).map((pillar)=>`${pillar.label}: ${pillar.evidence}.`)):'',recommendations:yearReady?'Cerrar el año con la interpretación del coach, reconocer los hitos confirmados y acordar el siguiente ciclo de objetivos.':'',evidence:yearReady?[evidence('Historial disponible',`${historyDays} días`,'canonical-store'),evidence('Sesiones del último año',String(yearlySessions.length),'sessionExecutions'),...progressEvidence.slice(0,4).map((pillar)=>evidence(pillar.label,pillar.evidence,pillar.source,pillar.quality))]:[]});
  return Object.freeze([iriReport,postReport,monthlyReport,reassessmentReport,quarterlyReport,yearReport]);
}

export function premiumReportByType(state,clientId,type,options={}){return buildPremiumReportPortfolio(state,clientId,options).find((report)=>report.id===String(type||''))||null;}
export function premiumReportUiCandidates(state,role,clientId,options={}){const normalizedRole=String(role||'').trim().toLowerCase();if(!['coach','admin'].includes(normalizedRole)||!clientId)return Object.freeze([]);return buildPremiumReportPortfolio(state,clientId,options);}

function premiumEvidenceSignature(candidate){return JSON.stringify({modelVersion:PREMIUM_REPORT_MODEL_VERSION,id:candidate?.id||null,assessmentId:candidate?.assessmentId||null,assessmentRevision:normalizedRevision(candidate?.assessmentRevision),periodStart:candidate?.periodStart||null,periodEnd:candidate?.periodEnd||null,evidence:(candidate?.evidence||[]).map((row)=>[row.label,row.text,row.source,row.quality])});}
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
  const sameEvidence=Boolean(candidate?.ready&&candidate.assessmentId===String(draft?.assessmentId||'')&&candidate.periodStart===String(draft?.periodStart||'')&&candidate.periodEnd===String(draft?.periodEnd||'')&&expectedSignature&&evidenceSignature===expectedSignature);
  if(!sameEvidence)throw new Error('M26_REPORT_DRAFT_INVALID:premium-evidence-stale');
  return {reportType:type,coachComment:reportFormValue(form,'coachComment'),evidence:candidate.evidence,reportModelVersion:PREMIUM_REPORT_MODEL_VERSION,evidenceSignature,sourceAssessmentId:candidate.assessmentId,sourceAssessmentRevision:candidate.assessmentRevision};
}
function ensurePremiumReportStyles(document){
  if(!document?.head||document.getElementById?.(PREMIUM_REPORT_UI_STYLE_ID))return;
  const style=document.createElement('style');style.id=PREMIUM_REPORT_UI_STYLE_ID;
  style.textContent='.m26-premium-report-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.7rem;margin:.75rem 0 1rem}.m26-premium-report-card{display:grid;gap:.48rem;padding:.85rem;border:1px solid var(--m26-border,rgba(33,49,40,.14));border-radius:.9rem;background:var(--m26-surface,#fff)}.m26-premium-report-card h3{margin:0;font-size:.95rem}.m26-premium-report-card p{margin:0;color:var(--m26-text-muted,#6b675f);font-size:.75rem;line-height:1.45}.m26-premium-report-state{font-size:.65rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--m26-gold,#8f7028)}.m26-premium-report-card[data-ready="true"] .m26-premium-report-state{color:var(--m26-success,#356f50)}.m26-premium-report-evidence{display:grid;gap:.2rem;margin:0;padding-left:1rem;color:var(--m26-text-muted,#6b675f);font-size:.7rem}.m26-premium-coach-comment{display:grid;gap:.35rem;margin-top:.6rem}.m26-premium-coach-comment textarea{min-height:5.5rem;resize:vertical}';document.head.append(style);
}
function createTextElement(document,tag,text,className=''){const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(text||'');return node;}
function ensureHiddenField(form,document,name){if(form?.elements?.namedItem?.(name))return;const hidden=document.createElement('input');hidden.type='hidden';hidden.name=name;hidden.value='';form.append(hidden);}
function ensurePremiumEditorFields(form,document){
  ensureHiddenField(form,document,'reportType');ensureHiddenField(form,document,'premiumEvidenceSignature');
  if(!form?.elements?.namedItem?.('coachComment')){const label=document.createElement('label');label.className='m26-premium-coach-comment';label.append(createTextElement(document,'span','Comentario del coach'));const textarea=document.createElement('textarea');textarea.name='coachComment';textarea.maxLength=2500;textarea.placeholder='Interpretación profesional, contexto o próximos pasos que quieras dejar registrados.';label.append(textarea);const approve=form.querySelector?.('[data-workflow-action="approve-report"]');if(approve)approve.before(label);else form.append(label);}
}
function renderPremiumReportCards(host,portfolio,document){
  host.replaceChildren();const intro=document.createElement('div');intro.className='m26-panel-heading';const copy=document.createElement('div');copy.append(createTextElement(document,'p','Informes automáticos','m26-eyebrow'),createTextElement(document,'h2','Preparar desde evidencia real'),createTextElement(document,'p','Selecciona un formato disponible. IBERFIT precarga únicamente datos canónicos; el Coach revisa y aprueba antes de cualquier publicación.'));intro.append(copy);host.append(intro);
  const grid=document.createElement('div');grid.className='m26-premium-report-grid';
  for(const candidate of portfolio){const card=document.createElement('article');card.className='m26-premium-report-card';card.dataset.ready=candidate.ready?'true':'false';card.append(createTextElement(document,'span',candidate.ready?'Listo para revisar':'Datos insuficientes','m26-premium-report-state'),createTextElement(document,'h3',candidate.label));const period=candidate.periodStart&&candidate.periodEnd?`${candidate.periodStart} → ${candidate.periodEnd}`:candidate.reason;card.append(createTextElement(document,'p',period||'Sin periodo disponible'));if(candidate.ready&&candidate.evidence.length){const list=document.createElement('ul');list.className='m26-premium-report-evidence';for(const row of candidate.evidence.slice(0,3))list.append(createTextElement(document,'li',`${row.label}: ${row.text}`));card.append(list);}if(candidate.ready){const button=document.createElement('button');button.type='button';button.dataset.premiumReportType=candidate.id;button.textContent='Preparar borrador';card.append(button);}else{card.append(createTextElement(document,'p',candidate.reason||'Todavía no hay evidencia suficiente.'));}grid.append(card);}
  host.append(grid);
}
function prefillPremiumReport(form,candidate){
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
  function onClick(event){const button=event.target?.closest?.('[data-premium-report-type]');if(!button||!root.contains?.(button))return;const form=root.querySelector?.('[data-workflow-form="report-approval"]');if(!form)return;const context=browserReportContext(scope);const candidate=premiumReportByType(context.state,context.clientId,button.dataset.premiumReportType,{now:new Date()});if(!candidate?.ready)return;prefillPremiumReport(form,candidate);}
  const observer=new scope.MutationObserver(()=>enhance());observer.observe(root,{childList:true,subtree:true});root.addEventListener('click',onClick);for(const delay of [0,250,1000,2500])scope.setTimeout?.(()=>enhance(),delay);
  const api=Object.freeze({refresh:enhance,destroy(){destroyed=true;observer.disconnect();root.removeEventListener('click',onClick);if(scope.__IBERFIT_M26_PREMIUM_REPORT_UI__===api)scope.__IBERFIT_M26_PREMIUM_REPORT_UI__=null;}});scope.__IBERFIT_M26_PREMIUM_REPORT_UI__=api;return api;
}
if(typeof globalThis.document!=='undefined'&&typeof globalThis.MutationObserver==='function')globalThis.queueMicrotask?.(()=>{try{installPremiumReportUi();}catch{}});

export function validateReportDraft(draft={}){
  const errors=[];
  if(!safeId(draft.clientId))errors.push('clientId');
  if(!safeId(draft.assessmentId))errors.push('assessmentId');
  if(!cleanText(draft.title,140))errors.push('title');
  if(!validDate(draft.periodStart))errors.push('periodStart');
  if(!validDate(draft.periodEnd))errors.push('periodEnd');
  if(draft.periodStart&&draft.periodEnd&&new Date(`${draft.periodEnd}T00:00:00Z`)<new Date(`${draft.periodStart}T00:00:00Z`))errors.push('chronology');
  if(cleanText(draft.summary,2500).length<20)errors.push('summary');
  if(cleanText(draft.conclusions,2500).length<20)errors.push('conclusions');
  if(cleanText(draft.recommendations,2500).length<20)errors.push('recommendations');
  if(draft.reportType!=null&&!reportType(draft.reportType))errors.push('reportType');
  if(draft.reviewAccepted!==true)errors.push('reviewAccepted');
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}
export function normalizeReportDraft(draft={}){
  const check=validateReportDraft(draft);if(!check.ok)throw new Error(`M26_REPORT_DRAFT_INVALID:${check.errors.join(',')}`);
  const normalized={id:safeId(draft.id)||createM26Id(),clientId:safeId(draft.clientId),assessmentId:safeId(draft.assessmentId),title:cleanText(draft.title,140),periodStart:draft.periodStart,periodEnd:draft.periodEnd,summary:cleanText(draft.summary,2500),conclusions:cleanText(draft.conclusions,2500),recommendations:cleanText(draft.recommendations,2500),format:'a4-premium',visibility:'coach',singleReport:true,status:'aprobado',visibleToClient:false};
  const type=reportType(draft.reportType);if(type)normalized.reportType=type;
  const coachComment=cleanText(draft.coachComment,2500);if(coachComment)normalized.coachComment=coachComment;
  const evidence=evidenceRows(draft.evidence);if(evidence.length)normalized.evidence=evidence;
  if(type){
    normalized.dataPolicy='canonical-only';
    normalized.reportModelVersion=PREMIUM_REPORT_MODEL_VERSION;
    normalized.sourceAssessmentId=normalized.assessmentId;
    normalized.sourceAssessmentRevision=normalizedRevision(draft.sourceAssessmentRevision??draft.assessmentRevision);
    normalized.evidenceSignature=premiumEvidenceSignature({id:type,assessmentId:normalized.sourceAssessmentId,assessmentRevision:normalized.sourceAssessmentRevision,periodStart:normalized.periodStart,periodEnd:normalized.periodEnd,evidence});
  }
  return Object.freeze(normalized);
}
export function buildApproveReportDraftCommand(draft,baseRevision=0){const browserMetadata=premiumMetadataFromActiveEditor(draft);const normalized=normalizeReportDraft(browserMetadata?{...draft,...browserMetadata}:draft);return {type:'INFORME_APROBAR',entityType:'report',entityId:normalized.id,clientId:normalized.clientId,baseRevision:Number.isInteger(Number(baseRevision))&&Number(baseRevision)>=0?Number(baseRevision):0,payload:{patch:structuredClone(normalized)}};}
