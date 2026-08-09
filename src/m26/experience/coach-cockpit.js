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

function severity(value){
  const normalized=txt(value).toLowerCase();
  return ['critical','warning','info'].includes(normalized)
    ?normalized
    :'info';
}

function signalLabel(kind){
  if(kind==='critical')return 'Atención prioritaria';
  if(kind==='warning')return 'Revisar contexto';
  if(kind==='process')return 'Recorrido pendiente';
  if(kind==='info')return 'Seguimiento';
  return 'Al día';
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
  const stage=txt(experience.stage,'active');
  const stageLabel=txt(
    experience.stageLabel,
    'Seguimiento activo'
  );

  const processPending=stage!=='active';

  let kind='clear';
  let reason='Seguimiento al día';
  let detail='No hay señales que requieran una acción adicional.';
  let guidance='Mantener el seguimiento previsto.';
  let source='experience-core';

  if(risk){
    kind=risk.severity;
    reason=txt(risk.title,'Revisión necesaria');
    detail=txt(
      risk.detail,
      'Existe una señal que requiere revisión.'
    );
    guidance=txt(
      risk.action,
      'Revisar el contexto con el cliente.'
    );
    source=txt(risk.source,'seguimiento');
  }else if(processPending){
    kind='process';
    reason=stageLabel;
    detail=txt(
      client.nextAction?.reason,
      'El recorrido del cliente tiene un paso pendiente.'
    );
    guidance=`Siguiente paso: ${txt(
      client.nextAction?.label,
      'Revisar expediente'
    )}.`;
    source='experience-core';
  }else if(info){
    kind='info';
    reason=txt(info.title,'Seguimiento');
    detail=txt(
      info.detail,
      'Existe información útil para el seguimiento.'
    );
    guidance=txt(
      info.action,
      'Revisar durante el seguimiento.'
    );
    source=txt(info.source,'seguimiento');
  }

  return Object.freeze({
    clientId:txt(client.id),
    clientName:txt(client.name,'Cliente'),
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
        'Revisar seguimiento'
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

  return a.clientName.localeCompare(
    b.clientName,
    'es',
    {sensitivity:'base'}
  );
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