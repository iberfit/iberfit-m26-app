import {parseDateValue} from '../domain/civil-date.js';
import {normalizeClientProfile} from '../domain/client-profile.js';

const DAY_MS=86_400_000;
const COMMERCIAL_ENTITY_TYPES=new Set([
  'crm','commercial','comercial','renewal','renovacion','subscription','membership',
  'service_contract','commercial_contract','plan_contract',
]);
const COACH_ADMIN_ROLES=new Set(['coach','admin']);

function arr(value){return Array.isArray(value)?value:[];}
function bodyOf(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};}
function clean(value,max=220){
  const text=String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim();
  return text?text.slice(0,max):'';
}
function fold(value){return clean(value,180).normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase();}
function value(record,...keys){
  const body=bodyOf(record);
  for(const key of keys){
    const found=record?.[key]??body?.[key];
    if(found!==undefined&&found!==null&&found!=='')return found;
  }
  return null;
}
function clientIdOf(record){return clean(value(record,'clientId','client_id','clienteId','cliente_id'),160);}
function recordId(record){return clean(value(record,'id','entityId','entity_id','operationId','operation_id'),160);}
function dateOf(record){return value(record,'occurredAt','occurred_at','completedAt','completed_at','updatedAt','updated_at','createdAt','created_at','date','fecha');}
function safeDate(input){return input===null||input===undefined||input===''?null:parseDateValue(input);}
function isoDate(input){const date=safeDate(input);return date?date.toISOString():null;}
function collection(state,key){return arr(state?.collections?.[key]);}
function forClient(state,key,clientId){return collection(state,key).filter((record)=>clientIdOf(record)===clientId);}
function byNewest(a,b){return (safeDate(dateOf(b))?.getTime()||0)-(safeDate(dateOf(a))?.getTime()||0);}
function latest(records){return [...records].sort(byNewest)[0]||null;}
function deepFreeze(value,seen=new WeakSet()){
  if(!value||typeof value!=='object'||seen.has(value))return value;
  seen.add(value);
  for(const child of Object.values(value))deepFreeze(child,seen);
  return Object.freeze(value);
}
function entityTypeOf(record){return fold(value(record,'entityType','entity_type','domain','kind','type'));
}
function relevantCommercialEntity(record){return COMMERCIAL_ENTITY_TYPES.has(entityTypeOf(record));}
function explicitField(records,keys){
  for(const item of records){
    const found=value(item.record,...keys);
    if(found!==null&&found!==undefined&&found!=='')return {value:found,source:item.source,recordId:recordId(item.record)||null};
  }
  return null;
}
function provenanceFact(field,evidence){
  return evidence?Object.freeze({field,source:evidence.source,recordId:evidence.recordId||null}):null;
}
function normalizedClientStatus(raw){
  const text=fold(raw);
  if(!text)return null;
  if(['active','activo','activa'].includes(text))return 'active';
  if(['paused','pausado','pausada','suspended','suspendido','suspendida'].includes(text))return 'paused';
  if(['inactive','inactivo','inactiva','cancelled','canceled','cancelado','cancelada','baja'].includes(text))return 'inactive';
  if(['pending','pendiente','draft','borrador'].includes(text))return 'pending';
  return 'other';
}
function normalizedRenewalStatus(raw){
  const text=fold(raw);
  if(!text)return null;
  if(['renewed','renovado','renovada','completed','completado','completada','complete'].includes(text))return 'completed';
  if(['overdue','vencido','vencida','past_due','past-due'].includes(text))return 'overdue';
  if(['upcoming','proximo','proxima','pending','pendiente','scheduled','programado','programada'].includes(text))return 'upcoming';
  if(['current','active','activo','activa','ok'].includes(text))return 'current';
  return 'other';
}
function renewalState({renewalDate,explicitStatus,now,upcomingDays}){
  const status=normalizedRenewalStatus(explicitStatus);
  const date=safeDate(renewalDate);
  if(status==='completed')return {status:'completed',daysToRenewal:date?Math.ceil((date.getTime()-now.getTime())/DAY_MS):null};
  if(status==='overdue')return {status:'overdue',daysToRenewal:date?Math.ceil((date.getTime()-now.getTime())/DAY_MS):null};
  if(!date){
    if(status==='upcoming'||status==='current')return {status,daysToRenewal:null};
    return {status:'insufficient',daysToRenewal:null};
  }
  const days=Math.ceil((date.getTime()-now.getTime())/DAY_MS);
  if(days<0)return {status:'overdue',daysToRenewal:days};
  if(days<=upcomingDays)return {status:'upcoming',daysToRenewal:days};
  return {status:'current',daysToRenewal:days};
}
function statusLabel(status){
  return ({
    active:'Activo',paused:'Pausado',inactive:'Inactivo',pending:'Pendiente',other:'Estado registrado',
    completed:'Renovación confirmada',overdue:'Renovación vencida',upcoming:'Renovación próxima',current:'Renovación vigente',insufficient:'Evidencia insuficiente',
  })[status]||'Evidencia insuficiente';
}
function activeTrainingCycle(state,clientId){
  const cycles=forClient(state,'trainingCycles',clientId);
  if(!cycles.length)return null;
  const active=cycles.find((record)=>['active','activo','published','publicado'].includes(fold(value(record,'status','estado'))));
  const cycle=active||latest(cycles);
  if(!cycle)return null;
  return Object.freeze({
    id:recordId(cycle)||null,
    name:clean(value(cycle,'name','nombre','title','titulo'),140)||null,
    status:clean(value(cycle,'status','estado'),80)||null,
    startDate:isoDate(value(cycle,'startDate','start_date','periodStart','period_start')),
    endDate:isoDate(value(cycle,'endDate','end_date','periodEnd','period_end')),
    goal:clean(value(cycle,'goal','objective','objetivo'),220)||null,
    source:'trainingCycles',
    commercialRenewalSource:false,
  });
}
function eventName(record){
  return clean(value(record,'eventName','event_name','event','action','actionType','action_type','commandType','command_type','type'),160);
}
function renewalEvent(record){const name=fold(eventName(record));return /renew|renov/u.test(name);}
function actorRoleOf(record){return fold(value(record,'actorRole','actor_role','role','rol'))||null;}
function actorIdOf(record){return clean(value(record,'actorId','actor_id','userId','user_id','performedBy','performed_by'),160)||null;}
function historyRow(record,source){
  const at=isoDate(dateOf(record));
  if(!at)return null;
  return Object.freeze({
    id:recordId(record)||null,
    event:eventName(record)||'Renovación registrada',
    at,
    actorRole:actorRoleOf(record),
    actorId:actorIdOf(record),
    reason:clean(value(record,'reason','motivo','note','nota','notes'),220)||null,
    source,
  });
}
function renewalHistory(state,clientId){
  const rows=[];
  for(const record of forClient(state,'domainEvents',clientId))if(renewalEvent(record))rows.push(historyRow(record,'domainEvents'));
  for(const record of forClient(state,'m26Entities',clientId))if(relevantCommercialEntity(record)&&renewalEvent(record))rows.push(historyRow(record,'m26Entities'));
  return rows.filter(Boolean).sort((a,b)=>(safeDate(b.at)?.getTime()||0)-(safeDate(a.at)?.getTime()||0));
}
function coachAdminActions(history){
  return history.filter((row)=>COACH_ADMIN_ROLES.has(row.actorRole)).map((row)=>Object.freeze({...row}));
}

