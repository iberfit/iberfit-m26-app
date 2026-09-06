import {iberfitCompareText,iberfitDomainTranslate} from '../ui/i18n-domain.js';

const KIND_RANK=Object.freeze({
  critical:0,
  warning:1,
  process:2,
  info:3,
  clear:4,
});

const ACTION_TYPES=Object.freeze([
  'needs-initial-plan',
  'feedback-review',
  'upcoming-checkin',
  'load-change',
  'manual-attention',
]);

function arr(value){
  return Array.isArray(value)?value:[];
}

function txt(value,fallback=''){
  const clean=String(value??'').trim();
  return clean||fallback;
}

function tr(key,options={}){
  return iberfitDomainTranslate(key,options);
}

function severity(value){
  const normalized=txt(value).toLowerCase();
  return ['critical','warning','info'].includes(normalized)
    ?normalized
    :'info';
}

function signalLabel(kind){
  const safe=Object.hasOwn(KIND_RANK,kind)?kind:'clear';
  return tr(`coach.signal.${safe}`);
}

function actionTypeFor({key='',stage='',source='',area=''}={}){
  const actionKey=txt(key).toLowerCase();
  const experienceStage=txt(stage).toLowerCase();
  const signalSource=txt(source).toLowerCase();
  const targetArea=txt(area).toLowerCase();

  if(
    actionKey==='prepare_plan'||
    actionKey==='assign_program'||
    (experienceStage==='planning'&&targetArea==='planificacion')
  )return 'needs-initial-plan';

  if(
    actionKey==='review_adherence_session'||
    actionKey.includes('feedback')||
    signalSource.includes('checkin')
  )return 'feedback-review';

  if(
    actionKey==='schedule_appointment'||
    actionKey==='schedule_checkin'||
    actionKey==='upcoming_checkin'
  )return 'upcoming-checkin';

  if(
    actionKey==='review_session_adjustment'||
    actionKey.includes('load_change')||
    actionKey.includes('adjustment')
  )return 'load-change';

  return 'manual-attention';
}

function actionCenterMetadata({key,stage,source,area}={}){
  const actionType=actionTypeFor({key,stage,source,area});
  return Object.freeze({
    actionType,
    actionTypeLabel:tr(`coach.actionCenter.type.${actionType}`),
    attentionWhy:tr(`coach.actionCenter.why.${actionType}`),
    actionCtaLabel:tr(`coach.actionCenter.cta.${actionType}`),
  });
}

function itemFromEntry(entry={}){
  const client=entry.client||{};
  const alerts=arr(entry.alerts).map((alert)=>({
    ...alert,
    severity:severity(alert?.severity),
  }));

  const risk=
    alerts.find((alert)=>alert.severity==='critical')||
    alerts.find((alert)=>alert.severity==='warning')||
    null;

  const info=
    alerts.find((alert)=>alert.severity==='info')||
    null;

  const experience=client.experience||{};
  const adaptive=client.adaptiveExperience||{};
  const adaptiveKind=['critical','warning'].includes(txt(adaptive.kind).toLowerCase())?txt(adaptive.kind).toLowerCase():null;
  const adaptiveRisk=adaptive.coachReviewRequired===true&&adaptiveKind?adaptive:null;
  const stage=txt(experience.stage,'active');
  const stageLabel=txt(
    experience.stageLabel,
    tr('coach.stage.active')
  );

  const processPending=stage!=='active';

  let kind='clear';
  let reason=tr('coach.reason.clear');
  let detail=tr('coach.detail.clear');
  let guidance=tr('coach.guidance.clear');
  let source='experience-core';

  if(adaptiveRisk){
    kind=adaptiveKind;
    reason=txt(adaptiveRisk.label,tr('coach.reason.review'));
    detail=txt(adaptiveRisk.reason,tr('coach.detail.adaptive'));
    guidance=tr('coach.nextStep',{params:{action:txt(adaptiveRisk.action?.label,tr('coach.action.record'))}});
    source='adaptive-experience';
  }else if(risk){
    kind=risk.severity;
    reason=txt(risk.title,tr('coach.reason.review'));
    detail=txt(
      risk.detail,
      tr('coach.detail.risk')
    );
    guidance=txt(
      risk.action,
      tr('coach.guidance.context')
    );
    source=txt(risk.source,'followup');
  }else if(processPending){
    kind='process';
    reason=stageLabel;
    detail=txt(
      client.nextAction?.reason,
      tr('coach.detail.process')
    );
    guidance=tr('coach.nextStep',{params:{action:txt(client.nextAction?.label,tr('coach.action.record'))}});
    source='experience-core';
  }else if(info){
    kind='info';
    reason=txt(info.title,tr('coach.signal.info'));
    detail=txt(
      info.detail,
      tr('coach.detail.info')
    );
    guidance=txt(
      info.action,
      tr('coach.guidance.followup')
    );
    source=txt(info.source,'followup');
  }

  const nextAction=Object.freeze({
    key:txt(client.nextAction?.key),
    label:txt(
      client.nextAction?.label,
      tr('coach.action.followup')
    ),
    area:txt(
      client.nextAction?.area,
      'expediente'
    ),
    reason:txt(client.nextAction?.reason),
  });
  const semanticKey=txt(adaptiveRisk?.action?.key,nextAction.key);
  const actionCenter=actionCenterMetadata({
    key:semanticKey,
    stage,
    source,
    area:txt(adaptiveRisk?.action?.area,nextAction.area),
  });

  return Object.freeze({
    clientId:txt(client.id),
    clientName:txt(client.name,tr('coach.client')),
    modality:txt(client.modality),
    kind,
    rank:KIND_RANK[kind],
    signalLabel:signalLabel(kind),
    reason,
    detail,
    guidance,
    source,
    stage,
    stageLabel,
    experiencePriority:Number.isFinite(
      Number(experience.priority)
    )
      ?Number(experience.priority)
      :5,
    nextAction,
    actionType:actionCenter.actionType,
    actionTypeLabel:actionCenter.actionTypeLabel,
    attentionWhy:actionCenter.attentionWhy,
    actionCtaLabel:actionCenter.actionCtaLabel,
  });
}

