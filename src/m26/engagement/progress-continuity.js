import {computeProgressSummary} from './progress-engine.js';

export const M26_ADHERENCE_WINDOWS=Object.freeze([7,28,90]);

function normalizedWindows(windows){
  const source=Array.isArray(windows)&&windows.length?windows:M26_ADHERENCE_WINDOWS;
  const values=[];
  for(const value of source){
    const days=Number(value);
    if(!Number.isInteger(days)||days<1||days>3650||values.includes(days))continue;
    values.push(days);
  }
  return values.length?values:[...M26_ADHERENCE_WINDOWS];
}

function windowLabel(days){
  return `${days} días`;
}

export function buildAdherenceWindows(state,clientId,{now=new Date(),windows=M26_ADHERENCE_WINDOWS}={}){
  if(!clientId)return Object.freeze([]);

  return Object.freeze(
    normalizedWindows(windows).map((days)=>{
      const summary=computeProgressSummary(state,clientId,{now,days});
      const plannedSessions=Number(summary?.plannedSessions||0);
      const completedSessions=Number(summary?.completedSessions||0);
      const adherence=Number.isFinite(summary?.adherence)?summary.adherence:null;

      return Object.freeze({
        days,
        label:windowLabel(days),
        plannedSessions,
        completedSessions,
        adherence,
        hasPlan:plannedSessions>0,
        dataQuality:String(summary?.dataQuality||'limitada'),
        unconfirmedExecutions:Number(summary?.unconfirmedExecutions||0),
      });
    }),
  );
}
