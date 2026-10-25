// SIGNATURE U39 · Closed-by-default, immutable occurrence command builders.
// These do NOT bypass U31/U34 actor authorization, CAS or idempotency checks.
// They never enqueue a legacy SESION_INICIAR/SESION_COMPLETAR command.
import {resolveSantiagoLocalInstant} from './dated-training-occurrences.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE=/^(20\d{2}|2100)-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/u;
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const TYPES=new Set(['OCURRENCIA_CONFIRMAR','OCURRENCIA_INICIAR',
  'OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR',
  'OCURRENCIA_CANCELAR','OCURRENCIA_REPROGRAMAR']);
const MAX_BYTES=524288;

function fail(reason){throw new Error('U39_'+reason);}
const uid=(v)=>{
  const id=String(v||'').trim().toLowerCase();
  if(!UUID.test(id))fail('INVALID_UUID');
  return id;
};
function revision(value){
  if(!Number.isSafeInteger(value)||value<0)fail('INVALID_REVISION');
  return value;
}
function jsonObject(v,required=true){
  if(v==null&&!required)return {};
  if(!v||typeof v!=='object'||Array.isArray(v))fail('INVALID_OBJECT');
  try{
    const clone=structuredClone(v);
    const encoded=JSON.stringify(clone);
    if(!encoded||encoded.length>MAX_BYTES)fail('PAYLOAD_TOO_LARGE');
    return JSON.parse(encoded);
  }catch(error){
    if(String(error?.message||'').startsWith('U39_'))throw error;
    fail('NOT_SERIALIZABLE');
  }
}
function freezeDeep(obj){
  for(const value of Object.values(obj||{})){
    if(value&&typeof value==='object'&&!Object.isFrozen(value))
      freezeDeep(value);
  }
  return Object.freeze(obj);
}
function localDate(date){
  const raw=String(date||'').trim();
  if(!DATE.test(raw))fail('INVALID_LOCAL_DATE');
  const [y,m,d]=raw.split('-').map(Number);
  const check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==m||check.getUTCDate()!==d)
    fail('INVALID_LOCAL_DATE');
  return raw;
}
function replacementDate(source={}){
  if(!source||typeof source!=='object'||Array.isArray(source))fail('INVALID_REPLACEMENT');
  if(Object.keys(source).some(x=>!['localDate','localTime','dstDisambiguation','appointmentId'].includes(x)))
    fail('UNTRUSTED_REPLACEMENT_FIELD');
  const replacement={localDate:localDate(source.localDate)};
  if(source.localTime!=null&&source.localTime!==''){
    if(!TIME.test(String(source.localTime)))fail('INVALID_LOCAL_TIME');
    replacement.localTime=String(source.localTime);
    if(source.dstDisambiguation!=null){
      if(!['earlier','later'].includes(source.dstDisambiguation))
        fail('INVALID_DST_DISAMBIGUATION');
      replacement.dstDisambiguation=source.dstDisambiguation;
    }
    // Reject spring gaps and ambiguous clocks unless the Coach selects an
    // explicit side of the DST fold. Never silently shift training time.
    resolveSantiagoLocalInstant(replacement.localDate,replacement.localTime,{
      disambiguation:replacement.dstDisambiguation??null,
    });
    if(source.appointmentId!=null)
      replacement.appointmentId=uid(source.appointmentId);
  }else if(source.appointmentId!=null||source.dstDisambiguation!=null){
    fail('TIME_REQUIRED_FOR_LINK');
  }
  return replacement;
}

/**
 * Build exactly one occurrence-scoped command. Operation IDs are caller-owned
 * and must remain stable for retries; no generated IDs inside this helper.
 * For progress, baseRevision is the OCCURRENCE revision; executionBaseRevision
 * is the INDEPENDENT execution revision, never interchangeable.
 */
export function buildOccurrenceScopedCommand({
  type,operationId,clientId,occurrenceId,baseRevision,
  executionId=null,executionBaseRevision=null,
  results=null,skippedSets={},feedback=null,
  newOperationId=null,replacement=null,
}={}){
  if(!TYPES.has(type))fail('TYPE_NOT_SUPPORTED');
  const base={type,operationId:uid(operationId),clientId:uid(clientId),
    entityId:uid(occurrenceId),baseRevision:revision(baseRevision)};
  let payload={};
  switch(type){
  case 'OCURRENCIA_INICIAR':
    payload={executionId:uid(executionId)};
    break;
  case 'OCURRENCIA_GUARDAR_PROGRESO':
    payload={executionId:uid(executionId),
      executionBaseRevision:revision(executionBaseRevision),
      results:jsonObject(results),
      skippedSets:jsonObject(skippedSets)};
    break;
  case 'OCURRENCIA_COMPLETAR':
    payload={executionId:uid(executionId),
      executionBaseRevision:revision(executionBaseRevision),
      results:jsonObject(results),
      skippedSets:jsonObject(skippedSets),
      feedback:jsonObject(feedback)};
    break;
  case 'OCURRENCIA_REPROGRAMAR':{
    const newId=uid(newOperationId);
    if(newId===base.operationId)fail('REPLACEMENT_OPERATION_MUST_DIFFER');
    payload={newOperationId:newId,replacement:replacementDate(replacement)};
    break;
  }
  // Both confirm and cancel deliberately have empty payloads, matching U31/U34.
  default:
    break;
  }
  const cmd={...base,payload};
  const encoded=JSON.stringify(cmd);
  if(!encoded||encoded.length>MAX_BYTES)fail('PAYLOAD_TOO_LARGE');
  return freezeDeep(cmd);
}
