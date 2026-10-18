// A human-first read-only projection over the bounded, backend-authorised Admin audit snapshot.
// The backend snapshot has no outcome/result field: never infer that a logged action succeeded.
const str=(value)=>String(value??'').trim();
const records=(value)=>Array.isArray(value)?value:[];
const ENTITY_LABELS=Object.freeze({
  user:'Cuenta',organization_user:'Cuenta',client:'Cliente',coach:'Coach',
  organization:'Organización',appointment:'Cita',operational_task:'Incidencia',
  lead:'Contacto',application_role:'Permiso',coach_client_assignment:'Asignación',
});
const ROLE_LABELS=Object.freeze({admin:'Admin',coach:'Coach',client:'Cliente'});
function nameIndex(items,aliases=['id']){
  const map=new Map();
  for(const item of records(items)){
    if(!item||typeof item!=='object')continue;
    const id=aliases.map(k=>str(item[k])).find(Boolean);
    const name=str(item.name||item.fullName||item.email);
    if(id&&name&&!map.has(id))map.set(id,name);
  }
  return map;
}
function humanTime(raw,{timeZone,locale}){
  const time=Date.parse(str(raw));
  if(!Number.isFinite(time))return Object.freeze({iso:'',label:'Fecha no verificable',sort:-Infinity});
  try{
    const label=new Intl.DateTimeFormat(locale,{timeZone,
      day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',
      hour12:false}).format(new Date(time));
    return Object.freeze({iso:new Date(time).toISOString(),label,sort:time});
  }catch{
    return Object.freeze({iso:'',label:'Fecha no verificable',sort:-Infinity});
  }
}
export function deriveAdminAuditTimeline({
  events=[],users=[],clients=[],coaches=[],tasks=[],
  timeZone='America/Santiago',locale='es-CL',
}={}){
  const people=nameIndex(users,['userId','id']);
  const clientNames=nameIndex(clients,['id','clientId']);
  const coachNames=nameIndex(coaches,['userId','id']);
  const taskNames=new Map(records(tasks).map(item=>[str(item?.id),str(item?.title)]).filter(([id,name])=>id&&name));
  const sorted=records(events).filter(v=>v&&typeof v==='object').map((event,index)=>{
    const actorId=str(event.actorUserId);
    const actorName=actorId?people.get(actorId)||coachNames.get(actorId)||null:null;
    const actorLabel=!actorId?'Actor no indicado':actorName||'Identidad no identificada';
    const rawEntityType=str(event.entityType).toLowerCase();
    const entityType=ENTITY_LABELS[rawEntityType]||'Entidad';
    const entityId=str(event.entityId);
    const names=rawEntityType==='client'?clientNames:
      (rawEntityType==='user'||rawEntityType==='organization_user')?people:
      rawEntityType==='coach'?coachNames:
      rawEntityType==='operational_task'?taskNames:null;
    const entityName=entityId&&names?.get(entityId)||'';
    const entityLabel=entityName?`${entityType}: ${entityName}`:
      entityId?`${entityType} sin nombre verificado`:'Sin entidad indicada';
    const source=str(event.actorApplication).toLowerCase();
    const applicationLabel=ROLE_LABELS[source]||'Aplicación no identificada';
    const moment=humanTime(event.occurredAt,{timeZone,locale});
    return Object.freeze({
      event,actorLabel,entityLabel,applicationLabel,
      title:str(event.summary)||'Evento sin resumen',
      dateLabel:moment.label,dateIso:moment.iso,dateSort:moment.sort,
      resultLabel:'Resultado no registrado',index,
    });
  }).sort((a,b)=>b.dateSort-a.dateSort||a.index-b.index);
  const summary=Object.freeze({
    total:sorted.length,unidentifiedActors:sorted.filter(x=>x.actorLabel==='Identidad no identificada').length,
    unverifiedDates:sorted.filter(x=>!x.dateIso).length,
    outcomesUnavailable:sorted.length,
  });
  return Object.freeze({events:Object.freeze(sorted),summary});
}
