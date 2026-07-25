const FORBIDDEN_CLIENT_BOOTSTRAP_KEY=/(private.?notes?|coach.?notes?|coach.?availability|intelligence.?runs?|audit|service.?role|password|secret|oauth.?token|access.?token|refresh.?token|raw)/i;

function walk(value,visit,path=[]){
  if(Array.isArray(value)){
    value.forEach((item,index)=>walk(item,visit,[...path,index]));
    return;
  }
  if(value&&typeof value==='object'){
    for(const [key,item] of Object.entries(value)){
      visit(key,item,[...path,key]);
      walk(item,visit,[...path,key]);
    }
  }
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

  walk(bootstrap,(key,value,path)=>{
    if(
      FORBIDDEN_CLIENT_BOOTSTRAP_KEY.test(String(key))
      &&hasMeaningfulBootstrapValue(value)
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
