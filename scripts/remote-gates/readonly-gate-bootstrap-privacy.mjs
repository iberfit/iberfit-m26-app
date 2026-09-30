const FORBIDDEN_CLIENT_BOOTSTRAP_KEY=/(private.?notes?|coach.?notes?|coach.?availability|intelligence.?runs?|audit|service.?role|password|secret|oauth.?token|access.?token|refresh.?token|raw)/i;

function walk(value,visit,path=[],parent=null){
  if(Array.isArray(value)){
    value.forEach((item,index)=>walk(item,visit,[...path,index],value));
    return;
  }
  if(value&&typeof value==='object'){
    for(const [key,item] of Object.entries(value)){
      visit(key,item,[...path,key],value,parent);
      walk(item,visit,[...path,key],value);
    }
  }
}

function isCanonicalChallengeHealthProhibition(key,value,path,body,entity){
  return key==='rawHealthDataAllowed'&&value===false
    &&path.length===5&&path[0]==='data'&&path[1]==='m26Entities'
    &&Number.isInteger(path[2])&&path[3]==='body'
    &&entity?.entityType==='challenge'&&entity.body===body;
}

export function hasMeaningfulBootstrapValue(value){
  if(value===null||value===undefined)return false;
  if(typeof value==='string')return value.trim().length>0;
  if(Array.isArray(value))return value.length>0;
  if(typeof value==='object')return Object.keys(value).length>0;
  return true;
}

export function inspectClientBootstrap(bootstrap,expectedClientId){
  const forbiddenKeys=[];
  const clientIds=new Set();

  walk(bootstrap,(key,value,path,body,entity)=>{
    if(
      FORBIDDEN_CLIENT_BOOTSTRAP_KEY.test(String(key))
      &&hasMeaningfulBootstrapValue(value)
      &&!isCanonicalChallengeHealthProhibition(key,value,path,body,entity)
    ){
      forbiddenKeys.push(path.join('.'));
    }
    if(
      /^(clientId|client_id)$/i.test(String(key))
      &&typeof value==='string'
      &&value.trim()
    ){
      clientIds.add(value.trim());
    }
  });

  const normalizedExpected=typeof expectedClientId==='string'
    ?expectedClientId.trim()
    :'';
  const foreignClientIds=[...clientIds]
    .filter((id)=>id!==normalizedExpected)
    .sort();

  const uniqueForbidden=[...new Set(forbiddenKeys)].sort();

  return {
    forbiddenKeys:uniqueForbidden,
    clientIds:[...clientIds].sort(),
    foreignClientIds,
    ok:uniqueForbidden.length===0&&foreignClientIds.length===0,
  };
}
