// QA-only lossless canonical-summary references. Preserve every record,
// revision and event without increasing bootstrap size limits.
const REF='__iberfitQaCanonicalExecutionSummaryRefV1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>String(x??'');
// The authenticated server envelope uses environment:'QA'; hydration decorates
// that same verified context as environment:{mode:'QA', ...extensions}. Both
// are supported, but neither PROD nor an unallowlisted role may expand refs.
const qaCoach=s=>{
 const env=s?.environment;
 const mode=typeof env==='string'?env:(object(env)?env.mode:null);
 return mode==='QA'&&s?.user?.role==='coach'&&
   s?.canary?.active===true&&s?.canary?.scope==='allowlist';
};
const canon=x=>Array.isArray(x)?'['+x.map(canon).join(',')+']'
  :object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}'
  :JSON.stringify(x);
const index=s=>new Map((Array.isArray(s?.data?.m26Entities)?s.data.m26Entities:[])
  .filter(e=>e?.entityType==='session_execution'&&UUID.test(str(e.entityId)))
  .map(e=>[str(e.entityId),e]));
function validLineage(row,e){
 const b=e?.body;
 return object(b)&&UUID.test(str(row?.id))&&str(row.id)===str(e.entityId)
   &&str(row.id)===str(b.id)&&UUID.test(str(row.client_id))
   &&str(row.client_id)===str(e.clientId)&&str(row.client_id)===str(b.clientId)
   &&UUID.test(str(row.session_id))&&str(row.session_id)===str(b.sessionId)
   &&Number.isSafeInteger(Number(row.revision))&&Number(row.revision)>=0
   &&Number(row.revision)===Number(e.revision)&&Number(row.revision)===Number(b.revision);
}
// U81 QA Coach · compact the immutable U38 historical snapshot without
// dropping a single entity/event or relaxing the 20 MB hydration wire cap.
// Tuple encoding removes thousands of repeated JSON property names; optional
// per-column dictionaries reference exactly the original strings. Every row
// is reconstructed before canonical reconciliation, reports or UI can read it.
const HISTORY_PACKS=Object.freeze({
  m26Entities:'__iberfitQaHistoryEntityTuplesV1',
  domainEvents:'__iberfitQaHistoryEventTuplesV1',
});
const MAX_TUPLE_ROWS=50_000;
const MAX_TUPLE_COLUMNS=48;
const MAX_TUPLE_DICTIONARY=16_384;
const SAFE_COLUMN=/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/u;
const FORBIDDEN_COLUMN=new Set(['__proto__','constructor','prototype']);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function failPack(){throw new Error('U81_QA_HISTORY_TUPLE_INVALID');}
function packHistorySection(snapshot,section){
  const rows=snapshot?.data?.[section];
  if(!qaCoach(snapshot)||!Array.isArray(rows)||rows.length<2||
     rows.length>MAX_TUPLE_ROWS||!rows.every(object))return rows;
  const marker=HISTORY_PACKS[section];
  if(!marker)return rows;
  const cols=Object.keys(rows[0]);
  if(cols.length<3||cols.length>MAX_TUPLE_COLUMNS||
    cols.some(col=>!SAFE_COLUMN.test(col)||FORBIDDEN_COLUMN.has(col))||
    new Set(cols).size!==cols.length)return rows;
  const scope=section==='m26Entities'?'clientId':'client_id';
  const identity=section==='m26Entities'?'entityId':'id';
  if(!cols.includes(scope)||!cols.includes(identity))return rows;
  const authorized=new Set((snapshot.data.clients||[]).map(client=>str(client?.id)));
  if(!rows.every(row=>Object.keys(row).length===cols.length
    &&cols.every(col=>Object.prototype.hasOwnProperty.call(row,col))
    &&authorized.has(str(row[scope]))))return rows;
  const tuples=rows.map(row=>cols.map(col=>row[col]));
  const dictionaries=Object.create(null);
  // String columns with many repeated values (Client, actor, operation
  // type, entity/status) get numeric references; null stays null.
  for(let col=0;col<cols.length;col++){
    const values=tuples.map(row=>row[col]);
    if(!values.every(value=>value===null||typeof value==='string'))continue;
    const unique=[...new Set(values.filter(value=>typeof value==='string'))];
    if(!unique.length||unique.length>MAX_TUPLE_DICTIONARY)continue;
    const indexes=new Map(unique.map((value,index)=>[value,index]));
    const encoded=values.map(value=>value===null?null:indexes.get(value));
    if(bytes(values)-bytes(encoded)-bytes(unique)<96)continue;
    dictionaries[col]=unique;
    for(let i=0;i<tuples.length;i++)tuples[i][col]=encoded[i];
  }
  const packed=[{[marker]:{version:1,columns:cols,dictionaries,rows:tuples}}];
  return bytes(rows)-bytes(packed)>=256?packed:rows;
}
function expandHistorySection(snapshot,section){
  const rows=snapshot?.data?.[section],marker=HISTORY_PACKS[section];
  if(!Array.isArray(rows)||!marker)return rows;
  if(!rows.some(row=>object(row)&&Object.prototype.hasOwnProperty.call(row,marker)))return rows;
  if(!qaCoach(snapshot)||rows.length!==1||!object(rows[0])||
    Object.keys(rows[0]).length!==1)failPack();
  const packet=rows[0][marker];
  if(!object(packet)||packet.version!==1||
    Object.keys(packet).length!==4||
    !Array.isArray(packet.columns)||!Array.isArray(packet.rows)||
    !object(packet.dictionaries))failPack();
  const cols=packet.columns,tuples=packet.rows,dict=packet.dictionaries;
  if(cols.length<3||cols.length>MAX_TUPLE_COLUMNS||
    tuples.length<1||tuples.length>MAX_TUPLE_ROWS||
    cols.some(col=>typeof col!=='string'||!SAFE_COLUMN.test(col)||
      FORBIDDEN_COLUMN.has(col))||
    new Set(cols).size!==cols.length)failPack();
  const scope=section==='m26Entities'?'clientId':'client_id';
  const identity=section==='m26Entities'?'entityId':'id';
  if(!cols.includes(scope)||!cols.includes(identity))failPack();
  const dictionaries=new Map();
  for(const [key,values] of Object.entries(dict)){
    const index=Number(key);
    if(!/^(0|[1-9][0-9]*)$/u.test(key)||!Number.isSafeInteger(index)||
      index>=cols.length||!Array.isArray(values)||
      !values.length||values.length>MAX_TUPLE_DICTIONARY||
      !values.every(value=>typeof value==='string')||
      new Set(values).size!==values.length)failPack();
    dictionaries.set(index,values);
  }
  const authorized=new Set((snapshot.data.clients||[]).map(client=>str(client?.id)));
  const expanded=tuples.map(tuple=>{
    if(!Array.isArray(tuple)||tuple.length!==cols.length)failPack();
    const record={};
    for(let i=0;i<cols.length;i++){
      const values=dictionaries.get(i),raw=tuple[i];
      if(values){
        if(raw!==null&&(!Number.isSafeInteger(raw)||raw<0||raw>=values.length))failPack();
        record[cols[i]]=raw===null?null:values[raw];
      }else record[cols[i]]=raw;
    }
    if(!authorized.has(str(record[scope])))failPack();
    return record;
  });
  return expanded;
}
function compactQaHistoryTuples(snapshot){
  if(!qaCoach(snapshot))return snapshot;
  const data={...snapshot.data};
  let changed=false;
  for(const section of Object.keys(HISTORY_PACKS)){
    const packed=packHistorySection(snapshot,section);
    if(packed!==snapshot.data[section]){data[section]=packed;changed=true;}
  }
  return changed?{...snapshot,data}:snapshot;
}
function expandQaHistoryTuples(snapshot){
  const data={...snapshot?.data};
  let changed=false;
  for(const section of Object.keys(HISTORY_PACKS)){
    const expanded=expandHistorySection(snapshot,section);
    if(expanded!==snapshot?.data?.[section]){data[section]=expanded;changed=true;}
  }
  return changed?{...snapshot,data}:snapshot;
}

