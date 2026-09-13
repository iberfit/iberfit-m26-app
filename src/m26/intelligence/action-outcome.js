export const ACTION_OUTCOME_ENTITY_TYPE='action_outcome';
export const ACTION_OUTCOME_OPEN_STATUS='abierto';
export const ACTION_OUTCOME_CLOSED_STATUS='cerrado';

export const ACTION_OUTCOME_SIGNAL_SOURCES=Object.freeze([
  'checkin',
  'adherence',
  'session',
  'progress',
  'coach_observation',
  'other',
]);

export const ACTION_OUTCOME_INTERVENTION_TYPES=Object.freeze([
  'load_adjustment',
  'technique',
  'recovery',
  'adherence',
  'schedule',
  'communication',
  'plan',
  'other',
]);

export const ACTION_OUTCOME_RESULTS=Object.freeze([
  'improved',
  'stable',
  'worse',
  'mixed',
  'not_assessable',
]);

function text(value,max=2000){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').trim().slice(0,max);
}
function bodyOf(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :{};
}
function field(record,...keys){
  const body=bodyOf(record);
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}
function integer(value,fallback=0){
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=0?parsed:fallback;
}
function isoDate(value){
  const raw=text(value,32);
  if(!raw)return null;
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if(!match)return null;
  const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
  const date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
function isoDateTime(value){
  if(!value)return null;
  const time=new Date(value).getTime();
  return Number.isFinite(time)?new Date(time).toISOString():null;
}
function safeEnum(value,allowed){
  const normalized=text(value,80).toLowerCase();
  return allowed.includes(normalized)?normalized:null;
}
function entityTypeOf(record){
  return text(field(record,'entityType','entity_type'),80).toLowerCase();
}
function clientIdOf(record){
  return text(field(record,'clientId','client_id'),200);
}
function statusOf(record){
  const status=text(field(record,'status','estado'),80).toLowerCase();
  if(['cerrado','closed','completado','completed'].includes(status))return ACTION_OUTCOME_CLOSED_STATUS;
  return ACTION_OUTCOME_OPEN_STATUS;
}
function createdTime(record){
  const value=isoDateTime(field(record,'createdAt','created_at','updatedAt','updated_at'));
  return value?new Date(value).getTime():0;
}

export function normalizeActionOutcomeEntity(record={}){
  if(entityTypeOf(record)!==ACTION_OUTCOME_ENTITY_TYPE)return null;
  const clientId=clientIdOf(record);
  if(!clientId)return null;
  const id=text(field(record,'entityId','entity_id','id'),200);
  if(!id)return null;

  return Object.freeze({
    id,
    clientId,
    revision:integer(field(record,'revision')),
    status:statusOf(record),
    signalSource:safeEnum(field(record,'signalSource','signal_source'),ACTION_OUTCOME_SIGNAL_SOURCES)||'other',
    signalSummary:text(field(record,'signalSummary','signal_summary'),1200),
    decisionSummary:text(field(record,'decisionSummary','decision_summary'),1200),
    interventionType:safeEnum(field(record,'interventionType','intervention_type'),ACTION_OUTCOME_INTERVENTION_TYPES)||'other',
    interventionSummary:text(field(record,'interventionSummary','intervention_summary'),1600),
    expectedOutcome:text(field(record,'expectedOutcome','expected_outcome'),1200),
    reviewAt:isoDate(field(record,'reviewAt','review_at')),
    outcomeStatus:safeEnum(field(record,'outcomeStatus','outcome_status'),ACTION_OUTCOME_RESULTS),
    outcomeSummary:text(field(record,'outcomeSummary','outcome_summary'),1600),
    outcomeEvidence:text(field(record,'outcomeEvidence','outcome_evidence'),1600),
    reviewedAt:isoDate(field(record,'reviewedAt','reviewed_at')),
    visibleToClient:field(record,'visibleToClient','visible_to_client')===true,
    createdAt:isoDateTime(field(record,'createdAt','created_at')),
    updatedAt:isoDateTime(field(record,'updatedAt','updated_at')),
  });
}

export function validateActionDecisionDraft(input={}){
  const signalSummary=text(input.signalSummary,1200);
  const decisionSummary=text(input.decisionSummary,1200);
  const interventionSummary=text(input.interventionSummary,1600);
  const expectedOutcome=text(input.expectedOutcome,1200);
  const signalSource=safeEnum(input.signalSource,ACTION_OUTCOME_SIGNAL_SOURCES);
  const interventionType=safeEnum(input.interventionType,ACTION_OUTCOME_INTERVENTION_TYPES);
  const reviewAt=isoDate(input.reviewAt);
  const errors=[];
  if(signalSummary.length<3)errors.push('signalSummary');
  if(decisionSummary.length<3)errors.push('decisionSummary');
  if(interventionSummary.length<3)errors.push('interventionSummary');
  if(expectedOutcome.length<3)errors.push('expectedOutcome');
  if(!signalSource)errors.push('signalSource');
  if(!interventionType)errors.push('interventionType');
  if(!reviewAt)errors.push('reviewAt');
  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    value:Object.freeze({
      signalSummary,
      signalSource:signalSource||'other',
      decisionSummary,
      interventionType:interventionType||'other',
      interventionSummary,
      expectedOutcome,
      reviewAt,
      visibleToClient:false,
    }),
  });
}

