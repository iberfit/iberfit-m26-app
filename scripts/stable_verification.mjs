function codedError(code){
  const error=new Error(code);
  error.code=code;
  return error;
}

function positiveInteger(value,code){
  const parsed=Number(value);
  if(!Number.isSafeInteger(parsed)||parsed<1)throw codedError(code);
  return parsed;
}

export async function verifyUntilStable({
  verifyAttempt,
  attempts,
  stablePasses,
  delayMs,
  sleepImpl=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
  onFailure=()=>{},
  onPass=()=>{},
}){
  if(typeof verifyAttempt!=='function')throw codedError('STABLE_VERIFICATION_ATTEMPT_INVALID');
  if(typeof sleepImpl!=='function')throw codedError('STABLE_VERIFICATION_SLEEP_INVALID');
  const totalAttempts=positiveInteger(attempts,'STABLE_VERIFICATION_ATTEMPTS_INVALID');
  const requiredStablePasses=positiveInteger(stablePasses,'STABLE_VERIFICATION_PASSES_INVALID');
  const waitMs=positiveInteger(delayMs,'STABLE_VERIFICATION_DELAY_INVALID');
  if(requiredStablePasses>totalAttempts)throw codedError('STABLE_VERIFICATION_PASSES_EXCEED_ATTEMPTS');

  let consecutivePasses=0;
  let lastError=null;
  let lastAttemptPassed=false;

  for(let attempt=1;attempt<=totalAttempts;attempt+=1){
    try{
      const result=await verifyAttempt(attempt);
      lastAttemptPassed=true;
      consecutivePasses+=1;
      onPass({attempt,totalAttempts,consecutivePasses,requiredStablePasses});
      if(consecutivePasses>=requiredStablePasses){
        return {result,attempt,consecutivePasses,requiredStablePasses};
      }
    }catch(error){
      lastAttemptPassed=false;
      lastError=error;
      consecutivePasses=0;
      onFailure({
        attempt,
        totalAttempts,
        consecutivePasses,
        requiredStablePasses,
        code:error?.code||error?.message||'STABLE_VERIFICATION_UNKNOWN_FAILURE',
      });
    }

    if(attempt<totalAttempts)await sleepImpl(waitMs);
  }

  if(lastAttemptPassed)throw codedError('STABLE_VERIFICATION_PASSES_NOT_REACHED');
  throw lastError||codedError('STABLE_VERIFICATION_UNKNOWN_FAILURE');
}