function commercialItemFromCrm(crm={}){
  const clientId=txt(crm?.clientId);
  const status=txt(crm?.renewal?.status).toLowerCase();
  if(!clientId||!['overdue','upcoming'].includes(status))return null;

  const overdue=status==='overdue';
  const kind=overdue?'process':'info';
  const reason=txt(
    crm?.renewal?.statusLabel,
    overdue?'Renovación vencida':'Renovación próxima'
  );
  const detail=txt(
    crm?.renewal?.evidence,
    overdue
      ?'Existe una fecha explícita de renovación vencida y requiere revisión humana.'
      :'Existe una fecha explícita de renovación próxima para seguimiento comercial.'
  );
  const guidance=overdue
    ?'Revisar continuidad comercial con el cliente. Una fecha vencida no implica impago ni abandono.'
    :'Preparar seguimiento de continuidad comercial. Una renovación próxima no es una señal de riesgo automática.';
  const nextAction=Object.freeze({
    key:'review_renewal',
    label:overdue
      ?'Revisar renovación pendiente'
      :'Preparar seguimiento de renovación',
    area:'clientes',
    reason:detail,
  });
  const actionCenter=actionCenterMetadata({
    key:nextAction.key,
    stage:'followup',
    source:'crm-renewals',
    area:'clientes',
  });

  return Object.freeze({
    clientId,
    clientName:txt(crm?.clientName,tr('coach.client')),
    modality:txt(crm?.client?.modality),
    kind,
    rank:KIND_RANK[kind],
    signalLabel:signalLabel(kind),
    reason,
    detail,
    guidance,
    source:'crm-renewals',
    stage:'followup',
    stageLabel:'Seguimiento comercial',
    experiencePriority:overdue?2:7,
    nextAction,
    actionType:actionCenter.actionType,
    actionTypeLabel:actionCenter.actionTypeLabel,
    attentionWhy:overdue
      ?'Revisión comercial manual. No implica impago, deuda ni abandono.'
      :'Seguimiento comercial preventivo sin degradar el riesgo del cliente.',
    actionCtaLabel:actionCenter.actionCtaLabel,
    renewalStatus:status,
    renewalDate:txt(crm?.renewal?.date)||null,
    commercialPlan:txt(crm?.client?.plan)||null,
    requiresHumanDecision:true,
    autoMessage:false,
    autoCharge:false,
    paymentInference:false,
  });
}

function compareItems(a,b){
  if(a.rank!==b.rank)return a.rank-b.rank;

  if(a.experiencePriority!==b.experiencePriority){
    return a.experiencePriority-b.experiencePriority;
  }

  return iberfitCompareText(a.clientName,b.clientName);
}

function summarizeCockpit(items,totalClients,riskFocus=null){
  const criticalCount=
    items.filter((item)=>item.kind==='critical').length;

  const warningCount=
    items.filter((item)=>item.kind==='warning').length;

  const processCount=
    items.filter((item)=>item.kind==='process').length;

  const infoCount=
    items.filter((item)=>item.kind==='info').length;

  return Object.freeze({
    totalClients,
    attentionCount:
      criticalCount+
      warningCount+
      processCount,
    criticalCount,
    warningCount,
    processCount,
    infoCount,
    items:Object.freeze(items),
    riskFocus:
      riskFocus||
      items.find(
        (item)=>
          item.kind==='critical'||
          item.kind==='warning'
      )||null,
  });
}

export function deriveCoachCockpit(entries=[]){
  const all=arr(entries)
    .map(itemFromEntry)
    .filter((item)=>item.clientId);

  const items=all
    .filter((item)=>item.kind!=='clear')
    .sort(compareItems);

  return summarizeCockpit(items,all.length);
}

export function augmentCoachCockpitWithCrm(cockpit,crmSummaries=[]){
  const base=cockpit&&typeof cockpit==='object'
    ?cockpit
    :deriveCoachCockpit([]);
  const existing=arr(base.items)
    .filter((item)=>item?.source!=='crm-renewals');
  const commercial=arr(crmSummaries)
    .map(commercialItemFromCrm)
    .filter(Boolean);
  const items=[...existing,...commercial]
    .sort(compareItems);
  const fallbackClients=new Set([
    ...existing.map((item)=>txt(item?.clientId)).filter(Boolean),
    ...commercial.map((item)=>txt(item?.clientId)).filter(Boolean),
  ]).size;
  const totalClients=Number.isInteger(base.totalClients)&&base.totalClients>=0
    ?base.totalClients
    :fallbackClients;
  const riskFocus=base.riskFocus&&['critical','warning'].includes(base.riskFocus.kind)
    ?base.riskFocus
    :null;

  return summarizeCockpit(items,totalClients,riskFocus);
}

export const __coachCockpitInternals=Object.freeze({
  itemFromEntry,
  commercialItemFromCrm,
  compareItems,
  summarizeCockpit,
  signalLabel,
  actionTypeFor,
  actionCenterMetadata,
  ACTION_TYPES,
});
