// Shared, read-only evidence primitives. No persistence, network or clinical scoring.
export function evidenceNumber(value,{min=-Infinity,max=Infinity,integer=false}={}){
  if(typeof value==='string'){
    const trimmed=value.trim();
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(trimmed))return null;
    value=Number(trimmed);
  }
  return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max
    &&(!integer||Number.isSafeInteger(value))?value:null;
}

export function currentWearableEvidence(wearable){
  const decision=wearable?.decision;
  const days=evidenceNumber(decision?.currentEvidenceDays,{min:0,integer:true});
  const availableDays=evidenceNumber(wearable?.daysWithData,{min:0,integer:true});
  const providers=decision?.providers;
  const provider=Array.isArray(providers)&&providers.length===1&&typeof providers[0]==='string'
    ?providers[0].trim():'';
  const eligible=decision?.eligible===true&&days!==null&&days>0
    &&availableDays!==null&&days<=availableDays&&provider!=='';
  return Object.freeze({eligible,days:eligible?days:null,availableDays,
    provider:eligible?provider:null,quality:eligible?decision.quality||'limitada':'limitada'});
}
