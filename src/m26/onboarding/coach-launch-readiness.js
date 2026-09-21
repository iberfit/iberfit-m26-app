import {normalizeClientProfile} from '../domain/client-profile.js';
import {validateCycleDraft} from '../workflows/planning-workflow.js';

function clean(value,max=240){
  return String(value??'').trim().slice(0,max);
}

function bodyOf(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :{};
}

function field(record,...keys){
  const body=bodyOf(record);
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

function clientIdOf(record,{profile=false}={}){
  return clean(
    field(record,'clientId','client_id')??(profile?record?.id:null),
    160,
  );
}

function cycleDraft(record){
  return {
    clientId:clientIdOf(record),
    name:field(record,'name','nombre','title','titulo'),
    startDate:field(record,'startDate','start_date'),
    endDate:field(record,'endDate','end_date'),
    goal:field(record,'goal','objetivo','objective'),
  };
}

function completeClientIds(collections){
  const clients=Array.isArray(collections?.clients)?collections.clients:[];
  const profiles=Array.isArray(collections?.clientProfiles)?collections.clientProfiles:[];
  const profilesByClient=new Map();

  for(const profile of profiles){
    const clientId=clientIdOf(profile,{profile:true});
    if(clientId&&!profilesByClient.has(clientId))profilesByClient.set(clientId,profile);
  }

  const ids=[];
  for(const client of clients){
    const clientId=clean(client?.id,160);
    if(!clientId)continue;
    const profile=profilesByClient.get(clientId);
    if(!profile)continue;
    const normalized=normalizeClientProfile(profile,client);
    if(normalized.missing.length===0)ids.push(clientId);
  }
  return ids;
}

export function coachLaunchReadiness({role,progress,collections}={}){
  const normalizedRole=clean(role,40).toLowerCase();
  if(normalizedRole!=='coach'){
    return Object.freeze({
      applicable:false,
      ready:null,
      tourCompleted:Boolean(progress?.completed),
      clientReady:null,
      planningReady:null,
      nextRequirement:null,
    });
  }

  const collectionsKnown=Boolean(
    collections&&
    typeof collections==='object'&&
    Array.isArray(collections.clients)&&
    Array.isArray(collections.clientProfiles)&&
    Array.isArray(collections.trainingCycles)
  );
  const tourCompleted=progress?.completed===true;

  if(!collectionsKnown){
    return Object.freeze({
      applicable:true,
      ready:false,
      tourCompleted,
      clientReady:false,
      planningReady:false,
      nextRequirement:'data',
    });
  }

  const usableClientIds=completeClientIds(collections);
  const usableClients=new Set(usableClientIds);
  const clientReady=usableClientIds.length>0;
  const planningReady=clientReady&&collections.trainingCycles.some((record)=>{
    const draft=cycleDraft(record);
    return usableClients.has(clean(draft.clientId,160))&&validateCycleDraft(draft).ok;
  });
  const ready=tourCompleted&&clientReady&&planningReady;
  const nextRequirement=!tourCompleted
    ?'tour'
    :!clientReady
      ?'client'
      :!planningReady
        ?'planning'
        :null;

  return Object.freeze({
    applicable:true,
    ready,
    tourCompleted,
    clientReady,
    planningReady,
    nextRequirement,
    usableClientCount:usableClientIds.length,
  });
}

export const __coachLaunchReadinessInternals=Object.freeze({
  bodyOf,
  field,
  clientIdOf,
  cycleDraft,
  completeClientIds,
});
