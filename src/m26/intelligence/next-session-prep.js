import {computeProgressSummary} from '../engagement/progress-engine.js';
import {listExercisePerformanceMemories} from '../engagement/exercise-performance-engine.js';
import {actionOutcomeEntities,summarizeActionOutcomes} from './action-outcome.js';

function arr(value){return Array.isArray(value)?value:[];}
function unwrap(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?{...record,...record.body}:record||{};}
function field(record,...keys){const item=unwrap(record);for(const key of keys){const value=item?.[key]??record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return String(field(record,'clientId','client_id','clienteId','cliente_id')||'').trim();}
function safeDate(value){if(!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date;}
function dateOf(record){return field(record,'startAt','start_at','completedAt','completed_at','recordedAt','recorded_at','updatedAt','updated_at','createdAt','created_at','date','fecha');}
function statusOf(record){return String(field(record,'status','estado')||'').trim().toLowerCase();}
function idOf(record){return String(field(record,'id','entityId','entity_id')||'').trim();}
function titleOf(record,fallback='Sesión IBERFIT'){return String(field(record,'title','name','nombre','titulo')||fallback).trim().slice(0,140);}
function forClient(state,key,clientId){const expected=String(clientId||'').trim();return arr(state?.collections?.[key]).filter((item)=>clientIdOf(item)===expected);}
function byDateDesc(a,b){return (safeDate(dateOf(b))?.getTime()||0)-(safeDate(dateOf(a))?.getTime()||0);}
function byDateAsc(a,b){return (safeDate(dateOf(a))?.getTime()||0)-(safeDate(dateOf(b))?.getTime()||0);}
function percent(value){return Number.isFinite(Number(value))?Math.round(Number(value)*100):null;}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function text(value,max=1600){return String(value??'').trim().slice(0,max);}
function feedbackOf(execution){
  const item=unwrap(execution);
  const feedback=item?.feedback&&typeof item.feedback==='object'&&!Array.isArray(item.feedback)?item.feedback:{};
  return Object.freeze({
    sessionRpe:finite(feedback.sessionRpe??feedback.session_rpe),
    comment:text(feedback.comment??feedback.comments??feedback.note??feedback.notes,1200)||null,
    pain:feedback.pain===true||feedback.pain==='true',
    painNotes:text(feedback.painNotes??feedback.pain_notes,800)||null,
  });
}
function nextAppointment(state,clientId,now){
  const nowMs=(now instanceof Date?now:new Date(now)).getTime();
  return forClient(state,'appointments',clientId)
    .filter((item)=>!['cancelado','cancelled','anulado','annulled'].includes(statusOf(item)))
    .filter((item)=>(safeDate(field(item,'startAt','start_at'))?.getTime()||0)>=nowMs)
    .sort(byDateAsc)[0]||null;
}
function sessionForPreparation(state,clientId,appointment){
  const sessions=forClient(state,'sessions',clientId);
  const appointmentSessionId=String(field(appointment,'sessionId','session_id')||'').trim();
  if(appointmentSessionId){
    const exact=sessions.find((item)=>idOf(item)===appointmentSessionId);
    if(exact)return exact;
  }
  const visible=sessions
    .filter((item)=>['publicado','publicada','published','aprobado','aprobada','approved'].includes(statusOf(item)))
    .sort(byDateDesc);
  return visible[0]||sessions.sort(byDateDesc)[0]||null;
}
function latestExecution(state,clientId){
  return forClient(state,'sessionExecutions',clientId)
    .filter((item)=>['completado','completed','complete'].includes(statusOf(item)))
    .sort(byDateDesc)[0]||null;
}
function latestIri(state,clientId){
  return forClient(state,'iriAssessments',clientId).sort(byDateDesc)[0]||null;
}
function loadLabel(load){
  if(!load)return null;
  if(load.raw!==undefined&&load.raw!==null&&String(load.raw).trim())return String(load.raw).trim().slice(0,80);
  if(Number.isFinite(Number(load.value))){
    const unit=String(load.unit||load.comparableKey||'').trim();
    return `${Number(load.value)}${unit?` ${unit}`:''}`;
  }
  return null;
}
function recentExerciseMemory(state,clientId,exerciseNames=null){
  return Object.freeze(
    listExercisePerformanceMemories(state,clientId,{limit:6,historyLimit:12})
      .map((memory)=>{
        const latest=memory.latest||null;
        const name=typeof exerciseNames==='function'
          ?text(exerciseNames(memory.exerciseId),120)
          :null;
        return Object.freeze({
          exerciseId:memory.exerciseId,
          exerciseName:name||memory.exerciseId,
          exposureCount:Number(memory.exposureCount||0),
          completedAt:latest?.completedAt||null,
          lastLoad:loadLabel(latest?.lastLoad),
          peakLoad:loadLabel(latest?.peakLoad),
          averageRpe:finite(latest?.averageRpe),
          averageRir:finite(latest?.averageRir),
          setCount:Number(latest?.setCount||0),
        });
      })
  );
}
function iriContext(state,clientId,progress){
  const iri=latestIri(state,clientId);
  if(!iri&&!progress?.iri2)return null;
  return Object.freeze({
    assessmentId:idOf(iri)||progress?.iri2?.currentAssessmentId||null,
    assessmentDate:field(iri,'assessmentDate','assessment_date','evaluatedAt','evaluated_at')||progress?.iri2?.currentAssessmentDate||null,
    status:statusOf(iri)||null,
    assessmentCount:Number(progress?.iriAssessmentCount||0),
    kind:progress?.iri2?.kind||null,
    label:progress?.iri2?.label||null,
    detail:progress?.iri2?.detail||null,
    comparableCount:Number(progress?.iri2?.comparableCount||0),
  });
}
function reviewReasons({progress,outcomes,feedback,session}={}){
  const reasons=[];
  if(!session)reasons.push(Object.freeze({kind:'session',label:'No hay una sesión preparada para revisar.'}));
  if(outcomes?.openCount)reasons.push(Object.freeze({kind:'decision',label:`${outcomes.openCount} decisión${outcomes.openCount===1?'':'es'} pendiente${outcomes.openCount===1?'':'s'} de resultado.`}));
  if(outcomes?.overdueCount)reasons.push(Object.freeze({kind:'decision-overdue',label:`${outcomes.overdueCount} seguimiento${outcomes.overdueCount===1?'':'s'} con revisión vencida.`}));
  if(feedback?.pain)reasons.push(Object.freeze({kind:'pain',label:'La última sesión registró dolor; revisa el contexto antes de decidir.'}));
  const checkinPain=finite(progress?.latestCheckin?.pain);
  if(Number.isFinite(checkinPain)&&checkinPain>0)reasons.push(Object.freeze({kind:'wellbeing',label:'El último check-in incluye dolor informado por el cliente.'}));
  if(Number(progress?.unconfirmedExecutions||0)>0)reasons.push(Object.freeze({kind:'data',label:'Hay ejecuciones sin confirmación que no se usan para decidir.'}));
  if(progress?.dataQuality==='limitada')reasons.push(Object.freeze({kind:'data',label:'La ventana reciente tiene evidencia limitada; evita inferencias amplias.'}));
  return Object.freeze(reasons);
}

export function buildNextSessionPreparation(state,clientId,{now=new Date(),exerciseName=null}={}){
  const safeClientId=String(clientId||'').trim();
  if(!safeClientId)return null;
  const progress=computeProgressSummary(state,safeClientId,{now,days:28});
  const appointment=nextAppointment(state,safeClientId,now);
  const session=sessionForPreparation(state,safeClientId,appointment);
  const execution=latestExecution(state,safeClientId);
  const feedback=feedbackOf(execution);
  const outcomes=summarizeActionOutcomes(state?.collections?.m26Entities||[],safeClientId,{now});
  const memories=recentExerciseMemory(state,safeClientId,exerciseName);
  const iri=iriContext(state,safeClientId,progress);
  const reasons=reviewReasons({progress,outcomes,feedback,session});
  const appointmentStart=field(appointment,'startAt','start_at')||null;
  const appointmentEnd=field(appointment,'endAt','end_at')||null;
  const sessionId=idOf(session)||null;
  const adherencePercent=percent(progress?.adherence);

  return Object.freeze({
    kind:'next-session-preparation',
    clientId:safeClientId,
    generatedAt:(now instanceof Date?now:new Date(now)).toISOString(),
    session:Object.freeze({
      id:sessionId,
      title:session?titleOf(session):null,
      status:session?statusOf(session):null,
    }),
    appointment:appointment?Object.freeze({
      id:idOf(appointment)||null,
      startAt:appointmentStart,
      endAt:appointmentEnd,
      modality:text(field(appointment,'modality','modalidad'),80)||null,
      location:text(field(appointment,'location','ubicacion'),300)||null,
    }):null,
    iri,
    progress:Object.freeze({
      plannedSessions:Number(progress?.plannedSessions||0),
      completedSessions:Number(progress?.completedSessions||0),
      adherence:finite(progress?.adherence),
      adherencePercent,
      averageRpe:finite(progress?.averageRpe),
      lastExecutionRpe:finite(progress?.lastExecutionRpe),
      lastExecutionAt:progress?.lastExecutionAt||null,
      latestCheckinAt:progress?.latestCheckinAt||null,
      latestCheckin:progress?.latestCheckin||null,
      checkinAverage:progress?.checkinAverage||null,
      dataQuality:progress?.dataQuality||'limitada',
      unconfirmedExecutions:Number(progress?.unconfirmedExecutions||0),
    }),
    lastExecution:execution?Object.freeze({
      id:idOf(execution)||null,
      sessionId:String(field(execution,'sessionId','session_id')||'').trim()||null,
      completedAt:dateOf(execution)||null,
      feedback,
    }):null,
    exerciseMemory:memories,
    decisions:Object.freeze({
      openCount:outcomes.openCount,
      overdueCount:outcomes.overdueCount,
      dueTodayCount:outcomes.dueTodayCount,
      open:Object.freeze(outcomes.open.slice(0,4)),
    }),
    reviewRequired:reasons.length>0,
    reviewReasons:reasons,
    evidence:Object.freeze({
      dataQuality:progress?.dataQuality||'limitada',
      exerciseMemories:memories.length,
      openDecisions:outcomes.openCount,
      hasIri:Boolean(iri),
      hasRecentExecution:Boolean(execution),
      hasRecentCheckin:Boolean(progress?.latestCheckinAt),
    }),
    safety:Object.freeze({
      automaticLoadChange:false,
      automaticExerciseChange:false,
      automaticClinicalDecision:false,
      coachConfirmationRequired:true,
      note:'Resumen informativo para el Coach. No modifica cargas, ejercicios, planificación ni mensajes automáticamente.',
    }),
  });
}

export const __nextSessionPreparationInternals=Object.freeze({
  unwrap,field,clientIdOf,dateOf,statusOf,nextAppointment,sessionForPreparation,
  latestExecution,feedbackOf,recentExerciseMemory,reviewReasons,loadLabel,
});
