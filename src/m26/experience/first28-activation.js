// Life & Performance 360 · First28 starts at the actual Client record alta.
// This is a coaching orientation, never an execution gate or medical score.
import {trainingServiceActive} from '../domain/training-service.js';
import {reportCivilDate,isWithinCivilPeriod} from '../domain/civil-date.js';

function civil(value){return reportCivilDate(value);}
function daysBetween(start,end){
  const from=Date.parse(start+'T12:00:00Z'),to=Date.parse(end+'T12:00:00Z');
  return Math.round((to-from)/86400000);
}
function count(value){
  return Number.isSafeInteger(value)&&value>=0?value:null;
}
export function buildClientFirst28Activation({
  clientId,client=null,experience=null,progress=null,now=new Date(),
}={}){
  const owner=String(clientId||'').trim();
  const record=client?.body&&typeof client.body==='object'&&!Array.isArray(client.body)
    ?{...client,...client.body}:client;
  if(!owner||String(record?.id||'').trim()!==owner||(client?.id!=null&&String(client.id)!==owner)||(client?.body?.id!=null&&String(client.body.id)!==owner)||!trainingServiceActive(record))return null;
  // Prefer the canonical Client alta; a cycle date is a plan, not enrollment.
  const enrollment=record.createdAt??record.created_at;
  const joined=civil(enrollment);
  const today=civil(now);
  if(!joined||!today||!isWithinCivilPeriod(enrollment,'0001-01-01',today,now))return null;
  const age=daysBetween(joined,today);
  if(!Number.isInteger(age)||age<0||age>=28)return null;
  const readiness=experience?.serviceKind==='training'?experience?.readiness||{}:{};
  const cycleRegistered=readiness.cycle===true;
  // A partial or other-owner progress cache cannot become a false 'zero'.
  const scoped=String(progress?.clientId||'')===owner&&progress?.days===28?progress:null;
  const sessionSource=scoped?.confirmedWorkoutExecutions===undefined?'legacy-activity':'confirmed-execution';
  const sessions=count(sessionSource==='confirmed-execution'?scoped.confirmedWorkoutExecutions:scoped?.completedSessions);
  const checkins=count(scoped?.checkins);
  const next=!cycleRegistered
    ?{area:'planificacion',label:'Consultar mi planificación'}
    :sessions===null||sessions===0
      ?{area:'sesion',label:'Ver mis sesiones'}
      :checkins===null||checkins===0
        ?{area:'actividad',label:'Registrar cómo estoy'}
        :{area:'progreso',label:'Ver mi evolución'};
  return Object.freeze({
    clientId:owner,day:age+1,days:28,anchor:'client-enrollment',
    joinedAt:joined,asOf:today,cycleRegistered,
    confirmedSessions:sessions,sessionSource,confirmedCheckins:checkins,
    next:Object.freeze(next),
    // This is a visibility/status projection; it never publishes or prescribes.
    actionsAreNavigationOnly:true,
  });
}