export function buildCrmRenewalSummary(state,clientId,{now=new Date(),upcomingDays=14}={}){
  const id=clean(clientId,160);
  if(!id)return null;
  const clock=safeDate(now);
  if(!clock)throw new Error('M26_CRM_NOW_INVALID');
  const horizon=Number(upcomingDays);
  if(!Number.isInteger(horizon)||horizon<1||horizon>90)throw new Error('M26_CRM_UPCOMING_DAYS_INVALID');

  const client=collection(state,'clients').find((record)=>clean(record?.id,160)===id)||null;
  const profile=latest(forClient(state,'clientProfiles',id));
  const normalizedProfile=normalizeClientProfile(profile||{},client||{});
  const commercialEntities=forClient(state,'m26Entities',id).filter(relevantCommercialEntity).sort(byNewest);
  const evidenceRecords=[
    ...commercialEntities.map((record)=>({record,source:'m26Entities'})),
    ...(profile?[{record:profile,source:'clientProfiles'}]:[]),
    ...(client?[{record:client,source:'clients'}]:[]),
  ];

  const planEvidence=explicitField(evidenceRecords,['commercialPlan','commercial_plan','servicePlan','service_plan','membershipPlan','membership_plan','planName','plan_name','plan']);
  const commercialStatusEvidence=explicitField(evidenceRecords,['commercialStatus','commercial_status','subscriptionStatus','subscription_status','membershipStatus','membership_status']);
  const renewalStatusEvidence=explicitField(evidenceRecords,['renewalStatus','renewal_status']);
  const renewalDateEvidence=explicitField(evidenceRecords,['renewalDate','renewal_date','renewAt','renew_at','nextRenewalAt','next_renewal_at','nextRenewalDate','next_renewal_date']);
  const cycleStartEvidence=explicitField(evidenceRecords,['commercialCycleStart','commercial_cycle_start','contractStartAt','contract_start_at','serviceStartAt','service_start_at','membershipStartAt','membership_start_at']);
  const cycleEndEvidence=explicitField(evidenceRecords,['commercialCycleEnd','commercial_cycle_end','contractEndAt','contract_end_at','serviceEndAt','service_end_at','membershipEndAt','membership_end_at']);
  const clientStatusRaw=client?value(client,'clientStatus','client_status','status','estado'):null;
  const clientStatus=normalizedClientStatus(clientStatusRaw);
  const renewal=renewalState({renewalDate:renewalDateEvidence?.value,explicitStatus:renewalStatusEvidence?.value,now:clock,upcomingDays:horizon});
  const history=renewalHistory(state,id);
  const traceability=[
    provenanceFact('plan',planEvidence),
    provenanceFact('commercialStatus',commercialStatusEvidence),
    provenanceFact('renewalStatus',renewalStatusEvidence),
    provenanceFact('renewalDate',renewalDateEvidence),
    provenanceFact('commercialCycleStart',cycleStartEvidence),
    provenanceFact('commercialCycleEnd',cycleEndEvidence),
  ].filter(Boolean);

  return deepFreeze({
    clientId:id,
    generatedAt:clock.toISOString(),
    client:{
      status:clientStatus,
      statusLabel:clientStatus?statusLabel(clientStatus):'Evidencia insuficiente',
      rawStatus:clientStatusRaw===null?null:clean(clientStatusRaw,80),
      modality:normalizedProfile?.modality||null,
      weeklyFrequency:normalizedProfile?.weeklyFrequency??null,
      plan:planEvidence?clean(planEvidence.value,140):null,
    },
    trainingCycle:activeTrainingCycle(state,id),
    commercial:{
      status:commercialStatusEvidence?clean(commercialStatusEvidence.value,100):null,
      cycleStart:isoDate(cycleStartEvidence?.value),
      cycleEnd:isoDate(cycleEndEvidence?.value),
    },
    renewal:{
      status:renewal.status,
      statusLabel:statusLabel(renewal.status),
      date:isoDate(renewalDateEvidence?.value),
      daysToRenewal:renewal.daysToRenewal,
      explicitStatus:renewalStatusEvidence?clean(renewalStatusEvidence.value,100):null,
      upcomingWindowDays:horizon,
      evidence:renewal.status==='insufficient'
        ?'No existe una fecha o estado explícito de renovación en las fuentes canónicas disponibles.'
        :renewal.status==='overdue'
          ?'Existe evidencia explícita de una renovación vencida; requiere revisión humana y no implica impago ni abandono.'
          :renewal.status==='upcoming'
            ?'Existe una renovación explícita próxima; es una señal operativa de seguimiento, no un riesgo automático.'
            :'Existe evidencia explícita de renovación vigente o confirmada.',
    },
    payment:{
      status:'insufficient',
      available:false,
      evidence:'No existe una fuente canónica de pagos/cobros en el estado productivo actual; no se infiere pago, impago ni deuda.',
      source:null,
    },
    renewalHistory:history,
    actions:coachAdminActions(history),
    traceability,
    guardrails:{
      clientIsolation:true,
      requiresHumanDecision:true,
      autoMessage:false,
      autoCharge:false,
      paymentInference:false,
      trainingCycleIsCommercialRenewal:false,
    },
    provenance:'canonical-read-model',
  });
}

export const __crmRenewalsInternals=Object.freeze({
  value,clientIdOf,entityTypeOf,relevantCommercialEntity,normalizedClientStatus,normalizedRenewalStatus,
  renewalState,activeTrainingCycle,renewalHistory,coachAdminActions,
});
