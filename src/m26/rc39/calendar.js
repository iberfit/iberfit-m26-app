const CRLF='\r\n';
const field=(record,...keys)=>{
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
};
const clean=(value,max=600)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const escapeIcs=(value)=>clean(value,4000)
  .replace(/\\/g,'\\\\')
  .replace(/\n/g,'\\n')
  .replace(/,/g,'\\,')
  .replace(/;/g,'\\;');
const utcStamp=(value)=>{
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error('M26_CALENDAR_DATE_INVALID');
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
};
const sequenceOf=(record)=>{
  const value=Number(field(record,'revision','sequence'));
  return Number.isInteger(value)&&value>=0?value:0;
};
export function appointmentCalendarEvent(appointment={},{
  appOrigin=globalThis.location?.origin||'https://app.iberfit.cl',
}={}){
  const id=clean(field(appointment,'id','entityId','entity_id'),180);
  const start=field(appointment,'startAt','start_at','scheduledAt','scheduled_at','date');
  const end=field(appointment,'endAt','end_at');
  if(!id||!start||!end)throw new Error('M26_CALENDAR_APPOINTMENT_INVALID');
  const sessionId=clean(field(appointment,'sessionId','session_id'),180);
  const title=clean(field(appointment,'title','titulo','name','nombre')||'Sesión IBERFIT',180);
  const modality=clean(field(appointment,'modalityLabel','modality','modalidad'),80);
  const location=clean(field(appointment,'location','ubicacion'),300);
  const coach=clean(field(appointment,'coachName','coach_name')||'Carlos · IBERFIT',160);
  const description=[
    modality?`Modalidad: ${modality}`:null,
    `Coach: ${coach}`,
    sessionId?`Abrir en IBERFIT: ${appOrigin}/?area=sesion&session=${encodeURIComponent(sessionId)}`:`IBERFIT: ${appOrigin}`,
  ].filter(Boolean).join('\n');
  return Object.freeze({
    uid:`appointment-${id}@iberfit.cl`,
    sequence:sequenceOf(appointment),
    title,
    start:new Date(start).toISOString(),
    end:new Date(end).toISOString(),
    location,
    description,
    status:/cancel/i.test(String(field(appointment,'status','estado')||''))?'CANCELLED':'CONFIRMED',
    url:sessionId?`${appOrigin}/?area=sesion&session=${encodeURIComponent(sessionId)}`:appOrigin,
  });
}
export function buildIcs(event){
  if(!event?.uid||!event?.start||!event?.end)throw new Error('M26_CALENDAR_EVENT_INVALID');
  const lines=[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IBERFIT//M26 RC39//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(event.uid)}`,
    `SEQUENCE:${Number(event.sequence)||0}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(event.end)}`,
    `SUMMARY:${escapeIcs(event.title||'Sesión IBERFIT')}`,
    `DESCRIPTION:${escapeIcs(event.description||'')}`,
    `LOCATION:${escapeIcs(event.location||'')}`,
    `URL:${escapeIcs(event.url||'')}`,
    `STATUS:${event.status||'CONFIRMED'}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Sesión IBERFIT mañana',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Sesión IBERFIT en una hora',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ];
  return lines.join(CRLF);
}
export function googleCalendarUrl(event){
  const params=new URLSearchParams({
    action:'TEMPLATE',
    text:event.title||'Sesión IBERFIT',
    dates:`${utcStamp(event.start)}/${utcStamp(event.end)}`,
    details:event.description||'',
    location:event.location||'',
    ctz:'America/Santiago',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
export function downloadIcs(event,{documentLike=globalThis.document,urlLike=globalThis.URL}={}){
  if(!documentLike?.createElement||!urlLike?.createObjectURL)throw new Error('M26_CALENDAR_DOWNLOAD_UNAVAILABLE');
  const blob=new Blob([buildIcs(event)],{type:'text/calendar;charset=utf-8'});
  const href=urlLike.createObjectURL(blob);
  const anchor=documentLike.createElement('a');
  anchor.href=href;
  anchor.download=`iberfit-${String(event.uid).replace(/[^a-z0-9.-]+/gi,'-')}.ics`;
  anchor.hidden=true;
  documentLike.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>urlLike.revokeObjectURL(href),0);
}