// U82 · strictly QA Coach-only, lossless same-record nested payload aliases.
// Historical executions legitimately carry repeated plans and progression
// snapshots. We transmit a *verified* reference only when the complete JSON
// values are exactly equal; never drop different revisions, content or rows.
// This leaves the immutable 20 MB authenticated wire guard untouched.
const NESTED_REF='__iberfitQaHistoryNestedRefV1';
const NESTED_PACKET='__iberfitQaHistoryNestedRefsV1';
const NESTED_RULES=Object.freeze([
 {type:'session',tag:'session-blocks',from:['blocks'],to:['publishedSnapshot']},
 {type:'session_execution',tag:'progress-plan',from:['planSnapshot'],to:['progressSnapshot','planSnapshot']},
 {type:'session_execution',tag:'progress-queue',from:['queue'],to:['progressSnapshot','queue']},
 {type:'session_execution',tag:'progress-results',from:['results'],to:['progressSnapshot','results']},
 {type:'session_execution',tag:'plan-queue',from:['queue'],to:['planSnapshot','queue']},
 {type:'session_execution',tag:'plan-blocks',from:['sourceSnapshot'],to:['planSnapshot','blocks']},
]);
const NESTED_RESTORE_ORDER=Object.freeze([
 'session-blocks','plan-queue','plan-blocks',
 'progress-plan','progress-queue','progress-results',
]);
const own=(value,key)=>object(value)&&Object.prototype.hasOwnProperty.call(value,key);
function nestedAt(root,path){
 let value=root;
 for(const key of path){
  if(!own(value,key))return undefined;
  value=value[key];
 }
 return value;
}
function nestedSet(root,path,value){
 let parent=root;
 for(const key of path.slice(0,-1)){
  if(!own(parent,key))return false;
  parent=parent[key];
 }
 if(!own(parent,path[path.length-1]))return false;
 parent[path[path.length-1]]=value;
 return true;
}
function nestedAlias(value){
 return own(value,NESTED_REF)&&Object.keys(value).length===1;
}
function packQaNestedHistory(snapshot){
 if(!qaCoach(snapshot)||!Array.isArray(snapshot?.data?.m26Entities))return snapshot;
 if(Object.prototype.hasOwnProperty.call(snapshot.data,NESTED_PACKET))
  throw new Error('U82_QA_HISTORY_NESTED_INVALID');
 const allowed=new Set((snapshot.data.clients||[]).map(client=>str(client?.id)));
 let changed=false;
 const entities=snapshot.data.m26Entities.map(entity=>{
  if(!allowed.has(str(entity?.clientId))||!object(entity?.body))return entity;
  let next=null;
  for(const rule of NESTED_RULES){
   if(rule.type!==entity.entityType)continue;
   const source=nestedAt(entity.body,rule.from);
   const target=nestedAt(entity.body,rule.to);
   if(!(object(source)||Array.isArray(source))
     ||!(object(target)||Array.isArray(target))
     ||nestedAlias(source)||nestedAlias(target))continue;
   const same=canon(source)===canon(target);
   if(!same||JSON.stringify(target).length<96)continue;
   next??={...entity,body:structuredClone(entity.body)};
   if(!nestedSet(next.body,rule.to,{[NESTED_REF]:rule.tag}))
    throw new Error('U82_QA_HISTORY_NESTED_INVALID');
  }
  if(next){changed=true;return next;}
  return entity;
 });
 return changed?{...snapshot,data:{...snapshot.data,m26Entities:entities,[NESTED_PACKET]:1}}:snapshot;
}
function unpackQaNestedHistory(snapshot){
 const packet=snapshot?.data&&Object.prototype.hasOwnProperty.call(snapshot.data,NESTED_PACKET);
 if(!packet)return snapshot;
 if(!qaCoach(snapshot)||snapshot.data[NESTED_PACKET]!==1||
    !Array.isArray(snapshot.data.m26Entities))
  throw new Error('U82_QA_HISTORY_NESTED_INVALID');
 const allowed=new Set((snapshot.data.clients||[]).map(client=>str(client?.id)));
 let restored=0;
 const entities=snapshot.data.m26Entities.map(entity=>{
  if(!object(entity?.body)||!allowed.has(str(entity?.clientId)))
   throw new Error('U82_QA_HISTORY_NESTED_INVALID');
  let next=null;
  for(const tag of NESTED_RESTORE_ORDER){
   const rule=NESTED_RULES.find(item=>item.tag===tag);
   if(rule.type!==entity.entityType)continue;
   const target=nestedAt(next?.body||entity.body,rule.to);
   if(!nestedAlias(target))continue;
   if(target[NESTED_REF]!==rule.tag)
    throw new Error('U82_QA_HISTORY_NESTED_INVALID');
   next??={...entity,body:structuredClone(entity.body)};
   const source=nestedAt(next.body,rule.from);
   if(!(object(source)||Array.isArray(source))||nestedAlias(source)
      ||!nestedSet(next.body,rule.to,structuredClone(source)))
    throw new Error('U82_QA_HISTORY_NESTED_INVALID');
   restored++;
  }
  return next||entity;
 });
 if(restored===0)throw new Error('U82_QA_HISTORY_NESTED_INVALID');
 const data={...snapshot.data,m26Entities:entities};
 delete data[NESTED_PACKET];
 return {...snapshot,data};
}

