// M42 · Only a confirmed appointment explicitly bound to this exact session
// can authorize appointment-based start. Never use another appointment from
// the same client (including an unlinked or older presencial booking).
import {normalizeAppointmentRecord} from '../domain/appointment.js';

const safeTime=value=>{
  const date=value?new Date(value).getTime():NaN;
  return Number.isFinite(date)?date:null;
};

export function confirmedAppointmentForSession(
  records=[],session,now=Date.now(),{earlyWindowMs=6*60*60*1000,lateWindowMs=24*60*60*1000}={}
){
  const at=Number(now);
  if(!Number.isFinite(at)||!session?.id||!session?.clientId)return null;
  const lower=at-Math.max(0,Number(earlyWindowMs)||0);
  const upper=at+Math.max(0,Number(lateWindowMs)||0);
  const eligible=(record)=>{
    const item=normalizeAppointmentRecord(record);
    if(item.clientId!==session.clientId||
      item.status!=='confirmada'||
      item.sessionId!==session.id)return null;
    const start=safeTime(item.startAt);
    const end=safeTime(item.endAt);
    if(start===null||(end??start)<lower||start>upper)return null;
    return {item,start};
  };
  return records.map(eligible).filter(Boolean)
    .sort((a,b)=>a.start-b.start)[0]?.item||null;
}