export function validateActionOutcomeDraft(input={}){
  const outcomeStatus=safeEnum(input.outcomeStatus,ACTION_OUTCOME_RESULTS);
  const outcomeSummary=text(input.outcomeSummary,1600);
  const outcomeEvidence=text(input.outcomeEvidence,1600);
  const reviewedAt=isoDate(input.reviewedAt);
  const errors=[];
  if(!outcomeStatus)errors.push('outcomeStatus');
  if(outcomeSummary.length<3)errors.push('outcomeSummary');
  if(!reviewedAt)errors.push('reviewedAt');
  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors),
    value:Object.freeze({
      outcomeStatus:outcomeStatus||null,
      outcomeSummary,
      outcomeEvidence:outcomeEvidence||null,
      reviewedAt,
      visibleToClient:false,
    }),
  });
}

export function actionOutcomeEntities(records=[],clientId=null){
  const id=text(clientId,200);
  return Object.freeze(
    (Array.isArray(records)?records:[])
      .map(normalizeActionOutcomeEntity)
      .filter(Boolean)
      .filter((item)=>!id||item.clientId===id)
      .sort((a,b)=>{
        const aTime=new Date(a.updatedAt||a.createdAt||0).getTime()||0;
        const bTime=new Date(b.updatedAt||b.createdAt||0).getTime()||0;
        return bTime-aTime||b.revision-a.revision||a.id.localeCompare(b.id);
      })
  );
}

export function summarizeActionOutcomes(records=[],clientId=null,{now=new Date()}={}){
  const items=actionOutcomeEntities(records,clientId);
  const current=now instanceof Date?now:new Date(now);
  const today=Number.isFinite(current.getTime())
    ?current.toISOString().slice(0,10)
    :new Date().toISOString().slice(0,10);
  const open=items.filter((item)=>item.status===ACTION_OUTCOME_OPEN_STATUS);
  const closed=items.filter((item)=>item.status===ACTION_OUTCOME_CLOSED_STATUS);
  const overdue=open.filter((item)=>item.reviewAt&&item.reviewAt<today);
  const dueToday=open.filter((item)=>item.reviewAt===today);
  const outcomes=Object.fromEntries(ACTION_OUTCOME_RESULTS.map((key)=>[
    key,
    closed.filter((item)=>item.outcomeStatus===key).length,
  ]));
  const assessable=closed.filter((item)=>item.outcomeStatus&&item.outcomeStatus!=='not_assessable').length;
  const improved=outcomes.improved||0;
  const completionRate=items.length?closed.length/items.length:null;
  const improvementRate=assessable?improved/assessable:null;

  return Object.freeze({
    total:items.length,
    openCount:open.length,
    closedCount:closed.length,
    overdueCount:overdue.length,
    dueTodayCount:dueToday.length,
    completionRate,
    improvementRate,
    assessableCount:assessable,
    outcomes:Object.freeze(outcomes),
    open:Object.freeze(open),
    closed:Object.freeze(closed),
    overdue:Object.freeze(overdue),
    latest:items[0]||null,
    needsReview:overdue[0]||dueToday[0]||open[0]||null,
  });
}

export const __actionOutcomeInternals=Object.freeze({
  bodyOf,
  field,
  isoDate,
  isoDateTime,
  safeEnum,
  entityTypeOf,
  clientIdOf,
  statusOf,
  createdTime,
});
