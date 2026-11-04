// SIGNATURE U30 · deterministic scheduling kernel. No side effects, no RPC.
// Feature is NOT live until the server commands and safe Client projection
// implement the same occurrence-scoped CAS, roles and idempotent receipts.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const CLOCK=/^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const ZONE='America/Santiago';
const MAX_OCCURRENCES=52;

function fail(code){throw new Error('U30_'+code);}
function uuid(value){
  const normalized=String(value||'').trim().toLowerCase();
  if(!UUID.test(normalized))fail('IDENTITY_INVALID');
  return normalized;
}
function localDate(value){
  const text=String(value||'').trim();
  if(!DATE.test(text))fail('LOCAL_DATE_INVALID');
  const [year,month,day]=text.split('-').map(Number);
  if(year<2020||year>2100)fail('LOCAL_DATE_INVALID');
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day)
    fail('LOCAL_DATE_INVALID');
  return text;
}
function localClock(value){
  if(value===null||value===undefined||value==='')return null;
  const text=String(value).trim();
  if(!CLOCK.test(text))fail('LOCAL_TIME_INVALID');
  return text;
}
function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
const formatter=new Intl.DateTimeFormat('en-US',{
  timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
function wallAt(utcMs){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(utcMs))
    .filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function resolveSantiagoLocalInstant(date,time,{disambiguation=null}={}){
  const day=localDate(date),clock=localClock(time);
  if(!clock)fail('LOCAL_TIME_REQUIRED');
  if(disambiguation!==null&&!['earlier','later'].includes(disambiguation))
    fail('DST_DISAMBIGUATION_INVALID');
  const naive=Date.parse(day+'T'+clock+':00.000Z');
  const candidates=[];
  // Sample the real IANA UTC offsets on both sides of the intended date.
  // This avoids 113 Intl calls per occurrence on a Coach mobile device while
  // still considering both offsets at DST folds and gaps in Santiago.
  const offsets=new Set();
  for(const shift of [-172_800_000,-86_400_000,0,86_400_000,172_800_000]){
    const sample=naive+shift;
    const sampledLocal=wallAt(sample);
    offsets.add((Date.parse(sampledLocal+':00.000Z')-sample)/60_000);
  }
  for(const offset of offsets){
    const instant=naive-offset*60_000;
    if(wallAt(instant)===day+'T'+clock)candidates.push(instant);
  }
  const matches=[...new Set(candidates)].sort((a,b)=>a-b);
  if(!matches.length)fail('DST_NONEXISTENT_LOCAL_TIME');
  if(matches.length>1&&disambiguation===null)fail('DST_AMBIGUOUS_LOCAL_TIME');
  return new Date(disambiguation==='later'?matches.at(-1):matches[0]).toISOString();
}
function overlap(a,b){return Date.parse(a.startsAt)<Date.parse(b.endsAt)&&Date.parse(b.startsAt)<Date.parse(a.endsAt);}
function positiveRevision(value){
  if(!Number.isSafeInteger(value)||value<0)fail('REVISION_INVALID');
  return value;
}
function snapshotForClient(value,{sessionId,clientId}){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('SNAPSHOT_INVALID');
  if(value.clientId&&String(value.clientId).toLowerCase()!==clientId)fail('SNAPSHOT_OWNER_MISMATCH');
  if(value.sessionId&&String(value.sessionId).toLowerCase()!==sessionId)fail('SNAPSHOT_SOURCE_MISMATCH');
  const text=JSON.stringify(value);
  if(!text||text.length>200_000)fail('SNAPSHOT_SIZE_INVALID');
  return deepFreeze(JSON.parse(text));
}

export function planDatedTrainingOccurrences({
  sessionId,clientId,sourceRevision,sourceSnapshot,
  cycleStartDate,cycleEndDate,dates=[],durationMinutes=60,
  existingOccurrences=[],existingAppointments=[],
}={}){
  const sourceId=uuid(sessionId),ownerId=uuid(clientId);
  const revision=positiveRevision(sourceRevision);
  const snapshot=snapshotForClient(sourceSnapshot,{sessionId:sourceId,clientId:ownerId});
  const start=localDate(cycleStartDate),end=localDate(cycleEndDate);
  if(end<start)fail('CYCLE_WINDOW_INVALID');
  if(!Number.isInteger(durationMinutes)||durationMinutes<10||durationMinutes>240)fail('DURATION_INVALID');
  if(!Array.isArray(dates)||!dates.length||dates.length>MAX_OCCURRENCES)fail('COUNT_INVALID');
  if(!Array.isArray(existingOccurrences)||!Array.isArray(existingAppointments))fail('EXISTING_INVALID');
  // Work with either the canonical camelCase projection or real SQL
  // snake_case records. Missing/partial timing must never silently bypass a
  // collision check for a Client (including a different session on that day).
  const field=(item,camel,snake)=>item?.[camel]??item?.[snake]??null;
  const owner=item=>String(field(item,'clientId','client_id')||'').trim().toLowerCase();
  const active=item=>!['cancelada','cancelled','canceled'].includes(
    String(item?.status||'').trim().toLowerCase());
  const existingWindow=item=>{
    const startsAt=field(item,'startsAt','starts_at')??item?.startAt??item?.start_at??null;
    const endsAt=field(item,'endsAt','ends_at')??item?.endAt??item?.end_at??null;
    if(startsAt===null&&endsAt===null)return null;
    if(startsAt===null||endsAt===null
      ||!Number.isFinite(Date.parse(startsAt))
      ||!Number.isFinite(Date.parse(endsAt))
      ||Date.parse(endsAt)<=Date.parse(startsAt))fail('EXISTING_TIME_INVALID');
    return {startsAt,endsAt};
  };
  const takenDays=new Set();
  const clientWindows=[];
  for(const item of existingOccurrences){
    const existingSession=String(field(item,'sessionId','session_id')||'')
      .trim().toLowerCase();
    const day=field(item,'localDate','local_date');
    if(existingSession===sourceId&&day!==null&&active(item))
      takenDays.add(localDate(day));
    if(owner(item)===ownerId&&active(item)){
      const window=existingWindow(item);
      if(window)clientWindows.push(window);
    }
  }
  for(const item of existingAppointments){
    if(owner(item)===ownerId&&active(item)){
      const window=existingWindow(item);
      if(window)clientWindows.push(window);
    }
  }
  const output=[];
  for(const input of dates){
    const fields=typeof input==='string'?{localDate:input}:input;
    if(!fields||typeof fields!=='object'||Array.isArray(fields))fail('DATE_ITEM_INVALID');
    const day=localDate(fields.localDate);
    if(day<start||day>end)fail('OUTSIDE_CYCLE');
    if(takenDays.has(day))fail('DUPLICATE_LOCAL_DAY');
    takenDays.add(day);
    const clock=localClock(fields.localTime);
    if(!clock&&fields.disambiguation!=null)fail('DST_DISAMBIGUATION_WITHOUT_TIME');
    const startsAt=clock?resolveSantiagoLocalInstant(day,clock,{
      disambiguation:fields.disambiguation??null,
    }):null;
    const endsAt=startsAt?new Date(Date.parse(startsAt)+durationMinutes*60_000).toISOString():null;
    const occurrence=deepFreeze({
      sessionId:sourceId,clientId:ownerId,localDate:day,
      localTime:clock,timeZone:ZONE,startsAt,endsAt,
      dstDisambiguation:clock?(fields.disambiguation??null):null,
      durationMinutes,prescriptionRevision:revision,
      prescriptionSnapshot:structuredClone(snapshot),
      status:'planificada',revision:0,
    });
    if(startsAt){
      for(const prior of clientWindows){
        if(overlap(occurrence,prior))fail('CLIENT_TIME_CONFLICT');
      }
      for(const other of output){
        if(other.startsAt&&overlap(occurrence,other))fail('CLIENT_TIME_CONFLICT');
      }
    }
    output.push(occurrence);
  }
  output.sort((a,b)=>a.localDate.localeCompare(b.localDate)||(a.startsAt||'').localeCompare(b.startsAt||''));
  return Object.freeze({count:output.length,timeZone:ZONE,occurrences:Object.freeze(output)});
}

const TRANSITIONS=Object.freeze({
  planificada:Object.freeze({confirm:'confirmada',cancel:'cancelada'}),
  confirmada:Object.freeze({start:'en_curso',cancel:'cancelada'}),
  en_curso:Object.freeze({complete:'completada'}),
});
export function prepareOccurrenceStateChange(record,{
  event,expectedRevision,executionId=null,
}={}){
  if(!record||typeof record!=='object')fail('OCCURRENCE_REQUIRED');
  const oldRevision=positiveRevision(record.revision);
  if(positiveRevision(expectedRevision)!==oldRevision)fail('REVISION_CONFLICT');
  const nextStatus=TRANSITIONS[String(record.status||'')]?.[event];
  if(!nextStatus)fail('TRANSITION_FORBIDDEN');
  const bound=record.executionId?uuid(record.executionId):null;
  if(event==='start'&&bound)fail('EXECUTION_ALREADY_BOUND');
  if(event==='start'&&!executionId)fail('EXECUTION_REQUIRED');
  if(event==='complete'&&(!bound||!executionId||uuid(executionId)!==bound))
    fail('EXECUTION_MISMATCH');
  return deepFreeze({
    ...structuredClone(record),status:nextStatus,revision:oldRevision+1,
    executionId:event==='start'?uuid(executionId):bound,
  });
}
export const __u30Testables=Object.freeze({localDate,localClock,wallAt,ZONE});

/** Strict pre-confirmed Coach command builder. Server validates independently. */
export function buildCoachOccurrenceBatchCommand({
  operationId,sessionId,clientId,baseRevision,preview,
  confirmed=false,appointmentIdsByDate={},
}={}){
  if(confirmed!==true)fail('PREVIEW_CONFIRMATION_REQUIRED');
  const operation=uuid(operationId),session=uuid(sessionId),client=uuid(clientId);
  const revision=positiveRevision(baseRevision);
  if(!preview||preview.timeZone!==ZONE||!Array.isArray(preview.occurrences)
    ||preview.count!==preview.occurrences.length||!preview.count
    ||preview.count>MAX_OCCURRENCES)fail('PREVIEW_INVALID');
  if(!appointmentIdsByDate||typeof appointmentIdsByDate!=='object'
    ||Array.isArray(appointmentIdsByDate))fail('APPOINTMENTS_INVALID');
  const seen=new Set();
  const dates=preview.occurrences.map(item=>{
    const day=localDate(item?.localDate);
    if(seen.has(day))fail('DUPLICATE_LOCAL_DAY');
    seen.add(day);
    if(uuid(item?.sessionId)!==session||uuid(item?.clientId)!==client
      ||positiveRevision(item?.prescriptionRevision)!==revision)
      fail('PREVIEW_SOURCE_CHANGED');
    const clock=localClock(item?.localTime);
    const date={localDate:day};
    if(clock){
      date.localTime=clock;
      if(item.dstDisambiguation!=null){
        if(!['earlier','later'].includes(item.dstDisambiguation))
          fail('DST_DISAMBIGUATION_INVALID');
        date.dstDisambiguation=item.dstDisambiguation;
      }
      const verified=resolveSantiagoLocalInstant(day,clock,{
        disambiguation:item.dstDisambiguation??null});
      if(item.startsAt!==verified)fail('PREVIEW_TIME_CHANGED');
    }else if(item.startsAt!==null||item.endsAt!==null)
      fail('PREVIEW_TIME_CHANGED');
    if(Object.hasOwn(appointmentIdsByDate,day)){
      if(!clock)fail('TIME_REQUIRED_FOR_APPOINTMENT');
      date.appointmentId=uuid(appointmentIdsByDate[day]);
    }
    return Object.freeze(date);
  });
  for(const key of Object.keys(appointmentIdsByDate))
    if(!seen.has(localDate(key)))fail('APPOINTMENT_DATE_NOT_SELECTED');
  return deepFreeze({type:'OCURRENCIAS_CREAR_LOTE',
    operationId:operation,clientId:client,entityId:session,
    baseRevision:revision,
    payload:{targetClientId:client,previewConfirmed:true,dates}});
}
