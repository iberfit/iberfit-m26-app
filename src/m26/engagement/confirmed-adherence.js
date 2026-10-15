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
const DUE_STATUSES=new Set(['planned','confirmada','realizada','ausencia_cliente','ausencia_coach']);
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
    else if(current.revision===value.revision&&(current.status!==value.status||current.sessionId!==value.sessionId))
      appointments.set(id,{...value,status:null,conflict:true});
  }
  return {appointments,withoutIdentity};
}

export function confirmedAdherenceEvidence({appointments=[],executions=[]}={}){
  const source=appointmentRows(appointments);
  const due=new Map([...source.appointments].filter(([,value])=>DUE_STATUSES.has(value.status)&&!value.conflict));
  const fulfilled=new Set([...due].filter(([,value])=>value.status==='realizada').map(([id])=>id));
  const uniqueExecutions=new Map();
  let executionsWithoutIdentity=0;
  for(const raw of Array.isArray(executions)?executions:[]){
    const row=body(raw),id=stableId(field(row,'id','executionId','execution_id'));
    if(!id){executionsWithoutIdentity++;continue;}
    if(!uniqueExecutions.has(id))uniqueExecutions.set(id,row);
  }

  let linkedExecutions=0;
  let standaloneExecutions=0;
  const matchedAppointmentIds=new Set();
  for(const row of uniqueExecutions.values()){
    const appointmentId=stableId(field(row,'appointmentId','appointment_id'));
    // Only a canonical explicit appointment link can change adherence.
    // Session ID alone may be shared by multiple recurring appointments.
    if(appointmentId&&due.has(appointmentId)){
      linkedExecutions++;
      matchedAppointmentIds.add(appointmentId);
      fulfilled.add(appointmentId);
    }else{
      standaloneExecutions++;
    }
  }

  const plannedSessions=due.size;
  const scheduledCompleted=fulfilled.size;
  const unlinkedCompletedAppointments=[...fulfilled].filter(id=>!matchedAppointmentIds.has(id)).length;
  const completedSessions=uniqueExecutions.size+unlinkedCompletedAppointments;
  const adherence=plannedSessions?Math.round((scheduledCompleted/plannedSessions)*1000)/1000:null;

  return Object.freeze({
    plannedSessions,scheduledCompleted,completedSessions,adherence,
    linkedExecutions,standaloneExecutions,
    completedAppointmentsWithoutExecution:unlinkedCompletedAppointments,
    unverifiedAppointments:source.withoutIdentity,
    unverifiedExecutions:executionsWithoutIdentity,
    conflictingAppointments:[...source.appointments.values()].filter(row=>row.conflict).length,
    denominatorSource:'scheduled-appointments-only',
    completionSource:'confirmed-executions-plus-unmatched-completed-appointments',
    interpretation:'La actividad completada no implica cumplimiento de una cita. Las sesiones autónomas cuentan como actividad y solo modifican la adherencia si existe una cita vinculada de forma explícita.',
  });
}
