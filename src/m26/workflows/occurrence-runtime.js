// IBERFIT U60 · explicit opt-in bundle: Coach dates, Client execution,
// owner-encrypted recovery and private read. Never auto-mount before QA gates.
import {createAtomicOccurrenceIndexedDbStore} from './occurrence-indexeddb-store.js';
import {createEncryptedOccurrenceJournal} from './occurrence-encrypted-journal.js';
import {createEncryptedOccurrenceWorkoutCheckpoint} from './occurrence-workout-checkpoint.js';
import {createOccurrenceCoordinator} from './occurrence-coordinator.js';
import {createOccurrenceWorkoutService} from './occurrence-workout-service.js';
import {createOccurrencePrivateReader} from './occurrence-private-reader.js';
import {createCoachOccurrenceBatchPublisher} from './occurrence-coach-batch-publisher.js';
import {planDatedTrainingOccurrences} from '../domain/dated-training-occurrences.js';
const fail=code=>{throw new Error('U60_RUNTIME_'+code);};
export function createTraining360OccurrenceRuntime({
 enabled=false,ownerId,transport,getAuthContext,keyProvider,
 readPrivateOccurrence,store,cryptoImpl=globalThis.crypto,
 createId=()=>globalThis.crypto?.randomUUID?.(),
}={}){
 if(enabled!==true)return Object.freeze({
   enabled:false,previewDates:()=>fail('NOT_ENABLED'),
   calendar:async()=>fail('NOT_ENABLED'),
   publishDates:async()=>fail('NOT_ENABLED'),
   openWorkout:async()=>fail('NOT_ENABLED'),
 });
 if(typeof getAuthContext!=='function'
   ||typeof keyProvider!=='function'
   ||(readPrivateOccurrence!=null&&typeof readPrivateOccurrence!=='function')
   ||typeof createId!=='function'||!transport)
   fail('DEPENDENCIES_REQUIRED');
 // Never derive a key from the access token or create an ephemeral key:
 // the caller supplies its already-unlocked, non-extractable owner key.
 const persistence=store||createAtomicOccurrenceIndexedDbStore();
 const journal=createEncryptedOccurrenceJournal({
   ownerId,store:persistence,keyProvider,cryptoImpl,
 });
 const checkpoint=createEncryptedOccurrenceWorkoutCheckpoint({
   ownerId,store:persistence,keyProvider,cryptoImpl,
 });
 const coordinator=createOccurrenceCoordinator({
   enabled:true,transport,getAuthContext,journal,
 });
 const publisher=createCoachOccurrenceBatchPublisher({
   enabled:true,transport,getAuthContext,journal,
 });
 const privateRead=readPrivateOccurrence||createOccurrencePrivateReader({
   enabled:true,transport,getAuthContext,
 }).read;
 const workout=createOccurrenceWorkoutService({
   enabled:true,coordinator,checkpoint,readPrivateOccurrence:privateRead,createId,
 });
 async function previewDates(options){
   const actor=await getAuthContext();
   if(actor?.role!=='coach')fail('COACH_REQUIRED');
   const result=planDatedTrainingOccurrences(options);
   if(!result.occurrences.every(row=>
     row.clientId===options?.clientId&&row.sessionId===options?.sessionId))
     fail('PREVIEW_SCOPE_INVALID');
   return result;
 }
 return Object.freeze({
   enabled:true,capability:'encrypted-dated-occurrence-opt-in',
   previewDates,calendar:coordinator.calendar,
   publishDates:publisher.publish,retryDates:publisher.retryPending,
   hasPendingDates:publisher.hasPending,
   openWorkout:workout.open,workout,
   recovery:coordinator,
 });
}
