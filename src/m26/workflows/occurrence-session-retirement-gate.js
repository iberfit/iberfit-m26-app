// IBERFIT UNIVERSAL · authoritative, bounded U60 retirement preflight.
// A published prescription can have dates absent from the cached V26 bootstrap.
// Never infer "no linked dates" from an empty frontend collection. The Coach
// must verify the complete published cycle via authenticated U33 calendar.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DAY=86400000,MAX_WINDOWS=10,WINDOW_DAYS=92;
const error=code=>{throw new Error('U60_RETIRE_'+code);};
const field=(record,...keys)=>{
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body:{};
  for(const key of keys){
    const v=record?.[key]??body?.[key];
    if(v!==undefined&&v!==null&&v!=='')return v;
  }
  return null;
};
const uuid=value=>{
  const id=String(value||'').trim().toLowerCase();
  if(!UUID.test(id))error('IDENTITY_INVALID');
  return id;
};
function date(value){
  const str=String(value||'').trim();
  const raw=/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(str)?str.slice(0,10):'';
  const ms=Date.parse(raw+'T12:00:00Z');
  if(!raw||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==raw)
    error('CYCLE_DATE_INVALID');
  return raw;
}
function addDays(local,days){
  const ms=Date.parse(local+'T12:00:00Z');
  return new Date(ms+days*DAY).toISOString().slice(0,10);
}
export async function assertNoPendingSessionOccurrences({
  state,clientId,sessionId,readCalendar,maxWindows=MAX_WINDOWS,
}={}){
  if(typeof readCalendar!=='function')error('AUTHENTICATED_CALENDAR_REQUIRED');
  const owner=uuid(clientId),session=uuid(sessionId);
  if(!Number.isSafeInteger(maxWindows)||maxWindows<1||maxWindows>MAX_WINDOWS)
    error('WINDOW_LIMIT_INVALID');
  const rows=state?.collections?.sessions||[];
  const match=rows.filter(row=>String(field(row,'id','entityId','entity_id')||'').toLowerCase()===session
    &&String(field(row,'clientId','client_id')||'').toLowerCase()===owner);
  if(match.length!==1)error('SESSION_SCOPE_UNVERIFIED');
  // U32 only allows occurrences within the source's published cycle.
  // Missing cycle metadata is NOT proof of an empty date calendar.
  const cycleId=uuid(field(match[0],'cycleId','cycle_id'));
  const cycles=state?.collections?.trainingCycles||[];
  const cycle=cycles.filter(row=>String(field(row,'id','entityId','entity_id')||'').toLowerCase()===cycleId
    &&String(field(row,'clientId','client_id')||'').toLowerCase()===owner);
  if(cycle.length!==1)error('CYCLE_SCOPE_UNVERIFIED');
  const start=date(field(cycle[0],'startDate','start_date'));
  const end=date(field(cycle[0],'endDate','end_date'));
  if(start>end)error('CYCLE_RANGE_INVALID');
  const days=Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/DAY);
  if(days>=WINDOW_DAYS*maxWindows)error('CYCLE_RANGE_UNBOUNDED');
  let total=0,next=start;
  const seen=new Set();
  while(next<=end){
    const stop=addDays(next,WINDOW_DAYS-1);
    const upper=stop>end?end:stop;
    const result=await readCalendar({
      clientId:owner,startDate:next,endDate:upper,limit:50,
    });
    if(!result||String(result.clientId||'').toLowerCase()!==owner||
      String(result.startDate||'')!==next||
      String(result.endDate||'')!==upper||
      !Array.isArray(result.occurrences)||
      result.count!==result.occurrences.length||
      // A truncated page can look like an empty calendar. This preflight
      // must never authorize retirement until the entire date range was read.
      (result.hasMore!==undefined&&result.hasMore!==false)||
      result.nextCursor!=null)
      error('CALENDAR_RESPONSE_INVALID');
    for(const row of result.occurrences){
      if(!row||uuid(row.clientId)!==owner
        ||date(row.localDate)<next||date(row.localDate)>upper)
        error('CALENDAR_SCOPE_DRIFT');
      if(uuid(row.sessionId)!==session)continue;
      const id=uuid(row.id);
      if(seen.has(id))error('DUPLICATE_OCCURRENCE');
      seen.add(id);total++;
      if(!['cancelada','completada'].includes(row.status))
        error('ACTIVE_OCCURRENCE_EXISTS');
    }
    next=addDays(upper,1);
  }
  return Object.freeze({ok:true,clientId:owner,sessionId:session,
    verifiedOccurrences:total,verifiedThrough:end});
}
