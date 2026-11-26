import {evidenceNumber,stableEvidenceJson} from '../domain/evidence-signal.js';
import {normalizeAppointmentStatus} from '../domain/appointment.js';
import {sessionExecutionIsConfirmed,sessionExecutionIsCompleted,sessionExecutionEvidenceSignature} from '../domain/session-execution-truth.js';

/**
 * M44: confirmed attendance is not the same thing as adherence to a schedule.
 * The first is a count of actual, verified training events. The second needs
 * a separately evidenced set of appointments due in the same period.
 *
 * All input rows must already be bounded by client and reporting window. This
 * module never treats an exercise plan, future proposal or wearable activity
 * as a completed appointment.
 */
function body(row){return row?.body&&typeof row.body==='object'&&!Array.isArray(row.body)?{...row,...row.body}:row||{};}
function field(row,...keys){for(const key of keys){const value=row?.[key];if(value!==null&&value!==undefined&&value!=='')return value;}return null;}
function stableId(value){return typeof value==='string'&&value.trim()?value.trim():null;}
function revision(row){return evidenceNumber(field(row,'revision','remoteRevision','remote_revision'),{min:0,integer:true})??0;}
function appointmentKind(row){
  const raw=String(field(row,'status','estado')||'').toLowerCase().trim();
  return raw==='planned'?'planned':normalizeAppointmentStatus(raw);
}
function verifiedExecution(row){
  return sessionExecutionIsConfirmed(row)&&sessionExecutionIsCompleted(row);
}
// A merely planned proposal is not a confirmed commitment or a valid denominator.
const DUE_STATUSES=new Set(['confirmada','realizada','ausencia_cliente','ausencia_coach']);
function appointmentRows(rows,{clientId=null,include=()=>true}={}){
  const groups=new Map();let withoutIdentity=0;
  for(const raw of Array.isArray(rows)?rows:[]){
    const row=body(raw);
    const outer=field(raw||{},'clientId','client_id','clienteId','cliente_id');
    const inner=field(raw?.body||{},'clientId','client_id','clienteId','cliente_id');
    if((outer&&inner&&outer!==inner)||(clientId&&String(outer??inner??'')!==String(clientId)))continue;
    const id=stableId(field(row,'id','entityId','entity_id'));
    if(!id){if(include(row))withoutIdentity++;continue;}
    const value={id,row,status:appointmentKind(row),revision:revision(row),
      sessionId:stableId(field(row,'sessionId','session_id')),
      date:field(row,'scheduledAt','scheduled_at','startAt','start_at','date','fecha')};
    const rev=field(row,'revision','remoteRevision','remote_revision');
    value.invalid=rev!==null&&evidenceNumber(rev,{min:0,integer:true})===null;
    const signature=stableEvidenceJson([value.status,value.sessionId,value.date,value.invalid]);
    const current=groups.get(id);
    if(!current||value.revision>current.revision)groups.set(id,{...value,signature,inWindow:include(row)});
    else if(value.revision===current.revision){
      current.inWindow=current.inWindow||include(row);
      if(current.signature!==signature)current.conflict=true;
    }
  }
  const appointments=new Map([...groups].filter(([,value])=>value.inWindow));
  return {appointments,withoutIdentity};
}
// The same latest-revision appointment evidence feeds booked adherence and resolved cancellations.
export function reconcileAdherenceAppointments(rows,options={}){
  const {appointments,withoutIdentity}=appointmentRows(rows,options);
  const values=[...appointments.values()];
  return Object.freeze({
    rows:Object.freeze(values.filter(value=>!value.conflict&&!value.invalid).map(value=>value.row)),
    conflictingAppointments:values.filter(value=>value.conflict||value.invalid).length,
    unverifiedAppointments:withoutIdentity,
  });
}

