// P0 #1209: fail-closed QA Client history page assembler.
// Independent of the UI and never a substitute for server-side ownership/RLS.
const SCHEMA='iberfit.client.completed-history.page.qa.v1';
const TYPES=new Set(['session','session_execution']);
const COMPLETED=new Set(['completado','completada','completed']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_ITEMS=32,MAX_BYTES=300_000,MAX_TOTAL=100_000;
function fail(code){throw new Error('M26_CLIENT_HISTORY_'+code);}
function validDate(s){return typeof s==='string'&&s.length<=50&&Number.isFinite(Date.parse(s));}
function micros(s){
  if(!validDate(s))fail('DATE_INVALID');
  const f=String(s).match(/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/u)?.[1]||'';
  return BigInt(Date.parse(s))*1000n+BigInt(f.padEnd(6,'0').slice(3,6)||'0');
}
function validCursor(v){return v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join(',')==='at,id'&&validDate(v.at)&&UUID.test(String(v.id||''));}
function compareDesc(a,b){
  const aTime=micros(a.updatedAt),bTime=micros(b.updatedAt);
  if(aTime!==bTime)return aTime>bTime?-1:1;
  return String(b.entityId).localeCompare(String(a.entityId));
}
export function createClientCompletedHistoryPager({owner,clientId,section,limit=24}={}){
  if(!owner||typeof owner!=='object')fail('OWNER_REQUIRED');
  if(!UUID.test(String(clientId||'')))fail('CLIENT_REQUIRED');
  if(!TYPES.has(section))fail('SECTION_REQUIRED');
  if(!Number.isInteger(limit)||limit<1||limit>MAX_ITEMS)fail('LIMIT_INVALID');
  let snapshot=null,total=null,fingerprint=null,cursor=null,complete=false,cancelled=false;
  const records=[],known=new Set();
  function checkOwner(value){
    if(value!==owner||cancelled)fail('OWNER_STALE');
  }
  function nextRequest({requestOwner=owner}={}){
    checkOwner(requestOwner);
    if(complete)return null;
    return Object.freeze({
      p_section:section,p_snapshot_at:snapshot,p_cursor:cursor,
      p_expected_count:total,p_expected_fingerprint:fingerprint,p_limit:limit,
    });
  }
  function accept({requestOwner,page}={}){
    checkOwner(requestOwner);
    if(complete)fail('ALREADY_COMPLETE');
    if(!page||typeof page!=='object'||Array.isArray(page)||page.schema!==SCHEMA
      ||page.section!==section||!validDate(page.snapshotAt)
      ||!Number.isSafeInteger(page.total)||page.total<0||page.total>MAX_TOTAL
      ||typeof page.fingerprint!=='string'||!/^[a-f0-9]{32}$/u.test(page.fingerprint)
      ||!Array.isArray(page.rows)||page.rows.length>limit
      ||typeof page.hasMore!=='boolean')fail('PAGE_INVALID');
    if(JSON.stringify(page).length>MAX_BYTES+10_000)fail('PAGE_OVERSIZE');
    const targetSnapshot=snapshot??page.snapshotAt,targetTotal=total??page.total;
    const targetFingerprint=fingerprint??page.fingerprint;
    if(snapshot!==null&&(micros(page.snapshotAt)!==micros(snapshot)||page.total!==total
       ||page.fingerprint!==fingerprint))
      fail('SNAPSHOT_OR_COUNT_CHANGED');
    const added=[],newKeys=new Set();
    let previous=records.length?records[records.length-1]:null;
    for(const record of page.rows){
      if(!record||typeof record!=='object'||Array.isArray(record)
        ||record.entityType!==section||!UUID.test(String(record.entityId||''))
        ||String(record.clientId||'')!==clientId
        ||!COMPLETED.has(String(record.status||'').toLowerCase())
        ||!Number.isSafeInteger(record.revision)||record.revision<0
        ||!validDate(record.updatedAt)||micros(record.updatedAt)>micros(targetSnapshot)
        ||!record.body||typeof record.body!=='object'||Array.isArray(record.body)
        ||String(record.body.id||record.entityId)!==String(record.entityId)
        ||(record.body.clientId&&String(record.body.clientId)!==clientId))fail('RECORD_INVALID');
      const key=record.entityType+':'+record.entityId;
      if(known.has(key)||newKeys.has(key))fail('DUPLICATE');
      if(previous&&compareDesc(previous,record)>=0)fail('PAGE_ORDER_INVALID');
      newKeys.add(key);added.push(structuredClone(record));previous=record;
    }
    const nextCount=records.length+added.length;
    if(nextCount>targetTotal||nextCount>MAX_TOTAL)fail('COUNT_OVERFLOW');
    let nextCursor=null;
    if(page.hasMore){
      if(!page.rows.length||!validCursor(page.nextCursor)||nextCount===targetTotal)fail('CURSOR_INVALID');
      const last=page.rows[page.rows.length-1];
      if(page.nextCursor.id!==last.entityId
         ||micros(page.nextCursor.at)!==micros(last.updatedAt))fail('CURSOR_MISMATCH');
      nextCursor=structuredClone(page.nextCursor);
    }else if(page.nextCursor!==null||nextCount!==targetTotal)fail('HISTORY_INCOMPLETE');
    // Commit atomically. Rejected pages never contaminate the next retry.
    snapshot=targetSnapshot;total=targetTotal;fingerprint=targetFingerprint;cursor=nextCursor;
    records.push(...added);for(const key of newKeys)known.add(key);
    if(!page.hasMore)complete=true;
    return status();
  }
  function status(){return Object.freeze({ready:complete,cancelled,received:records.length,total,section});}
  function finish({requestOwner=owner}={}){
    checkOwner(requestOwner);
    if(!complete)fail('HISTORY_INCOMPLETE');
    return Object.freeze(structuredClone(records));
  }
  function cancel(){cancelled=true;cursor=null;records.length=0;known.clear();}
  return Object.freeze({nextRequest,accept,status,finish,cancel});
}
