const KIND_RANK=Object.freeze({critical:0,warning:1,process:2,info:3,clear:4});

function arr(value){return Array.isArray(value)?value:[];}
function text(value,fallback=''){const clean=String(value??'').trim();return clean||fallback;}
function number(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function openTask(task={}){return !['resolved','cancelled','closed'].includes(text(task.status).toLowerCase());}
function taskPriority(task={}){const p=text(task.priority,'normal').toLowerCase();return p==='critical'?0:p==='high'?1:2;}
function stageKind(stage){if(stage==='onboarding'||stage==='evaluation')return 'warning';if(stage==='planning'||stage==='scheduling')return 'process';return 'clear';}
function stageLabel(stage){if(stage==='onboarding')return 'Alta incompleta';if(stage==='evaluation')return 'IRI pendiente';if(stage==='planning')return 'Planificación pendiente';if(stage==='scheduling')return 'Próxima cita pendiente';return 'Seguimiento activo';}

export function deriveAdminCommandCenter({clients=[],coaches=[],tasks=[]}={}){
  const normalizedClients=arr(clients).map((client)=>{
    const experience=client?.experience||{};
    const stage=text(experience.stage,'active');
    const assignments=arr(client?.assignments);
    const assigned=assignments.length>0;
    const nextAction=client?.nextAction||{};
    const kind=!assigned?'critical':stageKind(stage);
    return Object.freeze({
      clientId:text(client?.id),
      clientName:text(client?.name,'Cliente'),
      stage,
      stageLabel:text(experience.stageLabel,stageLabel(stage)),
      experiencePriority:Number.isFinite(Number(experience.priority))?Number(experience.priority):5,
      assigned,
      coachNames:Object.freeze(arr(client?.coachNames).map((x)=>text(x)).filter(Boolean)),
      kind,
      action:Object.freeze(!assigned
        ?{area:'admin-equipo',label:'Asignar coach',reason:'El cliente no tiene un Coach activo asignado.'}
        :{area:text(nextAction.area,'admin-clientes'),label:text(nextAction.label,'Revisar cliente'),reason:text(nextAction.reason,stageLabel(stage))}),
    });
  }).filter((client)=>client.clientId);

  const priorities=normalizedClients
    .filter((client)=>client.kind!=='clear')
    .sort((a,b)=>{
      if(KIND_RANK[a.kind]!==KIND_RANK[b.kind])return KIND_RANK[a.kind]-KIND_RANK[b.kind];
      if(a.experiencePriority!==b.experiencePriority)return a.experiencePriority-b.experiencePriority;
      return a.clientName.localeCompare(b.clientName,'es',{sensitivity:'base'});
    });

  const coachLoad=arr(coaches).map((coach)=>{
    const capacity=number(coach?.capacityHours);
    const assignedHours=number(coach?.assignedHours)??0;
    const ratio=capacity&&capacity>0?assignedHours/capacity:null;
    const status=ratio==null?'unknown':ratio>=1?'full':ratio>=.85?'near':'available';
    return Object.freeze({
      coachUserId:text(coach?.userId||coach?.id),
      coachName:text(coach?.name||coach?.email,'Coach'),
      clientCount:number(coach?.clientCount)??0,
      capacityHours:capacity,
      assignedHours,
      loadRatio:ratio,
      loadPercent:ratio==null?null:Math.round(ratio*100),
      status,
    });
  }).sort((a,b)=>{
    const ar=a.loadRatio==null?-1:a.loadRatio;
    const br=b.loadRatio==null?-1:b.loadRatio;
    return br-ar||a.coachName.localeCompare(b.coachName,'es',{sensitivity:'base'});
  });

  const openTasks=arr(tasks).filter(openTask);
  const criticalTasks=openTasks
    .filter((task)=>['critical','high'].includes(text(task.priority).toLowerCase()))
    .sort((a,b)=>taskPriority(a)-taskPriority(b));

  const countStage=(stage)=>normalizedClients.filter((client)=>client.stage===stage).length;
  const summary=Object.freeze({
    totalClients:normalizedClients.length,
    unassignedClients:normalizedClients.filter((client)=>!client.assigned).length,
    onboardingPending:countStage('onboarding'),
    iriPending:countStage('evaluation'),
    planningPending:countStage('planning'),
    schedulingPending:countStage('scheduling'),
    activeClients:countStage('active'),
    openTasks:openTasks.length,
    criticalTasks:criticalTasks.length,
    coachesNearCapacity:coachLoad.filter((coach)=>coach.status==='near'||coach.status==='full').length,
  });

  const nextDecision=priorities[0]||null;

  return Object.freeze({
    summary,
    priorities:Object.freeze(priorities),
    coachLoad:Object.freeze(coachLoad),
    criticalTasks:Object.freeze(criticalTasks),
    nextDecision,
  });
}
