function asMs(value){const ms=new Date(value||0).getTime();return Number.isFinite(ms)?ms:0;}
function iso(ms){return new Date(ms).toISOString();}
export function executionElapsedMs(execution,at=Date.now()){
  const accumulated=Math.max(0,Number(execution?.accumulatedActiveMs||0));
  if(execution?.status==='active'&&execution?.activeSince){return accumulated+Math.max(0,Number(at)-asMs(execution.activeSince));}
  return accumulated;
}
export function freezeExecutionClock(execution,at=Date.now()){
  if(execution?.activeSince){execution.accumulatedActiveMs=executionElapsedMs(execution,at);execution.activeSince=null;}
  return execution;
}
export function resumeExecutionClock(execution,at=Date.now()){
  if(!execution.activeSince)execution.activeSince=iso(at);
  if(!Number.isFinite(Number(execution.accumulatedActiveMs)))execution.accumulatedActiveMs=0;
  return execution;
}
export function restRemainingSeconds(execution,at=Date.now()){
  if(!execution?.restUntil)return 0;
  return Math.max(0,Math.ceil((asMs(execution.restUntil)-Number(at))/1000));
}
export function recoverExecutionTimers(execution,at=Date.now()){
  if(!execution||typeof execution!=='object')throw new Error('M26_EXECUTION_REQUIRED');
  if(execution.restUntil&&restRemainingSeconds(execution,at)===0)execution.restUntil=null;
  if(execution.status==='active')resumeExecutionClock(execution,at);else freezeExecutionClock(execution,at);
  execution.recoveredAt=iso(at);
  return execution;
}
export function formatDuration(ms){const total=Math.max(0,Math.floor(Number(ms||0)/1000));const minutes=Math.floor(total/60);const seconds=total%60;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;}
