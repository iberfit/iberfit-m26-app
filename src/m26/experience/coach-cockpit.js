import {iberfitCompareText,iberfitDomainTranslate} from '../ui/i18n-domain.js';

const KIND_RANK=Object.freeze({
  critical:0,
  warning:1,
  process:2,
  info:3,
  clear:4,
});

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
    nextAction:Object.freeze({
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
    }),
  });
}

function compareItems(a,b){
  if(a.rank!==b.rank)return a.rank-b.rank;

  if(a.experiencePriority!==b.experiencePriority){
    return a.experiencePriority-b.experiencePriority;
  }

  return iberfitCompareText(a.clientName,b.clientName);
}

export function deriveCoachCockpit(entries=[]){
  const all=arr(entries)
    .map(itemFromEntry)
    .filter((item)=>item.clientId);

  const items=all
    .filter((item)=>item.kind!=='clear')
    .sort(compareItems);

  const criticalCount=
    items.filter((item)=>item.kind==='critical').length;

  const warningCount=
    items.filter((item)=>item.kind==='warning').length;

  const processCount=
    items.filter((item)=>item.kind==='process').length;

  const infoCount=
    items.filter((item)=>item.kind==='info').length;

  const riskFocus=
    items.find(
      (item)=>
        item.kind==='critical'||
        item.kind==='warning'
    )||null;

  return Object.freeze({
    totalClients:all.length,
    attentionCount:
      criticalCount+
      warningCount+
      processCount,
    criticalCount,
    warningCount,
    processCount,
    infoCount,
    items:Object.freeze(items),
    riskFocus,
  });
}

export const __coachCockpitInternals=Object.freeze({
  itemFromEntry,
  compareItems,
  signalLabel,
});