export function compactQaCanonicalExecutionSummaries(snapshot){
 if(!qaCoach(snapshot)||!Array.isArray(snapshot?.data?.sessionExecutions))return snapshot;
 const byId=index(snapshot);let count=0;
 const rows=snapshot.data.sessionExecutions.map(row=>{
  const e=byId.get(str(row?.id));
  if(!e||!validLineage(row,e)||!object(row.summary)||canon(row.summary)!==canon(e.body))
   return row;
  count++;
  return {...row,summary:{[REF]:row.id}};
 });
 const withSummaries=count?{...snapshot,data:{...snapshot.data,sessionExecutions:rows}}:snapshot;
 return compactQaHistoryTuples(packQaNestedHistory(withSummaries));
}
export function expandQaCanonicalExecutionSummaries(snapshot){
 snapshot=unpackQaNestedHistory(expandQaHistoryTuples(snapshot));
 const rows=snapshot?.data?.sessionExecutions;
 if(!Array.isArray(rows))return snapshot;
 let byId=null,count=0;
 const expanded=rows.map(row=>{
  const summary=row?.summary;
  if(!object(summary)||!Object.prototype.hasOwnProperty.call(summary,REF))return row;
  if(!qaCoach(snapshot)||Object.keys(summary).length!==1||
    !UUID.test(str(summary[REF]))||str(summary[REF])!==str(row.id))
   throw new Error('U48_QA_CANONICAL_SUMMARY_REF_INVALID');
  byId??=index(snapshot);
  const e=byId.get(str(row.id));
  if(!validLineage(row,e))throw new Error('U48_QA_CANONICAL_SUMMARY_LINEAGE_CONFLICT');
  count++;
  return {...row,summary:structuredClone(e.body)};
 });
 return count?{...snapshot,data:{...snapshot.data,sessionExecutions:expanded}}:snapshot;
}
export const __qaCanonicalSummaryTransportInternals=Object.freeze({REF,HISTORY_PACKS,MAX_TUPLE_ROWS});
