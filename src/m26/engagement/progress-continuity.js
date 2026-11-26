import {computeProgressSummary,progressWindow} from './progress-engine.js';
import {evidenceNumber} from '../domain/evidence-signal.js';

export const M26_ADHERENCE_WINDOWS=Object.freeze([7,28,90]);

/** Presentation contract: explicit booked attendance is not total activity. */
export function confirmedScheduledCompletion(summary,{allowLegacy=false}={}){
  const planned=summary?.plannedSessions;
  // Legacy payloads may omit the booked count; explicit null is unknown,
  // never permission to substitute total training activity.
  const completed=summary?.scheduledCompletedSessions===undefined&&allowLegacy
    ?summary?.completedSessions:summary?.scheduledCompletedSessions;
  const adherence=summary?.adherence;
  if(!Number.isSafeInteger(planned)||planned<=0||!Number.isSafeInteger(completed)||completed<0||completed>planned
    ||typeof adherence!=='number'||!Number.isFinite(adherence)||adherence<0||adherence>1
    ||Math.abs(adherence-completed/planned)>0.00050001)return null;
  return Object.freeze({planned,completed,adherence});
}
export function scheduledCompletionCopy(summary){
  const counts=confirmedScheduledCompletion(summary);
  return counts?`Citas cumplidas: ${counts.completed} / ${counts.planned}`:'Sin base suficiente para calcular adherencia';
}

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
export function reusableConfirmedSummary(candidate,clientId,days,{now=null}={}){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)
    ||String(candidate.clientId||'')!==String(clientId||'')
    ||evidenceNumber(candidate.days,{min:1,integer:true})!==days)return null;
  // Existing legacy projections can lack timestamps. A dated projection must
  // match the exact rolling window when its caller supplies a clock.
  if(now!=null&&(candidate.startAt!=null||candidate.endAt!=null)){
    const expected=progressWindow({now,days});
    if(candidate.startAt!==expected.start.toISOString()||candidate.endAt!==expected.end.toISOString())return null;
  }
  // Empty canonical windows can still contain autonomous training.
  // A known zero denominator is not an adherence percentage.
  if(candidate.plannedSessions===0){
    const completed=candidate.scheduledCompletedSessions===undefined
      ?candidate.completedSessions:candidate.scheduledCompletedSessions;
    return completed===0&&candidate.adherence===null?candidate:null;
  }
  return confirmedScheduledCompletion(candidate,{allowLegacy:true})?candidate:null;
}
function reusableSummary(summaries,clientId,days,now){
  if(!summaries||typeof summaries!=='object')return null;
  const candidate=summaries?.[days]??summaries?.[`d${days}`]??null;
  return reusableConfirmedSummary(candidate,clientId,days,{now});
}

export function buildAdherenceWindows(state,clientId,{now=new Date(),windows=M26_ADHERENCE_WINDOWS,summaries=null}={}){
  if(!clientId)return Object.freeze([]);

  return Object.freeze(
    normalizedWindows(windows).map((days)=>{
      const summary=reusableSummary(summaries,clientId,days,now)
        ??computeProgressSummary(state,clientId,{now,days});
      const plannedSessions=evidenceNumber(summary?.plannedSessions,{min:0,integer:true});
      const activityCompletedSessions=evidenceNumber(summary?.completedSessions,{min:0,integer:true});
      // The Constancia numerator is booked sessions fulfilled, not every
      // autonomous training performed in the same 7/28/90 day period.
      const scheduled=confirmedScheduledCompletion(summary,{allowLegacy:true});
      const knownEmpty=plannedSessions===0&&summary?.scheduledCompletedSessions===0;
      const completedSessions=scheduled?.completed??(knownEmpty?0:null);
      const adherence=scheduled?.adherence??null;

      return Object.freeze({
        days,
        label:windowLabel(days),
        plannedSessions,
        completedSessions,
        activityCompletedSessions,
        adherence,
        hasPlan:plannedSessions===null?null:plannedSessions>0,
        dataQuality:String(summary?.dataQuality||'limitada'),
        unconfirmedExecutions:evidenceNumber(summary?.unconfirmedExecutions,{min:0,integer:true}),
      });
    }),
  );
}
