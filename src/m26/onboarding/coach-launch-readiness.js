function clean(value,max=240){
  return String(value??'').trim().slice(0,max);
}

function milestone(journey,id){
  return Array.isArray(journey?.milestones)
    ?journey.milestones.find((item)=>item?.id===id)||null
    :null;
}

function nextRequirement(journey){
  if(!journey)return 'data';
  if(journey.blocked===true)return 'account';
  for(const id of ['invited','activated','profile','client','planning','session']){
    if(milestone(journey,id)?.complete!==true)return id;
  }
  if(journey.accountActive!==true)return 'account';
  return null;
}

export function coachLaunchReadiness({role,progress,journey}={}){
  const normalizedRole=clean(role,40).toLowerCase();
  const tourCompleted=progress?.completed===true;
  if(normalizedRole!=='coach'){
    return Object.freeze({
      applicable:false,
      ready:null,
      tourCompleted,
      profileReady:null,
      clientReady:null,
      planningReady:null,
      sessionReady:null,
      accountReady:null,
      nextRequirement:null,
    });
  }
  if(!journey||!Array.isArray(journey.milestones)){
    return Object.freeze({
      applicable:true,
      ready:false,
      tourCompleted,
      profileReady:false,
      clientReady:false,
      planningReady:false,
      sessionReady:false,
      accountReady:false,
      nextRequirement:'data',
    });
  }
  return Object.freeze({
    applicable:true,
    ready:journey.ready===true,
    tourCompleted,
    profileReady:milestone(journey,'profile')?.complete===true,
    clientReady:milestone(journey,'client')?.complete===true,
    planningReady:milestone(journey,'planning')?.complete===true,
    sessionReady:milestone(journey,'session')?.complete===true,
    accountReady:journey.accountActive===true&&!journey.blocked,
    nextRequirement:nextRequirement(journey),
    completedCount:Number(journey.completedCount||0),
    total:Number(journey.total||0),
    stage:journey.stage||null,
  });
}

export const __coachLaunchReadinessInternals=Object.freeze({milestone,nextRequirement});
