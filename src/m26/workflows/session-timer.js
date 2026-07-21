const MAX_ACCUMULATED_MS=365*24*60*60*1000;
function finiteAt(value=Date.now()){const n=value instanceof Date?value.getTime():Number(value);if(!Number.isFinite(n)||n<0)throw new Error('M26_TIMER_AT_INVALID');return n;}
function asMs(value){if(value===null||value===undefined||value==='')return null;const ms=value instanceof Date?value.getTime():new Date(value).getTime();return Number.isFinite(ms)?ms:null;}
function iso(ms){return new Date(finiteAt(ms)).toISOString();}
function accumulated(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(n,MAX_ACCUMULATED_MS)):0;}
export function executionElapsedMs(execution,at=Date.now()){
  const base=accumulated(execution?.accumulatedActiveMs);
  if(execution?.status!=='active'||!execution?.activeSince)return base;
  const start=asMs(execution.activeSince);if(start===null)return base;
  const current=finiteAt(at);return Math.min(MAX_ACCUMULATED_MS,base+Math.max(0,current-start));
}
export function freezeExecutionClock(execution,at=Date.now()){
  if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
  execution.accumulatedActiveMs=executionElapsedMs(execution,at);execution.activeSince=null;return execution;
}
export function resumeExecutionClock(execution,at=Date.now()){
  if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
  execution.accumulatedActiveMs=accumulated(execution.accumulatedActiveMs);
  if(asMs(execution.activeSince)===null)execution.activeSince=iso(at);
  return execution;
}
export function restRemainingSeconds(execution,at=Date.now()){
  const until=asMs(execution?.restUntil);if(until===null)return 0;
  return Math.max(0,Math.ceil((until-finiteAt(at))/1000));
}
export function recoverExecutionTimers(execution,at=Date.now()){
  if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
  const current=finiteAt(at);execution.accumulatedActiveMs=accumulated(execution.accumulatedActiveMs);
  const rest=asMs(execution.restUntil);if(rest===null||rest<=current)execution.restUntil=null;else execution.restUntil=iso(rest);
  if(execution.status==='active'){
    if(asMs(execution.activeSince)===null)execution.activeSince=iso(current);
    else execution.activeSince=iso(asMs(execution.activeSince));
  }else execution.activeSince=null;
  execution.recoveredAt=iso(current);return execution;
}
export function formatDuration(ms){const total=Math.max(0,Math.floor(accumulated(ms)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;}
