import {normalizeAppointmentStatus} from '../domain/appointment.js';

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
function revision(row){const n=Number(field(row,'revision','remoteRevision','remote_revision'));return Number.isInteger(n)&&n>=0?n:0;}
function appointmentKind(row){
  const raw=String(field(row,'status','estado')||'').toLowerCase().trim();
  return raw==='planned'?'planned':normalizeAppointmentStatus(raw);
}
// A merely planned proposal is not a confirmed commitment or a valid denominator.
const DUE_STATUSES=new Set(['confirmada','realizada','ausencia_cliente','ausencia_coach']);
function appointmentRows(rows){
  const appointments=new Map();
  let withoutIdentity=0;
  for(const raw of Array.isArray(rows)?rows:[]){
    const row=body(raw),id=stableId(field(row,'id','entityId','entity_id'));
    if(!id){withoutIdentity++;continue;}
    const status=appointmentKind(row);
    const current=appointments.get(id);
    // Highest confirmed revision wins; an equal-revision contradictory state
    // is quarantined rather than deciding based on array order.
    const value={id,status,revision:revision(row),sessionId:stableId(field(row,'sessionId','session_id'))};
    if(!current||value.revision>current.revision)appointments.set(id,value);
    else if(current.revision===value.revision&&(current.conflict||current.status!==value.status||current.sessionId!==value.sessionId))
      appointments.set(id,{...value,status:null,conflict:true});
  }
  return {appointments,withoutIdentity};
}

export function confirmedAdherenceEvidence({appointments=[],executions=[]}={}){
  const source=appointmentRows(appointments);
  const due=new Map([...source.appointments].filter(([,value])=>DUE_STATUSES.has(value.status)&&!value.conflict));
  const fulfilled=new Set([...due].filter(([,value])=>value.status==='realizada').map(([id])=>id));
  const executionsById=new Map();
  let executionsWithoutIdentity=0;
  for(const raw of Array.isArray(executions)?executions:[]){
    const row=body(raw),id=stableId(field(row,'id','executionId','execution_id'));
    if(!id){executionsWithoutIdentity++;continue;}
    const value={
      row,revision:revision(row),
      appointmentId:stableId(field(row,'appointmentId','appointment_id')),
      sessionId:stableId(field(row,'sessionId','session_id')),
    };
    const previous=executionsById.get(id);
    if(!previous||value.revision>previous.revision)executionsById.set(id,value);
    else if(value.revision===previous.revision&&(previous.conflict||value.appointmentId!==previous.appointmentId||value.sessionId!==previous.sessionId))
      executionsById.set(id,{...value,conflict:true});
  }
  const uniqueExecutions=[...executionsById.values()].filter(value=>!value.conflict);
  const conflictingExecutions=executionsById.size-uniqueExecutions.length;
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
  const scheduledCompleted=fulfilled.size;
  const unlinkedCompletedAppointments=[...fulfilled].filter(id=>!matchedAppointmentIds.has(id)).length;
  const completedSessions=uniqueExecutions.length+unlinkedCompletedAppointments;
  const adherence=plannedSessions?Math.round((scheduledCompleted/plannedSessions)*1000)/1000:null;

  return Object.freeze({
    plannedSessions,scheduledCompleted,completedSessions,adherence,
    linkedExecutions,standaloneExecutions,
    completedAppointmentsWithoutExecution:unlinkedCompletedAppointments,
    unverifiedAppointments:source.withoutIdentity,
    unverifiedExecutions:executionsWithoutIdentity,
    conflictingAppointments:[...source.appointments.values()].filter(row=>row.conflict).length,
    conflictingExecutions,contradictoryAppointmentLinks,
    denominatorSource:'scheduled-appointments-only',
    completionSource:'confirmed-executions-plus-unmatched-completed-appointments',
    interpretation:'La actividad completada no implica cumplimiento de una cita. Las sesiones autónomas cuentan como actividad y solo modifican la adherencia si existe una cita vinculada de forma explícita.',
  });
}
