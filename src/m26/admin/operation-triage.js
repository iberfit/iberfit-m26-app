// Read-only operational triage: no task mutations, inferred owners or fabricated deadlines.
const CLOSED=new Set(['resolved','cancelled','canceled','closed','resuelto','cancelado','cerrado']);
const PRIORITIES=Object.freeze({critical:{rank:0,label:'Crítica'},high:{rank:1,label:'Alta'},normal:{rank:2,label:'Normal'}});
const str=(value)=>String(value??'').trim();
const list=(value)=>Array.isArray(value)?value:[];
const priority=(value)=>PRIORITIES[str(value).toLowerCase()]||PRIORITIES.normal;
export function isOperationalTaskOpen(task){return !CLOSED.has(str(task?.status).toLowerCase());}
function validDateOnly(raw){
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(raw))return null;
  const date=new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===raw?raw:null;
}
function dayAt(value,timeZone){
  const date=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(date.getTime()))return null;
  try{
    const pieces=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const field=(name)=>pieces.find((piece)=>piece.type===name)?.value||'';
    return `${field('year')}-${field('month')}-${field('day')}`;
  }catch{return null;}
}
function dueDate(raw,timeZone){
  const value=str(raw);
  if(!value)return null;
  const dayOnly=validDateOnly(value);
  if(dayOnly)return Object.freeze({day:dayOnly,label:dayOnly.split('-').reverse().join('/'),dateOnly:true});
  if(/^\d{4}-\d{2}-\d{2}$/u.test(value))return null;
  const time=Date.parse(value);
  if(!Number.isFinite(time))return null;
  const day=dayAt(time,timeZone);
  if(!day)return null;
  try{
    const label=new Intl.DateTimeFormat('es-CL',{timeZone,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));
    return Object.freeze({day,label,dateOnly:false});
  }catch{return null;}
}
function createdTime(item){
  const parsed=Date.parse(str(item?.createdAt||item?.updatedAt));
  return Number.isFinite(parsed)?parsed:0;
}
export function deriveAdminOperationsTriage({tasks=[],users=[],now=new Date(),timeZone='America/Santiago'}={}){
  const today=dayAt(now,timeZone);
  const names=new Map(list(users).filter(Boolean).map((user)=>[
    str(user.userId||user.id),str(user.name||user.email),
  ]).filter(([id])=>id));
  const all=list(tasks).filter((item)=>item&&typeof item==='object').map((task)=>{
    const open=isOperationalTaskOpen(task);
    const level=priority(task.priority);
    const due=dueDate(task.dueAt,timeZone);
    const overdue=Boolean(open&&today&&due?.day&&due.day<today);
    const dueToday=Boolean(open&&today&&due?.day&&due.day===today);
    const assignedId=str(task.assigneeUserId);
    const ownerLabel=!assignedId?'Sin responsable asignado':names.get(assignedId)||'Responsable sin nombre verificado';
    return Object.freeze({
      task,open,priorityRank:level.rank,priorityLabel:level.label,
      overdue,dueToday,dueLabel:due?.label||null,dueDay:due?.day||null,
      ownerLabel,unassigned:!assignedId,createdAtSort:createdTime(task),
    });
  });
  const open=all.filter((item)=>item.open).sort((a,b)=>
    a.priorityRank-b.priorityRank||
    Number(b.overdue)-Number(a.overdue)||
    Number(b.dueToday)-Number(a.dueToday)||
    (a.dueDay||'9999-99-99').localeCompare(b.dueDay||'9999-99-99')||
    b.createdAtSort-a.createdAtSort||
    str(a.task.id).localeCompare(str(b.task.id))
  );
  const history=all.filter((item)=>!item.open).sort((a,b)=>
    (Date.parse(str(b.task.resolvedAt||b.task.updatedAt))||b.createdAtSort)-
    (Date.parse(str(a.task.resolvedAt||a.task.updatedAt))||a.createdAtSort)
  );
  const summary=Object.freeze({
    open:open.length,critical:open.filter(x=>x.priorityRank===0).length,
    high:open.filter(x=>x.priorityRank===1).length,
    overdue:open.filter(x=>x.overdue).length,
    unassigned:open.filter(x=>x.unassigned).length,
    history:history.length,
  });
  return Object.freeze({open:Object.freeze(open),history:Object.freeze(history),summary});
}
