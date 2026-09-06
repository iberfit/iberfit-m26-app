import {messagesForThread} from './state.js';
import {buildCrmRenewalSummary} from '../engagement/crm-renewals.js';
import {augmentCoachCockpitWithCrm} from '../experience/coach-cockpit.js';

const list=(value)=>Array.isArray(value)?value:[];
const field=(record,...keys)=>{
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
};
const RENEWAL_STATUSES=Object.freeze(['overdue','upcoming','current','completed','insufficient']);
const RENEWAL_LABELS=Object.freeze({
  overdue:'Renovación por revisar',
  upcoming:'Renovación próxima',
  current:'Renovación vigente',
  completed:'Renovación completada',
  insufficient:'Renovación sin evidencia',
});
const PORTFOLIO_STYLE_ID='m26-commercial-portfolio-styles';
let commercialPortfolioSnapshot=Object.freeze({rows:Object.freeze([]),counts:Object.freeze({overdue:0,upcoming:0,current:0,completed:0,insufficient:0}),total:0});
let commercialEnhancementQueued=false;

function renewalStatus(value){
  const normalized=String(value||'').trim().toLowerCase();
  return RENEWAL_STATUSES.includes(normalized)?normalized:'insufficient';
}
export function commercialRenewalLabel(status){
  return RENEWAL_LABELS[renewalStatus(status)];
}
function plainDateLabel(value){
  const match=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match?`${match[3]}/${match[2]}/${match[1]}`:'';
}
function commercialClientName(vm,state,clientIdValue){
  const id=String(clientIdValue||'').trim();
  const fromVm=list(vm?.clients).find((client)=>String(client?.id||'').trim()===id);
  const vmName=String(fromVm?.name||'').trim();
  if(vmName)return vmName;
  const record=list(state?.collections?.clients).find((client)=>String(client?.id||'').trim()===id);
  return String(field(record,'name','nombre')||'Cliente').trim()||'Cliente';
}
function commercialClientIds(vm,state){
  if(!vm?.coachCockpit)return [];
  if(vm.kind==='hoy'){
    return [...new Set(
      list(vm.clients)
        .map((client)=>String(client?.id||'').trim())
        .filter(Boolean)
    )];
  }
  if(vm.kind==='expediente'){
    const id=String(state?.selectedClientId||'').trim();
    return id?[id]:[];
  }
  return [];
}
function portfolioCounts(rows){
  const counts={overdue:0,upcoming:0,current:0,completed:0,insufficient:0};
  for(const row of rows)counts[renewalStatus(row?.renewal?.status)]+=1;
  return Object.freeze(counts);
}
function portfolioRow(vm,state,client,now){
  const id=String(client?.id||'').trim();
  if(!id)return null;
  const crm=buildCrmRenewalSummary(state,id,{now});
  if(!crm)return null;
  const status=renewalStatus(crm?.renewal?.status);
  return Object.freeze({
    clientId:id,
    clientName:commercialClientName(vm,state,id),
    plan:crm?.client?.plan||null,
    modality:crm?.client?.modality||null,
    renewal:Object.freeze({
      status,
      label:commercialRenewalLabel(status),
      date:crm?.renewal?.date||null,
      dateLabel:plainDateLabel(crm?.renewal?.date),
      evidence:crm?.renewal?.evidence||null,
      requiresHumanDecision:status==='overdue'||status==='upcoming',
    }),
    payment:Object.freeze({
      status:crm?.payment?.status||'insufficient',
      available:crm?.payment?.available===true,
    }),
  });
}
function portfolioSnapshot(rows){
  const safeRows=Object.freeze(rows.filter(Boolean));
  return Object.freeze({rows:safeRows,counts:portfolioCounts(safeRows),total:safeRows.length});
}
export function applyCommercialPortfolio(vm,state,now=new Date()){
  const role=String(vm?.role||state?.identity?.role||'').trim().toLowerCase();
  if(vm?.kind!=='clientes'||!['coach','admin'].includes(role)||!state){
    commercialPortfolioSnapshot=portfolioSnapshot([]);
    return vm;
  }
  const rows=list(vm.clients).map((client)=>portfolioRow(vm,state,client,now)).filter(Boolean);
  const snapshot=portfolioSnapshot(rows);
  commercialPortfolioSnapshot=snapshot;
  scheduleCommercialPortfolioEnhancement();
  const byId=new Map(rows.map((row)=>[row.clientId,row]));
  return Object.freeze({
    ...vm,
    clients:Object.freeze(list(vm.clients).map((client)=>Object.freeze({...client,commercial:byId.get(String(client?.id||'').trim())||null}))),
    commercialPortfolio:snapshot,
  });
}
export function applyCommercialCoachCockpit(vm,state,now=new Date()){
  if(!vm?.coachCockpit||!state)return vm;
  const ids=commercialClientIds(vm,state);
  if(!ids.length)return vm;
  const summaries=ids
    .map((id)=>buildCrmRenewalSummary(state,id,{now}))
    .filter(Boolean)
    .map((crm)=>Object.freeze({
      ...crm,
      clientName:commercialClientName(vm,state,crm.clientId),
    }));
  if(!summaries.length)return vm;
  return Object.freeze({
    ...vm,
    coachCockpit:augmentCoachCockpitWithCrm(vm.coachCockpit,summaries),
  });
}
function ensurePortfolioStyles(documentLike){
  if(!documentLike?.createElement||documentLike.getElementById?.(PORTFOLIO_STYLE_ID))return;
  const style=documentLike.createElement('style');
  style.id=PORTFOLIO_STYLE_ID;
  style.textContent=`
.m26-commercial-portfolio{display:grid;gap:.8rem;padding:1rem 1.05rem;border:1px solid rgba(216,185,111,.14);border-radius:1rem;background:linear-gradient(135deg,rgba(216,185,111,.055),rgba(8,31,21,.72))}
.m26-commercial-portfolio-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.m26-commercial-portfolio-head h3{margin:.18rem 0 .2rem}.m26-commercial-portfolio-head p{margin:0;color:#aaa499;font-size:.78rem;line-height:1.45}
.m26-commercial-portfolio-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}.m26-commercial-portfolio-grid div{display:grid;gap:.18rem;padding:.68rem .72rem;border:1px solid rgba(216,185,111,.1);border-radius:.75rem;background:rgba(255,255,255,.018)}.m26-commercial-portfolio-grid span{color:#aaa499;font-size:.68rem}.m26-commercial-portfolio-grid strong{font-size:1rem}
.m26-commercial-renewal{display:grid;gap:.14rem;margin-top:.18rem;padding:.42rem .5rem;border:1px solid rgba(216,185,111,.11);border-radius:.58rem;background:rgba(255,255,255,.018);text-align:left}.m26-commercial-renewal strong{font-size:.72rem}.m26-commercial-renewal small{font-size:.64rem;line-height:1.35}.m26-commercial-renewal.is-overdue{border-color:rgba(216,185,111,.3);background:rgba(216,185,111,.075)}.m26-commercial-renewal.is-upcoming{border-color:rgba(216,185,111,.2)}.m26-commercial-renewal.is-insufficient{opacity:.74}
@media(max-width:760px){.m26-commercial-portfolio-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.m26-commercial-portfolio-head{display:grid}}
`;
  documentLike.head?.append?.(style);
}
function renewalDetail(row){
  const date=row?.renewal?.dateLabel;
  const status=renewalStatus(row?.renewal?.status);
  if(status==='overdue')return `${date?`Fecha registrada: ${date}. `:''}Revisión comercial manual; no implica impago ni abandono.`;
  if(status==='upcoming')return `${date?`Fecha registrada: ${date}. `:''}Preparar continuidad comercial; no es una señal automática de riesgo.`;
  if(status==='current')return date?`Fecha comercial registrada: ${date}.`:'Continuidad comercial explícita registrada.';
  if(status==='completed')return date?`Renovación registrada: ${date}.`:'Renovación explícita registrada.';
  return 'No existe evidencia comercial explícita suficiente para determinar la renovación.';
}
function createPortfolioSummary(documentLike,snapshot){
  const section=documentLike.createElement('section');
  section.className='m26-commercial-portfolio';
  section.setAttribute('data-m26-commercial-portfolio','true');
  const head=documentLike.createElement('div');
  head.className='m26-commercial-portfolio-head';
  const copy=documentLike.createElement('div');
  const eyebrow=documentLike.createElement('p');
  eyebrow.className='m26-eyebrow';
  eyebrow.textContent='Continuidad comercial';
  const title=documentLike.createElement('h3');
  title.textContent='Renovaciones de cartera';
  const note=documentLike.createElement('p');
  note.textContent='Sólo se muestran fechas y estados con evidencia canónica. Una fecha vencida no equivale a impago ni abandono.';
  copy.append(eyebrow,title,note);
  head.append(copy);
  const grid=documentLike.createElement('div');
  grid.className='m26-commercial-portfolio-grid';
  const groups=[
    ['Por revisar',snapshot.counts.overdue],
    ['Próximas',snapshot.counts.upcoming],
    ['Vigentes / completadas',snapshot.counts.current+snapshot.counts.completed],
    ['Sin evidencia',snapshot.counts.insufficient],
  ];
  for(const [label,count] of groups){
    const item=documentLike.createElement('div');
    const span=documentLike.createElement('span');
    const strong=documentLike.createElement('strong');
    span.textContent=label;
    strong.textContent=String(count);
    item.append(span,strong);
    grid.append(item);
  }
  section.append(head,grid);
  return section;
}
export function enhanceCommercialPortfolio(root,snapshot=commercialPortfolioSnapshot){
  if(!root?.querySelector||!snapshot?.rows?.length)return false;
  const documentLike=root.ownerDocument||globalThis.document;
  if(!documentLike?.createElement)return false;
  ensurePortfolioStyles(documentLike);
  root.querySelector?.('[data-m26-commercial-portfolio]')?.remove?.();
  const intro=root.querySelector?.('.m26-route .m26-route-intro');
  if(intro?.parentNode){
    const summary=createPortfolioSummary(documentLike,snapshot);
    intro.parentNode.insertBefore(summary,intro.nextSibling||null);
  }
  const byId=new Map(snapshot.rows.map((row)=>[row.clientId,row]));
  for(const card of root.querySelectorAll?.('.m26-client-card')||[]){
    const button=card.querySelector?.('[data-m26-select-client]');
    const row=byId.get(String(button?.getAttribute?.('data-m26-select-client')||'').trim());
    if(!row)continue;
    const status=renewalStatus(row.renewal?.status);
    card.dataset.clientRenewal=status;
    const meta=card.querySelector?.('.m26-client-meta');
    if(!meta)continue;
    let block=meta.querySelector?.('.m26-commercial-renewal');
    if(!block){
      block=documentLike.createElement('div');
      block.className='m26-commercial-renewal';
      const strong=documentLike.createElement('strong');
      const small=documentLike.createElement('small');
      block.append(strong,small);
      meta.insertBefore?.(block,meta.firstChild||null);
    }
    block.className=`m26-commercial-renewal is-${status}`;
    const strong=block.querySelector?.('strong');
    const small=block.querySelector?.('small');
    if(strong)strong.textContent=commercialRenewalLabel(status);
    if(small)small.textContent=renewalDetail(row);
  }
  return true;
}
function scheduleCommercialPortfolioEnhancement(){
  const documentLike=globalThis.document;
  if(!documentLike?.querySelector||commercialEnhancementQueued)return;
  commercialEnhancementQueued=true;
  const run=()=>{
    commercialEnhancementQueued=false;
    const root=documentLike.querySelector('#app')||documentLike.body;
    enhanceCommercialPortfolio(root,commercialPortfolioSnapshot);
  };
  if(typeof globalThis.queueMicrotask==='function')globalThis.queueMicrotask(run);
  else Promise.resolve().then(run);
}
function routeNow(base,state){
  const raw=base?.rc39?.generatedAt||state?.hydration?.serverTime||null;
  const parsed=raw?new Date(raw):null;
  return parsed&&!Number.isNaN(parsed.getTime())?parsed:new Date();
}
export function createCommunicationRouteViewModel(base,shellVm,state){
  const now=routeNow(base,state);
  const portfolio=applyCommercialPortfolio(base,state,now);
  const projected=applyCommercialCoachCockpit(portfolio,state,now);
  const area=String(shellVm?.activeArea||state?.activeArea||'');
  const role=String(shellVm?.identity?.role||state?.identity?.role||'').toLowerCase();
  if(area!=='mensajes'||!['client','coach'].includes(role))return projected;
  if(state?.communication?.available!==true)return Object.freeze({...projected,communication:true,kind:'communication-unavailable',reason:state?.communication?.reason||'backend_unavailable',role});
  return Object.freeze({...projected,communication:true,kind:'communication',role,threads:Object.freeze((state.communication.threads||[]).map((t)=>Object.freeze({...structuredClone(t),messages:messagesForThread(state,t.id)}))),notifications:Object.freeze(structuredClone(state.communication.notifications||[])),clients:role==='coach'?Object.freeze(structuredClone(state.collections?.clients||[])):Object.freeze([]),canOpenThread:role==='coach'});
}