// P0 #1209: fail-closed QA Client history page assembler.
// Independent of the UI and never a substitute for server-side ownership/RLS.
const SCHEMA='iberfit.client.completed-history.page.qa.v1';
const TYPES=new Set(['session','session_execution']);
const COMPLETED=new Set(['completado','completada','completed']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_ITEMS=32,MAX_BYTES=300_000,MAX_TOTAL=100_000;
function fail(code){throw new Error('M26_CLIENT_HISTORY_'+code);}
function validDate(s){return typeof s==='string'&&s.length<=50&&Number.isFinite(Date.parse(s));}
function validCursor(v){return v&&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).sort().join(',')==='at,id'&&validDate(v.at)&&UUID.test(String(v.id||''));}
function compareDesc(a,b){
  const t=Date.parse(b.updatedAt)-Date.parse(a.updatedAt);
  if(t!==0)return Math.sign(t);
  return String(b.entityId).localeCompare(String(a.entityId));
}
export function createClientCompletedHistoryPager({owner,clientId,section,limit=24}={}){
  if(!owner||typeof owner!=='object')fail('OWNER_REQUIRED');
  if(!UUID.test(String(clientId||'')))fail('CLIENT_REQUIRED');
  if(!TYPES.has(section))fail('SECTION_REQUIRED');
  if(!Number.isInteger(limit)||limit<1||limit>MAX_ITEMS)fail('LIMIT_INVALID');
  let snapshot=null,total=null,cursor=null,complete=false,cancelled=false;
  const records=[],known=new Set();
  function checkOwner(value){
    if(value!==owner||cancelled)fail('OWNER_STALE');
  }
  function nextRequest({requestOwner=owner}={}){
    checkOwner(requestOwner);
    if(complete)return null;
    return Object.freeze({
      p_section:section,p_snapshot_at:snapshot,p_cursor:cursor,
      p_expected_count:total,p_limit:limit,
    });
  }
  function accept({requestOwner,page}={}){
    checkOwner(requestOwner);
    if(complete)fail('ALREADY_COMPLETE');
    if(!page||typeof page!=='object'||Array.isArray(page)||page.schema!==SCHEMA
      ||page.section!==section||!validDate(page.snapshotAt)
      ||!Number.isSafeInteger(page.total)||page.total<0||page.total>MAX_TOTAL
      ||!Array.isArray(page.rows)||page.rows.length>limit
      ||typeof page.hasMore!=='boolean')fail('PAGE_INVALID');
    if(JSON.stringify(page).length>MAX_BYTES+10_000)fail('PAGE_OVERSIZE');
    if(snapshot===null){
      if(cursor!==null||total!==null)fail('STATE_INVALID');
      snapshot=page.snapshotAt;total=page.total;
    }else if(Date.parse(page.snapshotAt)!==Date.parse(snapshot)||page.total!==total)
      fail('SNAPSHOT_OR_COUNT_CHANGED');
    let previous=records.length?records[records.length-1]:null;
    for(const record of page.rows){
      if(!record||typeof record!=='object'||Array.isArray(record)
        ||record.entityType!==section||!UUID.test(String(record.entityId||''))
        ||String(record.clientId||'')!==clientId
        ||!COMPLETED.has(String(record.status||'').toLowerCase())
        ||!Number.isSafeInteger(Number(record.revision))||Number(record.revision)<0
        ||!validDate(record.updatedAt)||Date.parse(record.updatedAt)>Date.parse(snapshot)
        ||!record.body||typeof record.body!=='object'||Array.isArray(record.body)
        ||String(record.body.id||record.entityId)!==String(record.entityId)
        ||(record.body.clientId&&String(record.body.clientId)!==clientId))
        fail('RECORD_INVALID');
      const key=record.entityType+':'+record.entityId;
      if(known.has(key))fail('DUPLICATE');
      if(previous&&compareDesc(previous,record)>=0)fail('PAGE_ORDER_INVALID');
      known.add(key);records.push(structuredClone(record));previous=record;
    }
    if(records.length>total||records.length>MAX_TOTAL)fail('COUNT_OVERFLOW');
    if(page.hasMore){
      if(!page.rows.length||!validCursor(page.nextCursor)||records.length===total)fail('CURSOR_INVALID');
      const last=page.rows[page.rows.length-1];
      if(page.nextCursor.id!==last.entityId
         ||Date.parse(page.nextCursor.at)!==Date.parse(last.updatedAt))fail('CURSOR_MISMATCH');
      cursor=structuredClone(page.nextCursor);
    }else{
      if(page.nextCursor!==null||records.length!==total)fail('HISTORY_INCOMPLETE');
      cursor=null;complete=true;
    }
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
