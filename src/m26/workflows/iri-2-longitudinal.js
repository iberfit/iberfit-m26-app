export const IRI2_SNAPSHOT_SCHEMA='iberfit-iri2-snapshot-v1';
export const IRI2_LONGITUDINAL_SCHEMA='iberfit-iri2-longitudinal-v1';
export const IRI_INITIAL_DIAGNOSTIC_KIND='iri-initial-diagnostic';
export const EVOLUTION_FOLLOWUP_KIND='evolution-followup';

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clean(value,max=500){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function dateValue(value){
  const raw=clean(value,32);
  const ts=Date.parse(raw);
  return Number.isFinite(ts)?ts:null;
}
const IRI_PRIORITY_DOMAINS=Object.freeze(['general','composition','mobility','strength','cardio','recovery','adherence','other']);
const IRI_PRIORITY_STATUSES=Object.freeze(['active','maintain','completed','paused']);
function normalizedPriorityRecords(records=[],labels=[],fallbackReviewDate=''){
  const source=Array.isArray(records)?records:[];
  const fallback=Array.isArray(labels)?labels.map((item)=>clean(item,500)).filter(Boolean):[];
  const count=Math.min(6,Math.max(source.length,fallback.length));
  const normalized=[];
  for(let index=0;index<count;index++){
    const item=source[index]&&typeof source[index]==='object'&&!Array.isArray(source[index])?source[index]:{};
    const label=clean(item.label||fallback[index],500);if(!label)continue;
    const domain=clean(item.domain,40).toLowerCase(),status=clean(item.status,40).toLowerCase();
    normalized.push(Object.freeze({label,domain:IRI_PRIORITY_DOMAINS.includes(domain)?domain:'general',rationale:clean(item.rationale,800),target:clean(item.target,600),strategy:clean(item.strategy,1200),reviewDate:clean(item.reviewDate||fallbackReviewDate,32),status:IRI_PRIORITY_STATUSES.includes(status)?status:'active'}));
  }
  return Object.freeze(normalized);
}
function priorityRecordFingerprint(records=[]){return JSON.stringify((Array.isArray(records)?records:[]).map((item)=>[clean(item?.label,500),clean(item?.domain,40),clean(item?.rationale,800),clean(item?.target,600),clean(item?.strategy,1200),clean(item?.reviewDate,32),clean(item?.status,40)]));}
function sameValue(a,b){
  if(a===null||a===undefined||b===null||b===undefined)return false;
  return String(a).trim().toLowerCase()===String(b).trim().toLowerCase();
}
function sameNumber(a,b,tolerance=.001){
  const x=finite(a),y=finite(b);
  return x!==null&&y!==null&&Math.abs(x-y)<=tolerance;
}
function protocolKey(parts=[]){
  return parts.map((value)=>clean(value,120).toLowerCase()).join('|');
}
function metric(id,label,value,unit='',meta={}){
  const numeric=finite(value);
  return Object.freeze({id,label,value:numeric,unit,...meta});
}
function strengthProtocol(record={}){
  return protocolKey([
    record.variant,
    record.supportHeightCm,
    record.handleHeightCm,
    record.configuration,
    record.protocolVersion,
  ]);
}
function cardioProtocol(record={}){
  return protocolKey([
    record.protocol,
    record.stepHeightCm,
    record.cadenceBpm,
  ]);
}
function compositionProtocol(record={}){
  return protocolKey([record.method,record.device]);
}
function snapshotMetrics(draft={}){
  const body=draft.bodyComposition||{};
  const mobility=draft.mobility||{};
  const strength=draft.strength||{};
  const cardio=draft.cardio||{};
  return Object.freeze({
    weightKg:metric('weightKg','Peso',body.weightKg,'kg',{domain:'composition',comparison:'descriptive'}),
    waistCm:metric('waistCm','Cintura',body.waistCm,'cm',{domain:'composition',comparison:'descriptive'}),
    bodyFatPercent:metric('bodyFatPercent','Grasa corporal',body.bodyFatPercent,'%',{
      domain:'composition',
      comparison:'protocol',
      protocol:compositionProtocol(body),
    }),
    muscleMassKg:metric('muscleMassKg','Masa muscular',body.muscleMassKg,'kg',{
      domain:'composition',
      comparison:'protocol',
      protocol:compositionProtocol(body),
    }),
    chairStandReps:metric('chairStandReps','Silla 30 s',strength.chairStand?.repetitions,'rep',{
      domain:'strength',
      comparison:'protocol',
      valid:strength.chairStand?.valid===true,
      protocol:strengthProtocol(strength.chairStand),
    }),
    pushReps:metric('pushReps','Empuje',strength.push?.repetitions,'rep',{
      domain:'strength',
      comparison:'protocol',
      valid:strength.push?.valid===true,
      protocol:strengthProtocol(strength.push),
    }),
    trxRowReps:metric('trxRowReps','Remo TRX',strength.trxRow?.repetitions,'rep',{
      domain:'strength',
      comparison:'protocol',
      valid:strength.trxRow?.valid===true,
      protocol:strengthProtocol(strength.trxRow),
    }),
    frontPlankSeconds:metric('frontPlankSeconds','Plancha frontal',strength.core?.frontPlankSeconds,'s',{
      domain:'strength',
      comparison:'descriptive',
    }),
    ankleLeftCm:metric('ankleLeftCm','Tobillo izquierdo',mobility.ankle?.leftBest,'cm',{
      domain:'mobility',
      comparison:'descriptive',
    }),
    ankleRightCm:metric('ankleRightCm','Tobillo derecho',mobility.ankle?.rightBest,'cm',{
      domain:'mobility',
      comparison:'descriptive',
    }),
    posteriorLeftCm:metric('posteriorLeftCm','Cadena posterior izquierda',mobility.posteriorChain?.leftBest,'cm',{
      domain:'mobility',
      comparison:'descriptive',
    }),
    posteriorRightCm:metric('posteriorRightCm','Cadena posterior derecha',mobility.posteriorChain?.rightBest,'cm',{
      domain:'mobility',
      comparison:'descriptive',
    }),
    cardioDeltaOneMinute:metric('cardioDeltaOneMinute','Recuperación FC 1 min',cardio.deltaOneMinute,'lpm',{
      domain:'cardio',
      comparison:'protocol',
      valid:cardio.valid===true,
      protocol:cardioProtocol(cardio),
    }),
    restingHr:metric('restingHr','FC reposo',cardio.restingHr,'lpm',{
      domain:'cardio',
      comparison:'descriptive',
    }),
  });
}

export function iri2SnapshotFromDraft(draft={}){
  const diagnosis=draft.diagnosis||{};
  return Object.freeze({
    schema:IRI2_SNAPSHOT_SCHEMA,
    assessmentId:clean(draft.assessmentId||draft.id,120),
    clientId:clean(draft.clientId,120),
    assessmentDate:clean(draft.assessmentDate,32),
    timestamp:dateValue(draft.assessmentDate),
    metrics:snapshotMetrics(draft),
    decision:Object.freeze({
      strengths:Object.freeze(Array.isArray(diagnosis.strengths)?diagnosis.strengths.map((x)=>clean(x,500)).filter(Boolean):[]),
      priorities:Object.freeze(Array.isArray(diagnosis.priorities)?diagnosis.priorities.map((x)=>clean(x,500)).filter(Boolean):[]),
      priorityRecords:normalizedPriorityRecords(diagnosis.priorityRecords,diagnosis.priorities,diagnosis.reevaluationDate),
      coachInterpretation:clean(diagnosis.coachInterpretation,2000),
      trainingImplications:clean(diagnosis.trainingImplications,2000),
      initialPlan:clean(diagnosis.initialPlan,2000),
      recommendedFrequency:clean(diagnosis.recommendedFrequency,240),
      reevaluationDate:clean(diagnosis.reevaluationDate,32),
      reviewAccepted:diagnosis.reviewAccepted===true,
    }),
  });
}

function comparable(previous,current){
  if(previous?.value===null||current?.value===null)return false;
  if(previous.comparison==='protocol'||current.comparison==='protocol'){
    if(previous.valid===false||current.valid===false)return false;
    const p=clean(previous.protocol,500),c=clean(current.protocol,500);
    if(!p||!c||p!==c)return false;
  }
  return true;
}
function compareMetric(previous,current){
  if(!comparable(previous,current))return Object.freeze({
    id:current?.id||previous?.id||'metric',
    label:current?.label||previous?.label||'Métrica',
    comparable:false,
    reason:'protocol_or_value_not_comparable',
  });
  const delta=Number((current.value-previous.value).toFixed(3));
  const relative=previous.value===0?null:Number(((delta/Math.abs(previous.value))*100).toFixed(1));
  const trend=Math.abs(delta)<0.0005?'stable':delta>0?'up':'down';
  return Object.freeze({
    id:current.id,
    label:current.label,
    unit:current.unit,
    domain:current.domain,
    comparable:true,
    previous:previous.value,
    current:current.value,
    delta,
    relative,
    trend,
    comparison:current.comparison,
  });
}
function sortSnapshots(items=[]){
  return [...items]
    .filter(Boolean)
    .sort((a,b)=>(a.timestamp??Number.MAX_SAFE_INTEGER)-(b.timestamp??Number.MAX_SAFE_INTEGER));
}
function sameClient(current,candidate){
  if(!current?.clientId||!candidate?.clientId)return true;
  return current.clientId===candidate.clientId;
}
function normalizedDecisionList(value=[]){
  return (Array.isArray(value)?value:[])
    .map((item)=>clean(item,500))
    .filter(Boolean);
}
function decisionHasContent(decision={}){
  return Boolean(
    normalizedDecisionList(decision.priorities).length||
    normalizedPriorityRecords(decision.priorityRecords,decision.priorities,decision.reevaluationDate).length||
    normalizedDecisionList(decision.strengths).length||
    clean(decision.coachInterpretation,2000)||
    clean(decision.trainingImplications,2000)||
    clean(decision.initialPlan,2000)||
    clean(decision.recommendedFrequency,240)||
    clean(decision.reevaluationDate,32)
  );
}
function normalizedKey(value){
  return clean(value,2000).toLocaleLowerCase('es');
}
function decisionListDelta(previous=[],current=[]){
  const before=normalizedDecisionList(previous);
  const after=normalizedDecisionList(current);
  const beforeKeys=new Set(before.map(normalizedKey));
  const afterKeys=new Set(after.map(normalizedKey));
  return Object.freeze({
    changed:before.length!==after.length||before.some((item)=>!afterKeys.has(normalizedKey(item))),
    added:Object.freeze(after.filter((item)=>!beforeKeys.has(normalizedKey(item)))),
    removed:Object.freeze(before.filter((item)=>!afterKeys.has(normalizedKey(item)))),
  });
}
function decisionEntry(snapshot,previous=null){
  const decision=snapshot?.decision||{};
  const previousDecision=previous?.decision||{};
  const priorities=decisionListDelta(previousDecision.priorities,decision.priorities);
  const priorityDetailsChanged=Boolean(previous)&&priorityRecordFingerprint(previousDecision.priorityRecords)!==priorityRecordFingerprint(decision.priorityRecords);
  const planChanged=Boolean(previous)&&normalizedKey(previousDecision.initialPlan)!==normalizedKey(decision.initialPlan);
  const implicationsChanged=Boolean(previous)&&normalizedKey(previousDecision.trainingImplications)!==normalizedKey(decision.trainingImplications);
  const frequencyChanged=Boolean(previous)&&normalizedKey(previousDecision.recommendedFrequency)!==normalizedKey(decision.recommendedFrequency);
  const reevaluationChanged=Boolean(previous)&&normalizedKey(previousDecision.reevaluationDate)!==normalizedKey(decision.reevaluationDate);
  const changed=Boolean(previous)&&(priorities.changed||priorityDetailsChanged||planChanged||implicationsChanged||frequencyChanged||reevaluationChanged);
  const label=!previous
    ?'Decisión inicial'
    :priorities.changed
      ?'Prioridades actualizadas'
      :changed
        ?'Plan revisado'
        :'Decisión mantenida';
  return Object.freeze({
    assessmentId:snapshot.assessmentId||null,
    assessmentDate:snapshot.assessmentDate||null,
    label,
    strengths:Object.freeze(normalizedDecisionList(decision.strengths)),
    priorities:Object.freeze(normalizedDecisionList(decision.priorities)),
    priorityRecords:normalizedPriorityRecords(decision.priorityRecords,decision.priorities,decision.reevaluationDate),
    coachInterpretation:clean(decision.coachInterpretation,2000),
    trainingImplications:clean(decision.trainingImplications,2000),
    initialPlan:clean(decision.initialPlan,2000),
    recommendedFrequency:clean(decision.recommendedFrequency,240),
    reevaluationDate:clean(decision.reevaluationDate,32),
    changes:Object.freeze({
      changed,
      prioritiesChanged:priorities.changed,
      priorityDetailsChanged,
      prioritiesAdded:priorities.added,
      prioritiesRemoved:priorities.removed,
      planChanged,
      implicationsChanged,
      frequencyChanged,
      reevaluationChanged,
    }),
  });
}

export function buildIri2DecisionLog({assessments=[]}={}){
  const snapshots=sortSnapshots(
    (Array.isArray(assessments)?assessments:[])
      .map((item)=>item?.schema===IRI2_SNAPSHOT_SCHEMA?item:iri2SnapshotFromDraft(item))
  );
  const scope=snapshots.find((item)=>item?.clientId)?.clientId||'';
  const confirmed=snapshots.filter((item)=>
    (!scope||!item.clientId||item.clientId===scope)&&
    item.decision?.reviewAccepted===true&&
    decisionHasContent(item.decision)
  );
  const entries=confirmed.map((snapshot,index)=>decisionEntry(snapshot,confirmed[index-1]||null));
  return Object.freeze({
    clientId:scope||null,
    count:entries.length,
    latest:entries.at(-1)||null,
    entries:Object.freeze(entries),
  });
}

export function buildIri2LongitudinalProfile({current,history=[]}={}){
  if(!current)throw new Error('M26_IRI2_CURRENT_REQUIRED');
  const currentSnapshot=current.schema===IRI2_SNAPSHOT_SCHEMA?current:iri2SnapshotFromDraft(current);
  const prior=sortSnapshots(
    (Array.isArray(history)?history:[])
      .map((item)=>item?.schema===IRI2_SNAPSHOT_SCHEMA?item:iri2SnapshotFromDraft(item))
      .filter((item)=>item.assessmentId!==currentSnapshot.assessmentId&&sameClient(currentSnapshot,item)),
  ).filter((item)=>item.timestamp===null||currentSnapshot.timestamp===null||item.timestamp<=currentSnapshot.timestamp);
  const previous=prior.at(-1)||null;
  const baseline=prior[0]||null;
  const comparisons=[];
  if(previous){
    for(const [id,currentMetric] of Object.entries(currentSnapshot.metrics)){
      const previousMetric=previous.metrics?.[id];
      if(!previousMetric)continue;
      comparisons.push(compareMetric(previousMetric,currentMetric));
    }
  }
  const comparableMetrics=comparisons.filter((item)=>item.comparable);
  const headline=comparableMetrics
    .filter((item)=>Math.abs(item.delta)>0.0005)
    .sort((a,b)=>Math.abs(b.relative??b.delta)-Math.abs(a.relative??a.delta))
    .slice(0,4);
  const domainCoverage={};
  for(const item of comparableMetrics){
    const domain=item.domain||'other';
    domainCoverage[domain]=(domainCoverage[domain]||0)+1;
  }
  return Object.freeze({
    schema:IRI2_LONGITUDINAL_SCHEMA,
    semantics:Object.freeze({
      initialDiagnostic:IRI_INITIAL_DIAGNOSTIC_KIND,
      followup:EVOLUTION_FOLLOWUP_KIND,
      phase:previous?EVOLUTION_FOLLOWUP_KIND:IRI_INITIAL_DIAGNOSTIC_KIND,
    }),
    current:currentSnapshot,
    previous,
    baseline,
    assessments:Object.freeze([...prior,currentSnapshot]),
    comparison:Object.freeze({
      available:Boolean(previous),
      previousAssessmentId:previous?.assessmentId||null,
      previousAssessmentDate:previous?.assessmentDate||null,
      comparableCount:comparableMetrics.length,
      totalCompared:comparisons.length,
      metrics:Object.freeze(comparisons),
      headline:Object.freeze(headline),
      domainCoverage:Object.freeze(domainCoverage),
    }),
  });
}

export function iri2ComparisonSummary(profile={}){
  const comparison=profile?.comparison;
  if(!comparison?.available)return Object.freeze({
    available:false,
    phase:IRI_INITIAL_DIAGNOSTIC_KIND,
    label:'Diagnóstico IRI inicial',
    detail:'Establece el punto de partida para el seguimiento posterior.',
  });
  if(!comparison.comparableCount)return Object.freeze({
    available:true,
    phase:EVOLUTION_FOLLOWUP_KIND,
    label:'Seguimiento registrado',
    detail:'Hay una reevaluación, pero no existen protocolos suficientemente comparables para cuantificar cambios de forma fiable.',
  });
  return Object.freeze({
    available:true,
    phase:EVOLUTION_FOLLOWUP_KIND,
    label:`${comparison.comparableCount} indicadores comparables`,
    detail:`Seguimiento comparado con ${comparison.previousAssessmentDate||'la evaluación anterior'}, sin puntuación global.`,
  });
}

export const buildEvolutionProfile=buildIri2LongitudinalProfile;
export const evolutionComparisonSummary=iri2ComparisonSummary;

export const __iri2LongitudinalInternals=Object.freeze({
  finite,clean,dateValue,IRI_PRIORITY_DOMAINS,IRI_PRIORITY_STATUSES,normalizedPriorityRecords,priorityRecordFingerprint,sameValue,sameNumber,protocolKey,metric,strengthProtocol,cardioProtocol,compositionProtocol,snapshotMetrics,comparable,compareMetric,sortSnapshots,sameClient,normalizedDecisionList,decisionHasContent,normalizedKey,decisionListDelta,decisionEntry,
});
