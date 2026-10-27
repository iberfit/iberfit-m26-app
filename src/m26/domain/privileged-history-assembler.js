// SIGNATURE U36: fail-closed reconstruction contract for privileged history.
// Not wired to login until the core/history API and real WebAuthn gates pass.
// This module never authorizes a record: the server RPC must enforce role,
// client assignment and publication. These checks prevent stale/cross-owner
// pages from silently contaminating the authenticated canonical store.
const SECTIONS=Object.freeze(['m26Entities','domainEvents','sessionExecutions']);
const PAGE_SCHEMA='iberfit.u35.privileged-history-page.qa.v1';
const PAGE_LIMIT=32;
const U38_QA_PAGE_LIMITS=Object.freeze({m26Entities:256,domainEvents:512,sessionExecutions:64});
const U38_QA_BYTE_LIMIT=1_800_000;
const MAX_ITEMS_PER_SECTION=100_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
function failure(code){throw new Error('U36_HISTORY_'+code);}
function jsonEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function positiveDate(value){return typeof value==='string'&&value.length<=50&&Number.isFinite(Date.parse(value));}
function deepCopy(value){return structuredClone(value);}
function keyFor(section,item){
  if(section==='m26Entities'){
    if(!UUID.test(String(item?.entityId||''))||typeof item?.entityType!=='string'
      ||!/^[a-z][a-z0-9_]{0,63}$/u.test(item.entityType))failure('INVALID_ENTITY');
    return item.entityType+':'+item.entityId;
  }
  const id=String(item?.id??'');
  if(section==='domainEvents'){
    if((typeof item.id==='number'&&!Number.isSafeInteger(item.id))
      ||!/^[0-9]{1,19}$/u.test(id))failure('INVALID_EVENT_ID');
  }else if(!UUID.test(id))failure('INVALID_EXECUTION_ID');
  return id;
}
function clientFor(section,item){
  return String(section==='m26Entities'?item?.clientId:item?.client_id??'');
}
function rowTimestamp(section,record){
  const raw=section==='m26Entities'?record.updatedAt
    :section==='domainEvents'?record.created_at:record.updated_at;
  if(!positiveDate(raw))failure('INVALID_RECORD_DATE');
  return Date.parse(raw);
}
function cursorMatchesLastRow(section,cursor,record){
  if(rowTimestamp(section,record)!==Date.parse(cursor.at))return false;
  const actualId=String(section==='m26Entities'?record.entityId:record.id);
  return cursor.id===actualId
    &&(section!=='m26Entities'||cursor.type===record.entityType);
}
function compareEvents(a,b){
  const at=Date.parse(String(a?.created_at||''))||0,bt=Date.parse(String(b?.created_at||''))||0;
  if(at!==bt)return bt-at;
  try{
    const ai=BigInt(String(a?.id)),bi=BigInt(String(b?.id));
    return ai===bi?0:ai>bi?-1:1;
  }catch{return 0;}
}
function isCursor(value,section){
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||!positiveDate(value.at)||typeof value.id!=='string')return false;
  if(section==='m26Entities')
    return UUID.test(value.id)&&typeof value.type==='string'&&/^[a-z][a-z0-9_]{0,63}$/u.test(value.type);
  if(section==='domainEvents')return /^[0-9]{1,19}$/u.test(value.id);
  return UUID.test(value.id);
}
function readRevisionMap(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))failure('REVISION_MAP_REQUIRED');
  return value;
}
export function createPrivilegedHistoryAssembler(core,{owner,limit=PAGE_LIMIT,profile='standard'}={}){
  if(!owner||typeof owner!=='object')failure('OWNER_REQUIRED');
  if(!core||typeof core!=='object'||Array.isArray(core))failure('CORE_REQUIRED');
  if(!['coach','admin'].includes(String(core.user?.role||'').toLowerCase()))failure('PRIVILEGED_ROLE_REQUIRED');
  if(!core.data||typeof core.data!=='object'||Array.isArray(core.data))failure('DATA_REQUIRED');
  if(!Number.isInteger(limit)||limit<1||limit>PAGE_LIMIT)failure('PAGE_LIMIT_INVALID');
  if(!['standard','u38-qa-adaptive'].includes(profile))failure('PROFILE_NOT_ALLOWED');
  if(profile==='u38-qa-adaptive'&&core.environment!=='QA')
    failure('QA_PROFILE_OUTSIDE_QA');
  const pageLimits=profile==='u38-qa-adaptive'?U38_QA_PAGE_LIMITS
    :Object.freeze(Object.fromEntries(SECTIONS.map(section=>[section,limit])));
  for(const section of SECTIONS){
    if(!Array.isArray(core.data[section])||core.data[section].length!==0)
      failure('CORE_MUST_BE_LIGHT');
  }
  const clients=core.data.clients;
  if(!Array.isArray(clients))failure('CLIENT_LIST_REQUIRED');
  const clientIds=new Set();
  for(const client of clients){
    const id=String(client?.id||'');
    if(!UUID.test(id)||clientIds.has(id))failure('CLIENT_LIST_INVALID');
    clientIds.add(id);
  }
  const coreRevisions=readRevisionMap(core.remoteRevisions);
  const progress=new Map();
  const collected=Object.fromEntries(SECTIONS.map(section=>[section,[]]));
  let sealed=false;
  let totalReceived=0;
  const assertOwner=value=>{
    if(value!==owner||sealed)failure('OWNER_STALE_OR_ALREADY_COMPLETE');
  };

  function accept({owner:requestOwner,clientId,section,request,page}={}){
    assertOwner(requestOwner);
    if(!clientIds.has(String(clientId||'')))failure('CLIENT_NOT_IN_BOOTSTRAP');
    if(!SECTIONS.includes(section))failure('SECTION_NOT_ALLOWED');
    const token=section+':'+clientId;
    const current=progress.get(token)||null;
    if(!page||typeof page!=='object'||Array.isArray(page)||page.schema!==PAGE_SCHEMA
      ||page.section!==section||!positiveDate(page.snapshotAt))failure('PAGE_INVALID');
    if(!request||typeof request!=='object'||Array.isArray(request))failure('REQUEST_REQUIRED');
    if(!Array.isArray(page.records)||page.records.length>pageLimits[section])
      failure('PAGE_LIMIT_EXCEEDED');
    if(profile==='u38-qa-adaptive'&&new TextEncoder().encode(JSON.stringify(page.records)).length>U38_QA_BYTE_LIMIT)
      failure('PAGE_BYTES_EXCEEDED');
    if(!Number.isSafeInteger(page.totalCount)||page.totalCount<0
      ||page.totalCount>MAX_ITEMS_PER_SECTION)failure('TOTAL_COUNT_INVALID');
    if(typeof page.hasMore!=='boolean')failure('HAS_MORE_INVALID');
    if(page.hasMore?(!isCursor(page.nextCursor,section)||page.records.length===0)
      :page.nextCursor!==null)failure('CURSOR_INVALID');
    if(current){
      if(current.done)failure('SECTION_ALREADY_COMPLETE');
      if(!jsonEqual(request.cursor,current.cursor)
        ||request.snapshotAt!==current.snapshotAt
        ||request.expectedCount!==current.total)failure('REQUEST_OUT_OF_ORDER');
      if(page.snapshotAt!==current.snapshotAt||page.totalCount!==current.total)
        failure('SNAPSHOT_CHANGED');
    }else if(request.cursor!==null||request.snapshotAt!==null||request.expectedCount!==null)
      failure('FIRST_PAGE_REQUEST_INVALID');
    const map=section==='m26Entities'?readRevisionMap(page.remoteRevisions):null;
    const seen=current?.seen||new Set();
    const keys=[];
    const pageKeys=new Set();
    const records=[];
    let previousTimestamp=Infinity;
    for(const raw of page.records){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))failure('RECORD_INVALID');
      if(clientFor(section,raw)!==clientId)failure('CROSS_CLIENT_RECORD');
      const key=keyFor(section,raw);
      const timestamp=rowTimestamp(section,raw);
      if(timestamp>previousTimestamp)failure('PAGE_OUT_OF_ORDER');
      previousTimestamp=timestamp;
      if(seen.has(key)||pageKeys.has(key))failure('DUPLICATE_RECORD');
      pageKeys.add(key);
      if(section==='m26Entities'){
        const revision=coreRevisions[key];
        if(revision===undefined||!own(map,key)||!jsonEqual(map[key],revision)
          ||!jsonEqual(raw.revision,revision))failure('CANONICAL_REVISION_DRIFT');
      }
      keys.push(key);records.push(deepCopy(raw));
    }
    if(page.hasMore&&!cursorMatchesLastRow(section,page.nextCursor,records[records.length-1]))
      failure('CURSOR_NOT_LAST_RECORD');
    if(totalReceived+records.length>MAX_ITEMS_PER_SECTION*SECTIONS.length)failure('TOTAL_LIMIT_EXCEEDED');
    if((current?.received||0)+records.length>page.totalCount)failure('TOTAL_OVERFLOW');
    if(!page.hasMore&&(current?.received||0)+records.length!==page.totalCount)
      failure('TOTAL_UNDERRUN');
    if(page.hasMore&&(current?.received||0)+records.length>=page.totalCount)
      failure('INVALID_CONTINUATION');
    for(const key of keys)seen.add(key);
    collected[section].push(...records);
    totalReceived+=records.length;
    progress.set(token,{
      snapshotAt:page.snapshotAt,total:page.totalCount,seen,
      cursor:page.nextCursor,received:(current?.received||0)+records.length,
      done:!page.hasMore,
    });
    return Object.freeze({
      done:!page.hasMore,
      nextRequest:page.hasMore?Object.freeze({
        snapshotAt:page.snapshotAt,cursor:deepCopy(page.nextCursor),
        expectedCount:page.totalCount,
      }):null,
    });
  }

  function status(){
    const expected=clientIds.size*SECTIONS.length;
    const complete=[...progress.values()].filter(item=>item.done).length;
    return Object.freeze({expected,complete,records:totalReceived,ready:complete===expected});
  }

  function finish({owner:finishOwner}={}){
    assertOwner(finishOwner);
    if(!status().ready)failure('HISTORY_NOT_COMPLETE');
    sealed=true;
    const result=deepCopy(core);
    for(const section of SECTIONS){
      const entries=collected[section];
      result.data[section]=section==='domainEvents'?entries.sort(compareEvents):entries;
    }
    return result;
  }

  return Object.freeze({accept,status,finish});
}
export const __u36HistoryInternals=Object.freeze({SECTIONS,PAGE_SCHEMA,PAGE_LIMIT,U38_QA_PAGE_LIMITS});
