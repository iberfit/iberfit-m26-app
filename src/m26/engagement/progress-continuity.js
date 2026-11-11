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

/**
 * Canonical counts and ratios are inseparable. Never reuse a mismatched
 * summary cache for a different Client, date window or booked denominator.
 * Completed autonomous workouts remain activity, not booked attendance.
 */
export function reusableConfirmedSummary(candidate,clientId,days){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)
    ||String(candidate.clientId||'')!==String(clientId||'')
    ||Number(candidate.days)!==days)return null;
  const planned=Number(candidate.plannedSessions);
  const completed=Number(candidate.scheduledCompletedSessions
    ??candidate.completedSessions);
  const pct=candidate.adherence;
  if(!Number.isSafeInteger(planned)||planned<0
    ||!Number.isSafeInteger(completed)||completed<0||completed>planned)
    return null;
  if(planned===0)return pct===null?candidate:null;
  if(typeof pct!=='number'||!Number.isFinite(pct)||pct<0||pct>1
    ||Math.abs(pct-completed/planned)>0.01)return null;
  return candidate;
}
function reusableSummary(summaries,clientId,days){
  if(!summaries||typeof summaries!=='object')return null;
  const candidate=summaries?.[days]??summaries?.[`d${days}`]??null;
  return reusableConfirmedSummary(candidate,clientId,days);
}

export function buildAdherenceWindows(state,clientId,{now=new Date(),windows=M26_ADHERENCE_WINDOWS,summaries=null}={}){
  if(!clientId)return Object.freeze([]);

  return Object.freeze(
    normalizedWindows(windows).map((days)=>{
      const summary=reusableSummary(summaries,clientId,days)
        ??computeProgressSummary(state,clientId,{now,days});
      const plannedSessions=Number(summary?.plannedSessions||0);
      const activityCompletedSessions=Number(summary?.completedSessions||0);
      // The Constancia numerator is booked sessions fulfilled, not every
      // autonomous training performed in the same 7/28/90 day period.
      const completedSessions=Number(summary?.scheduledCompletedSessions
        ??summary?.completedSessions??0);
      const adherence=Number.isFinite(summary?.adherence)?summary.adherence:null;

      return Object.freeze({
        days,
        label:windowLabel(days),
        plannedSessions,
        completedSessions,
        activityCompletedSessions,
        adherence,
        hasPlan:plannedSessions>0,
        dataQuality:String(summary?.dataQuality||'limitada'),
        unconfirmedExecutions:Number(summary?.unconfirmedExecutions||0),
      });
    }),
  );
}