export function confirmedAdherenceEvidence({appointments=[],executions=[],clientId=null,appointmentInWindow=()=>true}={}){
  const source=appointmentRows(appointments,{clientId,include:appointmentInWindow});
  const due=new Map([...source.appointments].filter(([,value])=>DUE_STATUSES.has(value.status)&&!value.conflict&&!value.invalid));
  const fulfilled=new Set([...due].filter(([,value])=>value.status==='realizada').map(([id])=>id));
  const executionsById=new Map();
  let executionsWithoutIdentity=0;
  for(const raw of Array.isArray(executions)?executions:[]){
    const row=body(raw),id=stableId(field(row,'id','executionId','execution_id'));
    if(!id){executionsWithoutIdentity++;continue;}
    const value={
      row,revision:revision(row),verified:verifiedExecution(row),
      signature:sessionExecutionEvidenceSignature(row),
      appointmentId:stableId(field(row,'appointmentId','appointment_id')),
      sessionId:stableId(field(row,'sessionId','session_id')),
    };
    const previous=executionsById.get(id);
    if(!previous||value.revision>previous.revision)executionsById.set(id,value);
    else if(value.revision===previous.revision&&(
      previous.conflict||value.appointmentId!==previous.appointmentId||
      value.sessionId!==previous.sessionId||value.verified!==previous.verified||
      value.signature!==previous.signature
    ))executionsById.set(id,{...value,conflict:true});
  }
  const uniqueExecutions=[...executionsById.values()]
    .filter(value=>!value.conflict&&value.verified);
  const conflictingExecutions=[...executionsById.values()].filter(value=>value.conflict).length;
  const unconfirmedExecutions=[...executionsById.values()].filter(value=>!value.conflict&&!value.verified).length;
  let linkedExecutions=0;
  let standaloneExecutions=0;
  let contradictoryAppointmentLinks=0;
  const matchedAppointmentIds=new Set();
  for(const {appointmentId,sessionId} of uniqueExecutions){
    // Only explicit, noncontradictory, confirmed appointments can be fulfilled.
    // A completed execution cannot retroactively turn a recorded no-show into
    // attendance or resolve a same-revision canonical conflict.
    // Even an explicit appointmentId cannot fulfill a different linked session:
    // both sides carrying different canonical session IDs is contradictory.
    const dueAppointment=appointmentId?due.get(appointmentId):null;
    const sameSession=!dueAppointment?.sessionId||!sessionId
      ||dueAppointment.sessionId===sessionId;
    if(dueAppointment&&sameSession&&['confirmada','realizada'].includes(dueAppointment.status)){
      linkedExecutions++;
      matchedAppointmentIds.add(appointmentId);
      fulfilled.add(appointmentId);
    }else{
      standaloneExecutions++;
      if(dueAppointment)contradictoryAppointmentLinks++;
    }
  }

  const plannedSessions=due.size;
  // Sólo una ausencia explícita y no contradictoria es un incumplimiento.
  // Una cita confirmada sin ACK de ejecución nunca se etiqueta como ausencia.
  const missedAppointments=[...due.values()]
    .filter(value=>value.status==='ausencia_cliente').length;
  const scheduledCompleted=fulfilled.size;
  const unlinkedCompletedAppointments=[...fulfilled].filter(id=>!matchedAppointmentIds.has(id)).length;
  const completedSessions=uniqueExecutions.length+unlinkedCompletedAppointments;
  const adherence=plannedSessions?Math.round((scheduledCompleted/plannedSessions)*1000)/1000:null;

  return Object.freeze({
    plannedSessions,scheduledCompleted,completedSessions,adherence,
    confirmedWorkouts:uniqueExecutions.length,missedAppointments,
    unresolvedAppointments:[...due].filter(([id,value])=>value.status==='confirmada'&&!fulfilled.has(id)).length,
    coachAbsenceAppointments:[...due.values()].filter(value=>value.status==='ausencia_coach').length,
    linkedExecutions,standaloneExecutions,
    completedAppointmentsWithoutExecution:unlinkedCompletedAppointments,
    unverifiedAppointments:source.withoutIdentity,
    unverifiedExecutions:executionsWithoutIdentity,
    conflictingAppointments:[...source.appointments.values()].filter(row=>row.conflict||row.invalid).length,
    conflictingExecutions,unconfirmedExecutions,contradictoryAppointmentLinks,
    denominatorSource:'scheduled-appointments-only',
    completionSource:'confirmed-executions-plus-unmatched-completed-appointments',
    interpretation:'La actividad completada no implica cumplimiento de una cita. Las sesiones autónomas cuentan como actividad y solo modifican la adherencia si existe una cita vinculada de forma explícita.',
  });
}
