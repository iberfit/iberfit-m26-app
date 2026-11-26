import {reportCivilDate,parseCivilDate} from '../domain/civil-date.js';
import {evidenceNumber,stableEvidenceJson} from '../domain/evidence-signal.js';

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
  return evidenceNumber(value,{min:0,integer:true})??fallback;
}
function isoDate(value){
  if(typeof value!=='string')return null;
  return parseCivilDate(value)?.iso??reportCivilDate(value);
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
  if(['abierto','open','pending','pendiente'].includes(status))return ACTION_OUTCOME_OPEN_STATUS;
  return null;
}
function createdTime(record){
  const value=isoDateTime(field(record,'createdAt','created_at','updatedAt','updated_at'));
  return value?new Date(value).getTime():0;
}

export function normalizeActionOutcomeEntity(record={}){
  if(entityTypeOf(record)!==ACTION_OUTCOME_ENTITY_TYPE)return null;
  const clientId=clientIdOf(record);
  const outer=record?.clientId??record?.client_id;
  const inner=record?.body?.clientId??record?.body?.client_id;
  if(!clientId||(outer!=null&&inner!=null&&String(outer)!==String(inner)))return null;
  const id=text(field(record,'entityId','entity_id','id'),200);
  if(!id)return null;

  return Object.freeze({
    entityType:ACTION_OUTCOME_ENTITY_TYPE,
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

function recentFirst(a,b){
  const at=Date.parse(a.updatedAt||a.createdAt||'')||0,bt=Date.parse(b.updatedAt||b.createdAt||'')||0;
  return bt-at||b.revision-a.revision||a.id.localeCompare(b.id);
}
function reconcileActionOutcomes(records,clientId){
  const owner=text(clientId,200),groups=new Map();
  for(const record of Array.isArray(records)?records:[]){
    const item=normalizeActionOutcomeEntity(record);
    if(!item||(owner&&item.clientId!==owner))continue;
    const key=JSON.stringify([item.clientId,item.id]);
    const sync=text(field(record,'syncStatus','sync_status'),80).toLowerCase();
    const invalid=Boolean(!item.status||(sync&&sync!=='clean')||field(record,'serverConfirmed','server_confirmed')===false);
    const signature=stableEvidenceJson([item,invalid]);
    const previous=groups.get(key);
    if(!previous||item.revision>previous.item.revision)groups.set(key,{item,invalid,signature,conflict:false});
    else if(item.revision===previous.item.revision&&signature!==previous.signature)previous.conflict=true;
  }
  const selected=[...groups.values()];
  return {
    items:selected.filter(row=>!row.invalid&&!row.conflict).map(row=>row.item).sort(recentFirst),
    conflictCount:selected.filter(row=>row.conflict).length,
    unconfirmedCount:selected.filter(row=>row.invalid&&!row.conflict).length,
  };
}
export function actionOutcomeEntities(records=[],clientId=null){
  return Object.freeze(reconcileActionOutcomes(records,clientId).items);
}
function openReviewOrder(a,b){
  if(a.reviewAt!==b.reviewAt){
    if(!a.reviewAt)return 1;
    if(!b.reviewAt)return -1;
    return a.reviewAt.localeCompare(b.reviewAt);
  }
  return recentFirst(a,b);
}

export function summarizeActionOutcomes(records=[],clientId=null,{now=new Date()}={}){
  const {items,conflictCount,unconfirmedCount}=reconcileActionOutcomes(records,clientId);
  const today=reportCivilDate(now);
  const open=items.filter(item=>item.status===ACTION_OUTCOME_OPEN_STATUS).sort(openReviewOrder);
  const closed=items.filter(item=>item.status===ACTION_OUTCOME_CLOSED_STATUS);
  const overdue=today?open.filter(item=>item.reviewAt&&item.reviewAt<today):[];
  const dueToday=today?open.filter(item=>item.reviewAt===today):[];
  // A closed decision is not by itself a measured outcome.
  const documented=closed.filter(item=>Boolean(today&&item.reviewedAt&&item.reviewedAt<=today
    &&(!item.createdAt||item.reviewedAt>=reportCivilDate(item.createdAt))
    &&item.outcomeStatus&&item.outcomeSummary&&item.outcomeEvidence));
  const outcomes=Object.fromEntries(ACTION_OUTCOME_RESULTS.map(key=>[
    key,documented.filter(item=>item.outcomeStatus===key).length,
  ]));
  const assessable=documented.filter(item=>item.outcomeStatus!=='not_assessable').length;
  const completionRate=items.length?closed.length/items.length:null;
  const improvementRate=assessable?(outcomes.improved||0)/assessable:null;
  return Object.freeze({
    total:items.length,
    openCount:open.length,closedCount:closed.length,overdueCount:overdue.length,dueTodayCount:dueToday.length,
    missingReviewDateCount:open.filter(item=>!item.reviewAt).length,
    conflictCount,unconfirmedCount,asOf:today,
    undocumentedClosedCount:closed.length-documented.length,
    completionRate,improvementRate,assessableCount:assessable,
    outcomes:Object.freeze(outcomes),
    open:Object.freeze(open),closed:Object.freeze(closed),overdue:Object.freeze(overdue),
    dueToday:Object.freeze(dueToday),
    reviewQueue:Object.freeze([...open,...closed]),
    latest:items[0]||null,needsReview:overdue[0]||dueToday[0]||open[0]||null,
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
