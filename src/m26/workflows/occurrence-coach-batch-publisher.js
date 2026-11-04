// IBERFIT U60 · Coach date-batch publisher with durable, identity-bound replay.
// This is NOT a default UI action; U36 server EXECUTE is revoked by design.
import {buildCoachOccurrenceBatchCommand} from '../domain/dated-training-occurrences.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const fail=code=>{throw new Error('U60_BATCH_'+code);};
const id=value=>{
 const s=String(value||'').toLowerCase();
 if(!UUID.test(s))fail('UUID_INVALID');
 return s;
};
function actor(value){
 if(!value||value.role!=='coach'||typeof value.accessToken!=='string'
   ||!value.accessToken)fail('COACH_AUTH_REQUIRED');
 return {userId:id(value.userId),role:'coach',accessToken:value.accessToken};
}
const consistent=(before,after)=>before.userId===after.userId
 &&before.role===after.role;
function verifyReply(reply,command){
 if(!reply||typeof reply!=='object'||Array.isArray(reply)
   ||!['ack','rejected','conflict'].includes(reply.kind)
   ||id(reply.operationId)!==command.operationId)
   fail('REPLY_INVALID');
 if(reply.kind!=='ack')return Object.freeze({...reply,localRecoveryPending:true});
 if(reply.entityType!=='training_occurrence_batch'
   ||id(reply.entityId)!==command.entityId
   ||!Number.isInteger(reply.count)||reply.count!==command.payload.dates.length
   ||!Array.isArray(reply.occurrences)||reply.occurrences.length!==reply.count
   ||!Number.isSafeInteger(reply.remoteRevision)
   ||reply.remoteRevision!==command.baseRevision)
   fail('ACK_MISMATCH');
 const expected=new Set(command.payload.dates.map(row=>row.localDate));
 const seen=new Set();
 for(const o of reply.occurrences){
   if(!o||!UUID.test(String(o.id||''))
     ||!expected.has(o.localDate)||seen.has(o.localDate))
     fail('ACK_DATES_INVALID');
   seen.add(o.localDate);
 }
 return Object.freeze({...reply,localRecoveryPending:false});
}
export function createCoachOccurrenceBatchPublisher({
 enabled=false,transport,getAuthContext,journal,
}={}){
 if(enabled!==true)return Object.freeze({
   enabled:false,publish:async()=>fail('NOT_ENABLED'),
   retryPending:async()=>fail('NOT_ENABLED'),
   hasPending:async()=>fail('NOT_ENABLED'),
 });
 if(typeof transport?.occurrenceCommand!=='function'
   ||typeof getAuthContext!=='function'
   ||journal?.capability!=='encrypted-owner-bound'
   ||!['readPending','writePending','clearPending']
       .every(name=>typeof journal[name]==='function'))
   fail('DEPENDENCIES_REQUIRED');
 const inFlight=new Set();
 const scope=(a,c,s)=>a.userId+'|'+c+'|'+s;
 const authenticate=async()=>actor(await getAuthContext());
 async function dispatch(cmd,a,scopeKey,{recovery=false}={}){
   if(inFlight.has(scopeKey))fail('COMMAND_IN_FLIGHT');
   inFlight.add(scopeKey);
   try{
     const prior=await journal.readPending(scopeKey);
     if(recovery){
       if(!prior||JSON.stringify(prior)!==JSON.stringify(cmd))
         fail('RECOVERY_PAYLOAD_MISMATCH');
     }else{
       if(prior)fail('UNCERTAIN_COMMAND_REQUIRES_RECOVERY');
       // Atomic encrypted persistence FIRST; network operation SECOND.
       await journal.writePending(scopeKey,cmd);
     }
     if(!consistent(a,await authenticate()))fail('ACTOR_CHANGED');
     const response=await transport.occurrenceCommand(a.accessToken,cmd);
     if(!consistent(a,await authenticate()))fail('ACTOR_CHANGED');
     const verified=verifyReply(response,cmd);
     if(verified.kind!=='ack')return verified;
     try{
       await journal.clearPending(scopeKey,cmd.operationId);
       return verified;
     }catch{
       // A server ACK is not permission to discard the uncertain journal.
       return Object.freeze({...verified,localRecoveryPending:true});
     }
   }finally{inFlight.delete(scopeKey);}
 }
 async function publish(options={}){
   const a=await authenticate();
   const cmd=buildCoachOccurrenceBatchCommand(options);
   const key=scope(a,cmd.clientId,cmd.entityId);
   return dispatch(cmd,a,key);
 }
 async function retryPending({clientId,sessionId}={}){
   const c=id(clientId),s=id(sessionId),a=await authenticate();
   const key=scope(a,c,s);
   const pending=await journal.readPending(key);
   if(!pending||pending.type!=='OCURRENCIAS_CREAR_LOTE'
     ||pending.clientId!==c||pending.entityId!==s
     ||!UUID.test(String(pending.operationId||'')))
     fail('NO_VERIFIED_PENDING_BATCH');
   return dispatch(pending,a,key,{recovery:true});
 }
 async function hasPending({clientId,sessionId}={}){
   const a=await authenticate(),key=scope(a,id(clientId),id(sessionId));
   return Boolean(await journal.readPending(key));
 }
 return Object.freeze({enabled:true,publish,retryPending,hasPending});
}
