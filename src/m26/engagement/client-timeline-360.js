import {
  buildProgressTimeline as buildBaseProgressTimeline,
  progressWindow,
} from './progress-engine.js';
import {
  isClientVisibleAppointment,
  normalizeAppointmentRecord,
} from '../domain/appointment.js';
import {parseDateValue} from '../domain/civil-date.js';

function arr(value){return Array.isArray(value)?value:[];}
function bodyOf(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};}
function value(record,...keys){
  const body=bodyOf(record);
  for(const key of keys){
    const found=record?.[key]??body?.[key];
    if(found!==undefined&&found!==null&&found!=='')return found;
  }
  return null;
}
function clean(value,max=220){
  const text=String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim();
  return text?text.slice(0,max):'';
}
function clientIdOf(record){return String(value(record,'clientId','client_id','clienteId','cliente_id')||'').trim();}
function recordId(record){return String(value(record,'id','entityId','entity_id')||'').trim();}
function dateOf(record){return value(
  record,
  'completedAt','completed_at','endedAt','ended_at','recordedAt','recorded_at',
  'assessmentDate','assessment_date','evaluatedAt','evaluated_at','startAt','start_at',
  'scheduledAt','scheduled_at','savedAt','saved_at','createdAt','created_at','date','fecha'
);}
function publishedAt(record){return value(record,'publishedAt','published_at');}
function safeDate(input){return parseDateValue(input);}
function within(input,start,end){
  const date=safeDate(input);
  return Boolean(date&&date.getTime()>=start.getTime()&&date.getTime()<=end.getTime());
}
function statusOf(record){return String(value(record,'status','estado')||'').trim().toLowerCase();}
function published(record){return ['published','publicado','active','activo'].includes(statusOf(record));}
function clientVisible(record){
  const explicit=value(record,'visibleToClient','visible_to_client','clientVisible','client_visible');
  if(explicit===false)return false;
  const folded=String(explicit??'').trim().toLowerCase();
  return !['false','0','no'].includes(folded);
}
function collection(state,key){return arr(state?.collections?.[key]);}
function forClient(state,key,clientId){return collection(state,key).filter((record)=>clientIdOf(record)===clientId);}
function rowDateKey(value){const date=safeDate(value);return date?date.toISOString():String(value||'');}
function sessionTitle(record){return clean(value(record,'title','sessionTitle','session_title','name','nombre'),140)||'Sesión IBERFIT';}
function publishedTitle(record,fallback){return clean(value(record,'title','titulo','name','nombre'),140)||fallback;}
function publicationDetail(kind,record){
  const summary=clean(value(record,'goal','objective','objetivo','summary','resumen'),180);
  const lead=({planning:'Plan publicado para el cliente',session:'Sesión publicada para el cliente',report:'Informe publicado para el cliente'})[kind]||'Contenido publicado';
  return summary?`${lead} · ${summary}`:lead;
}

function publicationRows(state,clientId,start,end){
  const rows=[];
  const definitions=[
    ['trainingCycles','planning','Plan IBERFIT'],
    ['sessions','session','Sesión IBERFIT'],
    ['reports','report','Informe IBERFIT'],
  ];
  for(const [collectionKey,kind,fallback] of definitions){
    for(const record of forClient(state,collectionKey,clientId)){
      const at=publishedAt(record);
      if(!published(record)||!clientVisible(record)||!at||!within(at,start,end))continue;
      rows.push({
        kind,
        date:at,
        title:publishedTitle(record,fallback),
        status:'publicado',
        detail:publicationDetail(kind,record),
      });
    }
  }
  return rows;
}

function appointmentRows(state,clientId,start,end){
  const rows=[];
  for(const record of forClient(state,'appointments',clientId)){
    if(!isClientVisibleAppointment(record))continue;
    const appointment=normalizeAppointmentRecord(record);
    if(!appointment.startAt||!within(appointment.startAt,start,end))continue;
    rows.push({
      kind:'appointment',
      date:appointment.startAt,
      title:appointment.title||'Sesión IBERFIT',
      status:appointment.status||'confirmada',
      detail:`Agenda · ${appointment.statusLabel}${appointment.modalityLabel?` · ${appointment.modalityLabel}`:''}`,
    });
  }
  return rows;
}

function onboardingRows(state,clientId,start,end){
  const client=collection(state,'clients').find((record)=>String(record?.id||'').trim()===clientId);
  const at=client?value(client,'createdAt','created_at'):null;
  if(!client||!at||!within(at,start,end))return [];
  return [{
    kind:'milestone',
    date:at,
    title:'Alta en IBERFIT',
    status:'confirmado',
    detail:'Inicio del historial confirmado del cliente',
  }];
}

function executionByDate(state,clientId){
  const map=new Map();
  for(const record of forClient(state,'sessionExecutions',clientId)){
    const key=rowDateKey(dateOf(record));
    if(!key)continue;
    const list=map.get(key)||[];
    list.push(record);
    map.set(key,list);
  }
  return map;
}
function feedbackOf(record){
  const body=bodyOf(record);
  const candidate=record?.feedback??body?.feedback;
  return candidate&&typeof candidate==='object'&&!Array.isArray(candidate)?candidate:{};
}
function painFlag(feedback){
  const raw=feedback?.pain??feedback?.dolor;
  if(raw===true)return true;
  return ['true','1','sí','si','yes'].includes(String(raw??'').trim().toLowerCase());
}
function enrichConfirmedExecutionRows(rows,state,clientId){
  const byDate=executionByDate(state,clientId);
  return rows.map((row)=>{
    if(row?.kind!=='execution')return row;
    const candidates=byDate.get(rowDateKey(row.date))||[];
    const match=candidates.find((record)=>sessionTitle(record)===clean(row.title,140))||candidates[0];
    if(!match)return row;
    const feedback=feedbackOf(match);
    if(!painFlag(feedback))return row;
    const notes=clean(feedback?.painNotes??feedback?.pain_notes??feedback?.dolorNotas??feedback?.dolor_notas,140);
    const suffix=notes?`Molestia registrada · ${notes}`:'Molestia registrada para seguimiento';
    return {...row,detail:row.detail?`${row.detail} · ${suffix}`:suffix};
  });
}

function fingerprint(row){
  return [String(row?.kind||''),rowDateKey(row?.date),clean(row?.title,140),clean(row?.detail,220)].join('|');
}

export function buildClientTimeline360(state,clientId,{now=new Date(),days=90,limit=24}={}){
  if(!clientId)return [];
  const {start,end}=progressWindow({now,days});
  const safeLimit=Number.isInteger(Number(limit))&&Number(limit)>=1&&Number(limit)<=200?Number(limit):24;
  const base=enrichConfirmedExecutionRows(
    buildBaseProgressTimeline(state,clientId,{now,days,limit:200}),
    state,
    clientId,
  );
  const combined=[
    ...base,
    ...onboardingRows(state,clientId,start,end),
    ...publicationRows(state,clientId,start,end),
    ...appointmentRows(state,clientId,start,end),
  ];
  const unique=[];
  const seen=new Set();
  for(const row of combined){
    const key=fingerprint(row);
    if(seen.has(key))continue;
    seen.add(key);
    unique.push(row);
  }
  return unique
    .sort((a,b)=>(safeDate(b?.date)?.getTime()||0)-(safeDate(a?.date)?.getTime()||0))
    .slice(0,safeLimit)
    .map((row)=>structuredClone(row));
}

// Intentional compatibility export: engagement/index.js promotes this richer,
// fail-closed timeline under the historical public name used by Cliente 360.
export const buildProgressTimeline=buildClientTimeline360;

export const __clientTimeline360Internals=Object.freeze({
  bodyOf,
  value,
  clean,
  clientIdOf,
  publishedAt,
  published,
  clientVisible,
  publicationRows,
  appointmentRows,
  onboardingRows,
  enrichConfirmedExecutionRows,
  fingerprint,
});
