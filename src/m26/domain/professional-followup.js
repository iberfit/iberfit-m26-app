import {IRI_PROTOCOL_CATALOG_VERSION,iriProtocolById} from '../workflows/iri-protocol-catalog.js';
import {stableEvidenceJson} from './evidence-signal.js';
import {reportCivilDate} from './civil-date.js';

// Independent observations; these are never inserted into iriAssessments or
// silently treated as a published goal result. Server authorization is primary.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const shape=(v,keys)=>Boolean(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));
const str=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.length>0)&&v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v);
const num=(v,min,max,whole=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!whole||Number.isInteger(v));
const optional=(v,min,max,whole=false)=>v===null||num(v,min,max,whole);
const id=v=>typeof v==='string'&&UUID.test(v)?v.toLowerCase():null;
const KEYS=['schemaVersion','testId','field','side','variant','protocolVersion','configuration','adaptationReason','setup'];
const UNITS=new Set(['kg','cm','percent','reps','bpm','s']);
const reps=(value,unit)=>unit==='reps'&&num(value,0,500,true);

// Preserve full Postgres microsecond precision and explicit offset for keyset
// cursors. Never normalize a remote cursor through Date.toISOString().
function instant(v){
 if(typeof v!=='string')return null;
 const m=v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u);
 if(!m)return null;
 const [,y,mo,d,h,mi,s,frac='',zone]=m;
 const yy=Number(y),month=Number(mo),day=Number(d);
 if(yy<1900||month<1||month>12||day<1||day>31||Number(h)>23||Number(mi)>59||Number(s)>59)return null;
 const calendar=new Date(Date.UTC(yy,month-1,day));if(calendar.getUTCDate()!==day||calendar.getUTCMonth()!==month-1)return null;
 if(zone!=='Z'&&(Number(zone.slice(1,3))>14||Number(zone.slice(4))>59||(Number(zone.slice(1,3))===14&&Number(zone.slice(4))!==0)))return null;
 const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
 return BigInt(ms)*1000n+BigInt(frac.padEnd(6,'0').slice(3)||'0');
}
export function validateProfessionalFollowupProtocol(p,value,unit){
 if(!shape(p,KEYS)||p.schemaVersion!==1||p.protocolVersion!==IRI_PROTOCOL_CATALOG_VERSION||!UNITS.has(unit)||!str(p.testId,80)||!str(p.field,40)||!str(p.side,20)||!str(p.variant,120)||!str(p.configuration,400)||!str(p.adaptationReason,240,true)||/sin registrar|sin especificar|no confirmado|desconocido|—|\bnull\b/iu.test(p.configuration))return false;
 const protocol=iriProtocolById(p.testId);if(!protocol||!protocol.sides.includes(p.side)||!protocol.variants.some(x=>x.id===p.variant))return false;
 const t=p.testId,f=p.field,v=p.variant,a=p.adaptationReason,s=p.setup;
 const notApplicable=p.side==='not-applicable',adapted=()=>Boolean(a);
 switch(t){
 case 'chair-stand-30s':return notApplicable&&f==='repetitions'&&reps(value,unit)&&(v==='standard-arms-crossed'||adapted())&&shape(s,['chairHeightCm'])&&num(s.chairHeightCm,20,100);
 case 'one-minute-sit-to-stand':return notApplicable&&v==='1msts-standard'&&((f==='repetitions'&&reps(value,unit))||(f==='oneMinuteHr'&&unit==='bpm'&&num(value,1,300,true)))&&shape(s,['chairHeightCm','durationSeconds'])&&num(s.chairHeightCm,20,100)&&s.durationSeconds===60;
 case 'bodyweight-squat-60s':return notApplicable&&f==='repetitions'&&reps(value,unit)&&(v==='bodyweight-60s-standard'||adapted())&&shape(s,['depthCriterion','stance','durationSeconds'])&&s.durationSeconds===60&&str(s.depthCriterion,120)&&str(s.stance,120);
 case 'push-test':return notApplicable&&f==='repetitions'&&reps(value,unit)&&(v==='standard'||adapted())&&shape(s,['variant','supportHeightCm','durationSeconds'])&&s.variant===v&&(num(s.supportHeightCm,1,250)||(v!=='incline'&&s.supportHeightCm===null))&&optional(s.durationSeconds,1,3600,true);
 case 'trx-row':return notApplicable&&f==='repetitions'&&reps(value,unit)&&(v==='standing-row-standard'||adapted())&&shape(s,['handleHeightCm','heelDistanceCm','bodyAngleDeg','position','durationSeconds'])&&num(s.handleHeightCm,1,300)&&optional(s.heelDistanceCm,0,300)&&optional(s.bodyAngleDeg,0,90)&&(s.heelDistanceCm!==null||s.bodyAngleDeg!==null)&&str(s.position,120)&&optional(s.durationSeconds,1,3600,true);
 case 'weight-bearing-lunge':case 'back-saver':return ['left','right'].includes(p.side)&&f==='bestCm'&&unit==='cm'&&num(value,-100,100)&&shape(s,['trialCount'])&&num(s.trialCount,1,10,true);
 case 'core-plank':return p.side==='bilateral'&&f==='frontPlankSeconds'&&unit==='s'&&num(value,0,3600)&&(v!=='knees-supported'||adapted())&&shape(s,['quality'])&&str(s.quality,120);
 case 'posterior-chain-endurance':return notApplicable&&f==='seconds'&&unit==='s'&&num(value,0,3600)&&['sorensen-horizontal','sorensen-45'].includes(v)&&shape(s,['protocol','equipmentCompatible'])&&s.protocol===v&&s.equipmentCompatible===true;
 case 'body-composition':return notApplicable&&shape(s,['method','device','measurementConditions','directlyRecorded'])&&s.method===v&&str(s.device,120)&&str(s.measurementConditions,240)&&s.directlyRecorded===true&&((f==='weightKg'&&unit==='kg'&&num(value,20,350))||(f==='waistCm'&&unit==='cm'&&num(value,30,250))||(f==='bodyFatPercent'&&unit==='percent'&&num(value,1,80))||(['leanMassKg','muscleMassKg'].includes(f)&&unit==='kg'&&num(value,1,250)));
 default:return false;
 }
}
export const PROFESSIONAL_RECTIFICATION_REASONS=Object.freeze({measurement_error:'Error de medición',protocol_error:'Error de protocolo',duplicate:'Registro duplicado',wrong_subject:'Registro de otra persona',other_invalid:'Otro motivo de invalidez'});
const observationKeys=['id','clientId','measuredAt','value','unit','protocol'];
const validReason=v=>typeof v==='string'&&Object.hasOwn(PROFESSIONAL_RECTIFICATION_REASONS,v);
export function professionalFollowupVoidParams(draft){
 if(!shape(draft,['id','clientId','targetId','reason'])||!id(draft.id)||!id(draft.clientId)||!id(draft.targetId)||id(draft.id)===id(draft.targetId)||!validReason(draft.reason))throw Error('M26_GX_FOLLOWUP_VOID_INVALID');
 return Object.freeze({p_id:id(draft.id),p_client_id:id(draft.clientId),p_target_id:id(draft.targetId),p_reason:draft.reason});
}
function rectification(v,targetId,{now=new Date(),measuredAt=null}={}){
 if(!shape(v,['id','targetId','reason','voidedAt'])||!id(v.id)||id(v.targetId)!==targetId||id(v.id)===targetId||!validReason(v.reason))throw Error('M26_GX_FOLLOWUP_VOID_RESPONSE_INVALID');
 const stamp=instant(v.voidedAt),observed=measuredAt===null?null:instant(measuredAt);
 if(stamp===null||!Number.isFinite(now?.getTime?.())||stamp>BigInt(now.getTime())*1000n+999n||(measuredAt!==null&&(observed===null||stamp<observed)))throw Error('M26_GX_FOLLOWUP_VOID_RESPONSE_INVALID');
 return Object.freeze({id:id(v.id),targetId,reason:v.reason,voidedAt:v.voidedAt});
}
export function verifyProfessionalFollowupVoidReceipt(result,params,{now=new Date()}={}){
 if(!shape(result,['ok','clientId','id','targetId','reason','voidedAt'])||result.ok!==true||id(result.clientId)!==params.p_client_id)throw Error('M26_GX_FOLLOWUP_VOID_RESPONSE_INVALID');
 const {ok,clientId,...rest}=result;const v=rectification(rest,params.p_target_id,{now});
 if(v.id!==params.p_id||v.reason!==params.p_reason)throw Error('M26_GX_FOLLOWUP_VOID_CONFLICT');
 return Object.freeze({...v,clientId:params.p_client_id});
}
function observation(value,{receipt=false,now=new Date()}={}){
 const keys=receipt?[...observationKeys,'revision']:observationKeys;
 if(!shape(value,keys)||!id(value.id)||!id(value.clientId)||!validateProfessionalFollowupProtocol(value.protocol,value.value,value.unit))throw Error('M26_GX_FOLLOWUP_INVALID');
 const stamp=instant(value.measuredAt);if(stamp===null||!Number.isFinite(now?.getTime?.())||stamp>BigInt(now.getTime())*1000n+999n||stamp<BigInt(Date.UTC(1900,0,1))*1000n||(receipt&&value.revision!==1))throw Error('M26_GX_FOLLOWUP_INVALID');
 const protocol=Object.freeze({...value.protocol,setup:Object.freeze({...value.protocol.setup})});
 return Object.freeze({id:id(value.id),clientId:id(value.clientId),measuredAt:value.measuredAt,value:value.value,unit:value.unit,protocol,...(receipt?{revision:1}:{})});
}
export function professionalFollowupParams(draft,{now=new Date()}={}){
 const o=observation(draft,{now});return Object.freeze({p_id:o.id,p_client_id:o.clientId,p_measured_at:o.measuredAt,p_value:o.value,p_unit:o.unit,p_protocol:o.protocol});
}
export function verifyProfessionalFollowupReceipt(result,params,{now=new Date()}={}){
 if(!shape(result,['ok',...observationKeys,'revision'])||result.ok!==true)throw Error('M26_GX_FOLLOWUP_ACK_INVALID');
 const {ok,...rest}=result;const o=observation(rest,{receipt:true,now});
 if(o.id!==params.p_id||o.clientId!==params.p_client_id||instant(o.measuredAt)!==instant(params.p_measured_at)||o.value!==params.p_value||o.unit!==params.p_unit||stableEvidenceJson(o.protocol)!==stableEvidenceJson(params.p_protocol))throw Error('M26_GX_FOLLOWUP_ACK_CONFLICT');
 return o;
}
// History must explicitly attest rectification state. A legacy response lacking
// this field must fail closed, not silently reinstate an invalid observation.
export function readProfessionalFollowupHistoryItem(item,{now=new Date()}={}){
 if(!shape(item,[...observationKeys,'revision','rectification']))throw Error('M26_GX_FOLLOWUP_PAGE_RESPONSE_INVALID');
 const {rectification:raw,...rest}=item;const o=observation(rest,{receipt:true,now});
 return Object.freeze({...o,rectification:raw===null?null:rectification(raw,o.id,{now,measuredAt:o.measuredAt})});
}
export function compareProfessionalFollowupPair(previous,current,{now=new Date()}={}){
 let a,b;try{a=readProfessionalFollowupHistoryItem(previous,{now});b=readProfessionalFollowupHistoryItem(current,{now});}catch{return null;}
 const start=reportCivilDate(a.measuredAt),end=reportCivilDate(b.measuredAt);
 if(a.rectification||b.rectification||a.clientId!==b.clientId||a.id===b.id||!start||!end||end<=start||a.unit!==b.unit||stableEvidenceJson(a.protocol)!==stableEvidenceJson(b.protocol))return null;
 return Object.freeze({clientId:a.clientId,previousId:a.id,currentId:b.id,periodStart:start,periodEnd:end,previous:a.value,value:b.value,unit:a.unit,delta:Math.round((b.value-a.value)*100)/100,deltaUnit:a.unit==='percent'?'p. p.':a.unit,reviewRequired:true});
}
// History arrives newest first from verifyProfessionalFollowupPage. Pair only
// the immediately preceding loaded observation of the same subject, test,
// field and side. An incompatible, same-day or voided predecessor blocks
// automatic comparison; do not search back for an older favorable result.
// Keep this projection local to the current render or explicit review action.
export function professionalFollowupHistoryComparisons(items,{now=new Date()}={}){
 const result=new Map(),nextByMetric=new Map();
 if(!Array.isArray(items))return result;
 for(let i=items.length-1;i>=0;i--){
  const row=items[i],p=row?.protocol;
  if(!row?.id||!row.clientId||!p?.testId||!p.field||!p.side)continue;
  const key=JSON.stringify([row.clientId,p.testId,p.field,p.side]);
  const previous=nextByMetric.get(key);
  if(previous)result.set(row.id,Object.freeze({previous,comparison:compareProfessionalFollowupPair(previous,row,{now})}));
  nextByMetric.set(key,row);
 }
 return result;
}
export function professionalFollowupPageParams(clientId,{limit=30,cursor=null}={}){
 const owner=id(clientId);if(!owner||!Number.isInteger(limit)||limit<1||limit>50||(cursor!==null&&(!shape(cursor,['measuredAt','id'])||instant(cursor.measuredAt)===null||!id(cursor.id))))throw Error('M26_GX_FOLLOWUP_PAGE_INVALID');
 return Object.freeze({p_client_id:owner,p_limit:limit,p_cursor_at:cursor?.measuredAt??null,p_cursor_id:cursor?id(cursor.id):null});
}
function precedes(a,b){const at=instant(a.measuredAt),bt=instant(b.measuredAt);return at<bt||(at===bt&&a.id<b.id);}
export function verifyProfessionalFollowupPage(result,params,{now=new Date()}={}){
 if(!shape(result,['ok','clientId','items','nextCursor'])||result.ok!==true||id(result.clientId)!==params.p_client_id||!Array.isArray(result.items)||result.items.length>params.p_limit)throw Error('M26_GX_FOLLOWUP_PAGE_RESPONSE_INVALID');
 const seen=new Set(),items=[];let previous=params.p_cursor_at?{measuredAt:params.p_cursor_at,id:params.p_cursor_id}:null;
 for(const item of result.items){const o=readProfessionalFollowupHistoryItem(item,{now});if(o.clientId!==params.p_client_id||seen.has(o.id)||(previous&&!precedes(o,previous)))throw Error('M26_GX_FOLLOWUP_PAGE_RESPONSE_INVALID');seen.add(o.id);items.push(o);previous=o;}
 let nextCursor=null;if(result.nextCursor!==null){const c=result.nextCursor;if(items.length!==params.p_limit||!shape(c,['measuredAt','id'])||!previous||id(c.id)!==previous.id||instant(c.measuredAt)!==instant(previous.measuredAt))throw Error('M26_GX_FOLLOWUP_PAGE_RESPONSE_INVALID');nextCursor=Object.freeze({measuredAt:c.measuredAt,id:id(c.id)});}
 return Object.freeze({clientId:params.p_client_id,items:Object.freeze(items),nextCursor});
}

// Receipts are a read-only reconciliation aid, not a substitute for exact write ACK.
export function professionalFollowupRecentParams(clientId){
 const owner=id(clientId);if(!owner)throw Error('M26_GX_FOLLOWUP_RECENT_INVALID');return Object.freeze({p_client_id:owner});
}
export function verifyProfessionalFollowupRecent(result,params,{now=new Date()}={}){
 const fail=()=>{throw Error('M26_GX_FOLLOWUP_RECENT_RESPONSE_INVALID');};
 if(!shape(result,['ok','clientId','items'])||result.ok!==true||id(result.clientId)!==params.p_client_id||!Array.isArray(result.items)||result.items.length>10||!Number.isFinite(now?.getTime?.()))fail();
 const seen=new Set(),items=[];let prev=null;
 for(const r of result.items){
  if(!shape(r,['id','kind','createdAt','measuredAt','targetId'])||!id(r.id)||seen.has(id(r.id))||!['record','void'].includes(r.kind)||(r.kind==='record'?r.targetId!==null:!id(r.targetId)||id(r.targetId)===id(r.id)))fail();
  const created=instant(r.createdAt),measured=instant(r.measuredAt),rid=id(r.id);
  if(created===null||measured===null||created<measured||created>BigInt(now.getTime())*1000n+999n||(prev&&(created>prev.created||(created===prev.created&&rid>=prev.id))))fail();
  seen.add(rid);prev={created,id:rid};items.push(Object.freeze({id:rid,kind:r.kind,createdAt:r.createdAt,measuredAt:r.measuredAt,targetId:r.targetId===null?null:id(r.targetId)}));
 }
 return Object.freeze({clientId:params.p_client_id,items:Object.freeze(items)});
}

// Explicit, read-only lookup of one receipt from the authenticated actor.
// A valid readback proves the stored content; it does not prove a lost draft matched.
export function professionalFollowupDetailParams(clientId,operationId){
 const owner=id(clientId),operation=id(operationId);if(!owner||!operation)throw Error('M26_GX_FOLLOWUP_DETAIL_INVALID');return Object.freeze({p_client_id:owner,p_operation_id:operation});
}
export function verifyProfessionalFollowupDetail(result,params,{now=new Date()}={}){
 const fail=()=>{throw Error('M26_GX_FOLLOWUP_DETAIL_RESPONSE_INVALID');};
 if(!shape(result,['ok','clientId','operationId','kind','createdAt','observation'])||result.ok!==true||id(result.clientId)!==params.p_client_id||id(result.operationId)!==params.p_operation_id||!['record','void'].includes(result.kind))fail();
 const created=instant(result.createdAt),row=readProfessionalFollowupHistoryItem(result.observation,{now});
 if(created===null||!Number.isFinite(now?.getTime?.())||created>BigInt(now.getTime())*1000n+999n||created<instant(row.measuredAt)||row.clientId!==params.p_client_id)fail();
 if(result.kind==='record'?(row.id!==params.p_operation_id||(row.rectification&&instant(row.rectification.voidedAt)<created)):(row.rectification?.id!==params.p_operation_id||instant(row.rectification.voidedAt)!==created))fail();
 return Object.freeze({clientId:params.p_client_id,operationId:params.p_operation_id,kind:result.kind,createdAt:result.createdAt,observation:row});
}
export function professionalFollowupDetailMatchesDraft(detail,op,{now=new Date()}={}){
 // Never match on UUID alone. Reuse the canonical exact ACK validators.
 try{if(!op||detail.kind!==op.kind||detail.operationId!==op.payload.id||detail.clientId!==op.payload.clientId)return false;
  const verified=verifyProfessionalFollowupDetail({ok:true,...detail},professionalFollowupDetailParams(op.payload.clientId,op.payload.id),{now});
  const row=verified.observation;
  if(op.kind==='record'){const {rectification:ignored,...stored}=row;verifyProfessionalFollowupReceipt({ok:true,...stored},professionalFollowupParams(op.payload,{now}),{now});}
  else if(op.kind==='void'){verifyProfessionalFollowupVoidReceipt({ok:true,clientId:row.clientId,...row.rectification},professionalFollowupVoidParams(op.payload),{now});}
  else return false;
  return true;
 }catch{return false;}
}

export function professionalFollowupDetailMatchesReference(detail,reference){
 if(!reference)return true;
 const row=detail?.observation;
 return Boolean(row&&detail.operationId===reference.id&&detail.kind===reference.kind&&instant(detail.createdAt)!==null&&instant(detail.createdAt)===instant(reference.createdAt)&&instant(row.measuredAt)!==null&&instant(row.measuredAt)===instant(reference.measuredAt)&&(detail.kind==='record'?reference.targetId===null:row.id===reference.targetId));
}

// GX: a reviewed pair is a versioned intention, not a client-visible report.
// Persistence, actor identity, revision CAS and fresh reads must be enforced
// by the authorized server; a local object is never proof of publication.
function publicationPair(previous,current,clientId,now){
 const comparison=compareProfessionalFollowupPair(previous,current,{now});
 if(!comparison||comparison.clientId!==clientId)return null;
 const snapshot=row=>{
  const o=readProfessionalFollowupHistoryItem(row,{now});
  return Object.freeze({id:o.id,revision:o.revision,measuredMicros:instant(o.measuredAt).toString(),value:o.value,unit:o.unit,protocol:o.protocol});
 };
 return Object.freeze({previous:snapshot(previous),current:snapshot(current)});
}
export function buildProfessionalPublicationDraft(intent,previous,current,{now=new Date()}={}){
 if(!shape(intent,['id','clientId','expectedRevision','reviewed'])||!id(intent.id)||!id(intent.clientId)||!Number.isSafeInteger(intent.expectedRevision)||intent.expectedRevision<0||intent.expectedRevision>=2147483647||intent.reviewed!==true)return null;
 const owner=id(intent.clientId),pair=publicationPair(previous,current,owner,now);
 if(!pair||[owner,pair.previous.id,pair.current.id].includes(id(intent.id)))return null;
 return Object.freeze({id:id(intent.id),clientId:owner,expectedRevision:intent.expectedRevision,pair});
}
// Transport contract only: an exact ACK from the authorized RPC must match
// what the coach reviewed. The caller is responsible for the session fence.
export function verifyProfessionalPublicationReceipt(result,draft,{now=new Date()}={}){
 const fail=()=>{throw Error('M26_GX_PUBLICATION_ACK_INVALID');};
 if(!shape(draft,['id','clientId','expectedRevision','pair'])||!id(draft.id)||!id(draft.clientId)||!Number.isSafeInteger(draft.expectedRevision)||draft.expectedRevision<0||draft.expectedRevision>=2147483647||!shape(draft.pair,['previous','current']))fail();
 if(!shape(result,['ok','id','clientId','revision','status','reviewedAt','publishedAt','pair'])||result.ok!==true||result.id!==draft.id||result.clientId!==draft.clientId||result.revision!==draft.expectedRevision+1||result.status!=='published'||!shape(result.pair,['previous','current']))fail();
 const reviewed=instant(result.reviewedAt),published=instant(result.publishedAt);
 if(reviewed===null||published===null||!Number.isFinite(now?.getTime?.())||published<reviewed||published>BigInt(now.getTime())*1000n+999n)fail();
 // Reconstruct the observation from the reviewed canonical pair, not any
 // caller-supplied display labels or calculated deltas.
 for(const side of ['previous','current']){
  const s=draft.pair[side];
  if(!shape(s,['id','revision','measuredMicros','value','unit','protocol'])||!id(s.id)||s.revision!==1||typeof s.measuredMicros!=='string'||!/^-?\d{1,20}$/u.test(s.measuredMicros)||BigInt(s.measuredMicros)>reviewed||!validateProfessionalFollowupProtocol(s.protocol,s.value,s.unit))fail();
 }
 const civil=s=>{const ms=Number(BigInt(s.measuredMicros)/1000n);return ms>=Date.UTC(1900,0,1)&&ms<=now.getTime()?reportCivilDate(new Date(ms).toISOString()):null;};
 if(!civil(draft.pair.previous)||!civil(draft.pair.current)||civil(draft.pair.previous)>=civil(draft.pair.current))fail();
 if([draft.clientId,draft.pair.previous.id,draft.pair.current.id].includes(draft.id)||stableEvidenceJson(result.pair)!==stableEvidenceJson(draft.pair)||draft.pair.previous.id===draft.pair.current.id||BigInt(draft.pair.previous.measuredMicros)>=BigInt(draft.pair.current.measuredMicros)||draft.pair.previous.unit!==draft.pair.current.unit||stableEvidenceJson(draft.pair.previous.protocol)!==stableEvidenceJson(draft.pair.current.protocol))fail();
 // Defensive copy: consumers cannot mutate nested response data after ACK.
 const copy=s=>Object.freeze({...s,protocol:Object.freeze({...s.protocol,setup:Object.freeze({...s.protocol.setup})})});
 return Object.freeze({id:result.id,clientId:result.clientId,revision:result.revision,status:'published',reviewedAt:result.reviewedAt,publishedAt:result.publishedAt,pair:Object.freeze({previous:copy(draft.pair.previous),current:copy(draft.pair.current)})});
}
// Internal report boundary. Requires current authorized readback of the
// publication AND both observations, not the historical publication receipt
// or paginated cache. No authority is inferred from this client-side helper.
// No private configuration, actor, raw snapshot or inferred achievement exits.
export function projectProfessionalPublicationEvidence(publication,previous,current,{clientId,periodStart,periodEnd,now=new Date()}={}){
 const owner=id(clientId),today=reportCivilDate(now);
 if(!owner||!today||typeof periodStart!=='string'||typeof periodEnd!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)||instant(periodStart+'T00:00:00Z')===null||instant(periodEnd+'T00:00:00Z')===null||periodStart>periodEnd||periodEnd>today)return null;
 if(!shape(publication,['id','clientId','revision','status','reviewedAt','publishedAt','pair'])||publication.clientId!==owner||!Number.isSafeInteger(publication.revision)||publication.revision<1||publication.status!=='published')return null;
 const pair=publicationPair(previous,current,owner,now);
 if(!pair)return null;
 try{verifyProfessionalPublicationReceipt({ok:true,...publication},{id:publication.id,clientId:owner,expectedRevision:publication.revision-1,pair},{now});}catch{return null;}
 const c=compareProfessionalFollowupPair(previous,current,{now});
 if(!c||c.periodEnd<periodStart||c.periodEnd>periodEnd)return null;
 return Object.freeze({publicationId:publication.id,publicationRevision:publication.revision,clientId:owner,previousId:c.previousId,currentId:c.currentId,testId:pair.current.protocol.testId,field:pair.current.protocol.field,side:pair.current.protocol.side,periodStart:c.periodStart,periodEnd:c.periodEnd,previous:c.previous,value:c.value,unit:c.unit,delta:c.delta,deltaUnit:c.deltaUnit,interpretation:'Comparación de dos mediciones equivalentes revisadas profesionalmente; no acredita por sí sola un logro, diagnóstico ni causalidad.'});
}

// Server accepts independent publication/operation identities. Validate the
// canonical reviewed pair before any dispatch, then require exact ACK.
export function professionalPublicationWriteParams(draft,operationId,{now=new Date()}={}){
 const fail=()=>{throw Error('M26_GX_PUBLICATION_REQUEST_INVALID');};
 if(!shape(draft,['id','clientId','expectedRevision','pair'])||!id(operationId)||operationId!==id(operationId)||!id(draft.id)||draft.id!==id(draft.id)||!id(draft.clientId)||draft.clientId!==id(draft.clientId)||!shape(draft.pair,['previous','current'])||[draft.id,draft.clientId,draft.pair.previous?.id,draft.pair.current?.id].includes(operationId))fail();
 let checked;try{checked=verifyProfessionalPublicationReceipt({ok:true,id:draft.id,clientId:draft.clientId,revision:draft.expectedRevision+1,status:'published',reviewedAt:now.toISOString(),publishedAt:now.toISOString(),pair:draft.pair},draft,{now});}catch{fail();}
 return Object.freeze({p_client:draft.clientId,p_publication:draft.id,p_operation:operationId,p_expected:draft.expectedRevision,p_status:'published',p_pair:checked.pair});
}
export function professionalPublicationReadParams(clientId,publicationId){
 const owner=id(clientId),pub=id(publicationId);if(!owner||!pub||owner===pub)throw Error('M26_GX_PUBLICATION_REQUEST_INVALID');return Object.freeze({p_client:owner,p_publication:pub});
}
export function verifyProfessionalPublicationRead(result,params,{now=new Date()}={}){
 if(result===null)return null;
 const fail=()=>{throw Error('M26_GX_PUBLICATION_READ_INVALID');};
 if(!shape(result,['id','clientId','revision','status','reviewedAt','publishedAt','pair'])||result.id!==params.p_publication||result.clientId!==params.p_client||!Number.isSafeInteger(result.revision)||result.revision<1||result.revision>2147483647||!['published','withdrawn','invalidated'].includes(result.status))fail();
 const reviewed=instant(result.reviewedAt),published=instant(result.publishedAt);
 if(reviewed===null||!Number.isFinite(now?.getTime?.())||reviewed>BigInt(now.getTime())*1000n+999n)fail();
 if(result.status==='published')return verifyProfessionalPublicationReceipt({ok:true,...result},{id:result.id,clientId:result.clientId,expectedRevision:result.revision-1,pair:result.pair},{now});
 if(result.pair!==null||(result.status==='withdrawn'?result.publishedAt!==null:published===null||published!==reviewed))fail();
 return Object.freeze({...result});
}

// GX324 — explicit, scoped publication list, lookup, withdrawal and operation receipt.
export function professionalPublicationFindParams(clientId,previousId,currentId){
 const owner=id(clientId),a=id(previousId),b=id(currentId);if(!owner||!a||!b||new Set([owner,a,b]).size!==3)throw Error('M26_GX_PUBLICATION_REQUEST_INVALID');
 return Object.freeze({p_client:owner,p_previous:a,p_current:b});
}
export function verifyProfessionalPublicationFind(result,params,{now=new Date()}={}){
 if(result===null)return null;
 const fail=()=>{throw Error('M26_GX_PUBLICATION_FIND_INVALID');};
 if(!shape(result,['previousId','currentId','publication'])||result.previousId!==params.p_previous||result.currentId!==params.p_current||!result.publication)fail();
 const head=verifyProfessionalPublicationRead(result.publication,professionalPublicationReadParams(params.p_client,result.publication.id),{now});
 if(!head||(head.status==='published'&&(head.pair.previous.id!==params.p_previous||head.pair.current.id!==params.p_current)))fail();return head;
}
export function professionalPublicationListParams(clientId,{cursor=null,limit=10}={}){
 const owner=id(clientId);if(!owner||!(cursor===null||id(cursor)===cursor)||!Number.isInteger(limit)||limit<1||limit>20)throw Error('M26_GX_PUBLICATION_REQUEST_INVALID');
 return Object.freeze({p_client:owner,p_after:cursor,p_limit:limit});
}
export function verifyProfessionalPublicationList(result,params,{now=new Date()}={}){
 const fail=()=>{throw Error('M26_GX_PUBLICATION_LIST_INVALID');};
 if(!shape(result,['clientId','items','nextCursor'])||result.clientId!==params.p_client||!Array.isArray(result.items)||result.items.length>params.p_limit)fail();
 let previous=params.p_after;const items=result.items.map(h=>{
  if(!shape(h,['id','clientId','revision','status','reviewedAt','publishedAt'])||!id(h.id)||h.id!==id(h.id)||h.id===params.p_client||(previous!==null&&h.id<=previous)||h.clientId!==params.p_client||!Number.isSafeInteger(h.revision)||h.revision<1||h.revision>2147483647||!['published','withdrawn','invalidated'].includes(h.status))fail();
  const r=instant(h.reviewedAt),p=instant(h.publishedAt);if(r===null||!Number.isFinite(now?.getTime?.())||r>BigInt(now.getTime())*1000n+999n||(h.status==='withdrawn'?h.publishedAt!==null:p===null||p!==r))fail();previous=h.id;return Object.freeze({...h});
 });
 if(result.nextCursor!==null&&(items.length!==params.p_limit||result.nextCursor!==previous))fail();return Object.freeze({clientId:params.p_client,items:Object.freeze(items),nextCursor:result.nextCursor});
}
export function professionalPublicationWithdrawParams(draft,operationId){
 if(!shape(draft,['id','clientId','expectedRevision'])||!id(draft.id)||id(draft.id)!==draft.id||!id(draft.clientId)||id(draft.clientId)!==draft.clientId||!id(operationId)||id(operationId)!==operationId||new Set([draft.id,draft.clientId,operationId]).size!==3||!Number.isInteger(draft.expectedRevision)||draft.expectedRevision<1||draft.expectedRevision>=2147483647)throw Error('M26_GX_PUBLICATION_REQUEST_INVALID');
 return Object.freeze({p_client:draft.clientId,p_publication:draft.id,p_operation:operationId,p_expected:draft.expectedRevision,p_status:'withdrawn',p_pair:null});
}
export function verifyProfessionalPublicationWithdrawal(result,params,{now=new Date()}={}){
 if(!shape(result,['ok','id','clientId','revision','status','reviewedAt','publishedAt','pair'])||result.ok!==true||result.revision!==params.p_expected+1||result.status!=='withdrawn')throw Error('M26_GX_PUBLICATION_ACK_INVALID');
 const {ok,...read}=result;return verifyProfessionalPublicationRead(read,professionalPublicationReadParams(params.p_client,params.p_publication),{now});
}
export function professionalPublicationOperationParams(op,{now=new Date()}={}){
 if(!op||!['publication','withdrawal'].includes(op.kind)||!op.payload)throw Error('M26_GX_PUBLICATION_REQUEST_INVALID');
 const {draft,operationId}=op.payload;
 return op.kind==='publication'?professionalPublicationWriteParams(draft,operationId,{now}):professionalPublicationWithdrawParams(draft,operationId);
}
export function verifyProfessionalPublicationRecovery(result,params){
 if(result===null)return null;
 if(!shape(result,['clientId','publicationId','operationId','revision','status','currentRevision','currentStatus'])||result.clientId!==params.p_client||result.publicationId!==params.p_publication||result.operationId!==params.p_operation||result.revision!==params.p_expected+1||result.status!==params.p_status||!Number.isSafeInteger(result.currentRevision)||result.currentRevision<result.revision||result.currentRevision>2147483647||!['published','withdrawn','invalidated'].includes(result.currentStatus)||(result.currentRevision===result.revision&&(result.status==='withdrawn'?result.currentStatus!=='withdrawn':!['published','invalidated'].includes(result.currentStatus))))throw Error('M26_GX_PUBLICATION_RECOVERY_INVALID');
 return Object.freeze({...result});
}
// Convert the server-confirmed pair without rounding away Postgres microseconds.
// Used only by the authenticated Coach preview. Never use an old receipt as fresh readback.
export function professionalPublicationObservations(head,clientId,{now=new Date()}={}){
 try{
  if(!head||head.status!=='published')return null;
  const valid=verifyProfessionalPublicationRead(head,professionalPublicationReadParams(clientId,head.id),{now});
  const toObservation=s=>{const micros=BigInt(s.measuredMicros);const rest=((micros%1000n)+1000n)%1000n;const ms=(micros-rest)/1000n;const stamp=new Date(Number(ms)).toISOString().replace('Z',String(rest).padStart(3,'0')+'Z');return readProfessionalFollowupHistoryItem({id:s.id,clientId,revision:s.revision,measuredAt:stamp,value:s.value,unit:s.unit,protocol:s.protocol,rectification:null},{now});};
  return Object.freeze({previous:toObservation(valid.pair.previous),current:toObservation(valid.pair.current)});
 }catch{return null;}
}
// Readback-derived review projection for the Coach only. This is NOT a server
// authorization or an official report. No configuration, author or raw pair.
export function projectProfessionalPublicationPreview(head,{clientId,periodStart,periodEnd,now=new Date()}={}){
 const observations=professionalPublicationObservations(head,clientId,{now});
 if(!observations)return null;
 return projectProfessionalPublicationEvidence(head,observations.previous,observations.current,{clientId,periodStart,periodEnd,now});
}
export function buildProfessionalPublicationReportPreview(head,{clientId,now=new Date(),reviewGoal=()=>''}={}){
 const observations=professionalPublicationObservations(head,clientId,{now});if(!observations)return null;
 const previous=observations.previous,current=observations.current;
 const evidence=projectProfessionalPublicationPreview(head,{clientId,periodStart:reportCivilDate(previous.measuredAt),periodEnd:reportCivilDate(current.measuredAt),now});if(!evidence)return null;
 let goal='';try{const text=reviewGoal(clientId,current);if(typeof text==='string')goal=text.trim().slice(0,1200);}catch{}
 // Explicitly a preview, never a new achievement or client-visible report.
 return Object.freeze({testId:evidence.testId,field:evidence.field,side:evidence.side,periodStart:evidence.periodStart,periodEnd:evidence.periodEnd,previous:evidence.previous,value:evidence.value,unit:evidence.unit,delta:evidence.delta,deltaUnit:evidence.deltaUnit,goal,interpretation:evidence.interpretation,official:false});
}

// A bounded, explicitly requested report-proof batch. No values or raw protocols
// are sent to the server; it re-reads the exact current review revisions.
export function professionalReportProofParams(heads,{clientId,periodStart,periodEnd,now=new Date()}={}){
 const owner=id(clientId),today=reportCivilDate(now);
 const fail=()=>{throw Error('M26_GX_REPORT_PROOF_INVALID');};
 if(!owner||owner!==clientId||!today||!Array.isArray(heads)||heads.length<1||heads.length>12||typeof periodStart!=='string'||typeof periodEnd!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(periodStart)||!/^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)||instant(periodStart+'T00:00:00Z')===null||instant(periodEnd+'T00:00:00Z')===null||periodStart>periodEnd||periodEnd>today||(Date.parse(periodEnd)-Date.parse(periodStart))/86400000>366)fail();
 const seen=new Set(),refs=[];
 for(const head of heads){const p=projectProfessionalPublicationPreview(head,{clientId,periodStart,periodEnd,now});if(!p||seen.has(p.publicationId))fail();seen.add(p.publicationId);refs.push(Object.freeze({publicationId:p.publicationId,publicationRevision:p.publicationRevision}));}
 return Object.freeze({p_client:owner,p_start:periodStart,p_end:periodEnd,p_refs:Object.freeze(refs)});
}
export function verifyProfessionalReportProof(result,params,heads,{now=new Date()}={}){
 const fail=()=>{throw Error('M26_GX_REPORT_PROOF_RESPONSE_INVALID');};
 const expected=professionalReportProofParams(heads,{clientId:params.p_client,periodStart:params.p_start,periodEnd:params.p_end,now});
 if(stableEvidenceJson(expected)!==stableEvidenceJson(params)||!shape(result,['schemaVersion','clientId','periodStart','periodEnd','items'])||result.schemaVersion!==1||result.clientId!==params.p_client||result.periodStart!==params.p_start||result.periodEnd!==params.p_end||!Array.isArray(result.items)||result.items.length!==heads.length)fail();
 const fields=['publicationId','publicationRevision','testId','field','side','periodStart','periodEnd','previous','value','unit'];
 const items=result.items.map((item,i)=>{const p=projectProfessionalPublicationPreview(heads[i],{clientId:params.p_client,periodStart:params.p_start,periodEnd:params.p_end,now});if(!p||!shape(item,fields)||fields.some(k=>item[k]!==p[k]))fail();return Object.freeze(Object.fromEntries(fields.map(k=>[k,item[k]])));});
 // The proof is a fresh read, not a persistent authorization to emit a PDF.
 return Object.freeze({schemaVersion:1,clientId:result.clientId,periodStart:result.periodStart,periodEnd:result.periodEnd,items:Object.freeze(items)});
}

// Exact references are retained in the evidence source; the server produces
// the actual report row. The preview must not be silently upgraded to issuance.
const gxReportLabels=Object.freeze({'chair-stand-30s:repetitions':'Levantarse de la silla en 30 s','one-minute-sit-to-stand:repetitions':'Levantarse de la silla en 1 min','one-minute-sit-to-stand:oneMinuteHr':'Frecuencia cardíaca al minuto de recuperación','bodyweight-squat-60s:repetitions':'Sentadillas en 60 s','push-test:repetitions':'Empuje','trx-row:repetitions':'Remo en suspensión','weight-bearing-lunge:bestCm':'Movilidad de tobillo','back-saver:bestCm':'Movilidad de cadena posterior','core-plank:frontPlankSeconds':'Plancha frontal','posterior-chain-endurance:seconds':'Resistencia de cadena posterior','body-composition:weightKg':'Peso corporal','body-composition:waistCm':'Perímetro de cintura','body-composition:bodyFatPercent':'Grasa corporal','body-composition:leanMassKg':'Masa libre de grasa','body-composition:muscleMassKg':'Masa muscular'});
const gxReportUnits=Object.freeze({reps:'rep',bpm:'lpm',percent:'%',kg:'kg',cm:'cm',s:'s'});
const gxReportSides=Object.freeze({left:' · izquierda',right:' · derecha',bilateral:' · bilateral','not-applicable':''});
function gxDecimal(n){if(!Number.isFinite(n)||Math.abs(n)>10000)throw Error('M26_GX_REPORT_EVIDENCE_INVALID');return n.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:20}).replace('.',',');}
function gxReportRow(p){const k=p.testId+':'+p.field;if(!Object.hasOwn(gxReportLabels,k)||!Object.hasOwn(gxReportUnits,p.unit)||!Object.hasOwn(gxReportSides,p.side))throw Error('M26_GX_REPORT_EVIDENCE_INVALID');const u=gxReportUnits[p.unit];return Object.freeze({label:gxReportLabels[k]+gxReportSides[p.side],text:p.periodStart+': '+gxDecimal(p.previous)+' '+u+' · '+p.periodEnd+': '+gxDecimal(p.value)+' '+u+'. Comparación profesional revisada; no acredita por sí sola un logro.',source:'gx-professional:'+p.publicationId+':'+p.publicationRevision,quality:'revisada'});}
export function verifyProfessionalReportEvidence(result,params,heads,options={}){
 const fail=()=>{throw Error('M26_GX_REPORT_EVIDENCE_RESPONSE_INVALID');};
 if(!shape(result,['schemaVersion','clientId','periodStart','periodEnd','items','evidence']))fail();
 const {evidence,...rawProof}=result,proof=verifyProfessionalReportProof(rawProof,params,heads,options);
 if(!Array.isArray(evidence)||evidence.length!==proof.items.length)fail();
 const rows=proof.items.map((p,i)=>{const expected=gxReportRow(p),row=evidence[i];if(!shape(row,['label','text','source','quality'])||Object.keys(expected).some(k=>row[k]!==expected[k]))fail();return expected;});
 return Object.freeze({...proof,evidence:Object.freeze(rows),official:false});
}

// Session-only bridge between the verified professional workspace and the
// existing report editor. Never persist measurement values or references in
// local drafts; only a non-identifying "reselect" marker may survive reload.
const gxSelectionsByRoot=new WeakMap();
export const PROFESSIONAL_REPORT_SELECTION_MARKER='|gx-professional-selection-v1';
export const PROFESSIONAL_REPORT_TYPES=Object.freeze(['post-session','weekly','monthly','quarterly','year-in-iberfit']);
const sameSelectionScope=(a,b)=>Boolean(a?.lease&&b?.lease&&a.lease===b.lease&&a.actorId===b.actorId&&a.clientId===b.clientId);
export function bindProfessionalReportSelection(root,getScope){
 if(!root||typeof getScope!=='function'||gxSelectionsByRoot.has(root))throw Error('M26_GX_REPORT_SELECTION_BIND_INVALID');
 let owner=null,token=null,items=[];
 const clear=()=>{owner=null;token=null;items=[];};
 function current(){const s=getScope();if(!s?.lease||!id(s.actorId)||id(s.actorId)!==s.actorId||!id(s.clientId)||id(s.clientId)!==s.clientId){clear();return null;}if(!sameSelectionScope(owner,s)){clear();owner={actorId:s.actorId,clientId:s.clientId,lease:s.lease};token=Object.freeze({});}return owner;}
 const api=Object.freeze({
  prune(){current();},clear,
  stage(head,receipt,options){
   const s=current();if(!s||s.clientId!==options?.clientId||receipt?.official!==false)return false;
   const {official,...raw}=receipt;
   const verified=verifyProfessionalReportEvidence(raw,professionalReportProofParams([head],options),[head],options);
   if(!sameSelectionScope(s,current()))return false;
   const [proof]=verified.items,[row]=verified.evidence;
   const prior=items.find(x=>x.publicationId===proof.publicationId);
   if(prior){
    if(proof.publicationRevision<prior.publicationRevision)return false;
    if(proof.publicationRevision===prior.publicationRevision){
     if(stableEvidenceJson(prior.row)===stableEvidenceJson(row))return true;
     // Contradictory content at the same revision invalidates the selection.
     clear();return false;
    }
   }
   if(!prior&&items.length>=12)return false;
   // A different revision invalidates any previous editor selection, rather
   // than silently replacing a reviewed row under the same publication ID.
   if(prior)token=Object.freeze({});
   items=[...items.filter(x=>x.publicationId!==proof.publicationId),Object.freeze({publicationId:proof.publicationId,publicationRevision:proof.publicationRevision,periodStart:proof.periodStart,periodEnd:proof.periodEnd,testId:proof.testId,field:proof.field,side:proof.side,row})];
   return true;
  },
  snapshot(clientId){const s=current();return s&&s.clientId===clientId?Object.freeze({clientId:s.clientId,token,items:Object.freeze([...items])}):null;},
  destroy(){clear();if(gxSelectionsByRoot.get(root)===api)gxSelectionsByRoot.delete(root);},
 });
 gxSelectionsByRoot.set(root,api);return api;
}
export function professionalReportSelectionSnapshot(root,clientId){return gxSelectionsByRoot.get(root)?.snapshot(clientId)??null;}
export function clearProfessionalReportSelection(root){gxSelectionsByRoot.get(root)?.clear();}
// Read-only review for the seventh format, scoped to this live session.
// Repeated metrics require deliberate selection before formal issuance.
export function professionalReassessmentSelectionPreview(root,clientId){
 const snapshot=professionalReportSelectionSnapshot(root,clientId);
 if(!snapshot?.items.length)return null;
 const counts=new Map();
 for(const item of snapshot.items){
  const key=JSON.stringify([item.testId,item.field,item.side]);
  counts.set(key,(counts.get(key)??0)+1);
 }
 const ambiguousMetrics=[...counts.values()].filter(n=>n>1).length;
 const rows=snapshot.items.map(item=>item.row);
 return Object.freeze({official:false,ready:false,rows:Object.freeze(rows),comparisonCount:rows.length,ambiguousMetrics});
}
export function professionalReportSelectionRows(candidate,snapshot,sources){
 if(!candidate?.ready||!PROFESSIONAL_REPORT_TYPES.includes(candidate.id)||!Array.isArray(candidate.evidence)||candidate.evidence.length<1||candidate.evidence.length>12||candidate.evidence.some(x=>String(x?.source??'').toLowerCase().startsWith('gx-professional:'))||!snapshot?.token||!Array.isArray(snapshot.items)||!Array.isArray(sources)||!sources.length||new Set(sources).size!==sources.length||candidate.evidence.length+sources.length>12)throw Error('M26_GX_REPORT_SELECTION_INVALID');
 const extra=sources.map(source=>{const entry=snapshot.items.find(x=>x.row.source===source);if(!entry||entry.periodEnd<candidate.periodStart||entry.periodEnd>candidate.periodEnd)throw Error('M26_GX_REPORT_SELECTION_STALE');return entry.row;});
 if(new Set(extra.map(r=>r.source.split(':')[1])).size!==extra.length)throw Error('M26_GX_REPORT_SELECTION_INVALID');
 return Object.freeze({...candidate,evidence:Object.freeze([...candidate.evidence,...extra])});
}
// Capture only an ephemeral capability for the selected canonical rows. After
// any await, a new session/actor/client or cleared selection must stop writes.
function professionalReportApprovalError(){const e=Error('M26_REPORT_DRAFT_INVALID:professional-selection-stale');e.userMessage='La sesión o las evidencias profesionales han cambiado. Conserva el borrador y vuelve a revisar la selección antes de aprobar.';return e;}
export function captureProfessionalReportApproval(root,clientId,evidence){
 const snapshot=professionalReportSelectionSnapshot(root,clientId);
 const rows=Array.isArray(evidence)?evidence.filter(row=>typeof row?.source==='string'&&row.source.startsWith('gx-professional:')):[];
 if(!snapshot?.token||!rows.length||new Set(rows.map(row=>row.source)).size!==rows.length||rows.some(row=>!snapshot.items.some(item=>item.row.source===row.source&&stableEvidenceJson(item.row)===stableEvidenceJson(row))))throw professionalReportApprovalError();
 return Object.freeze({clientId,token:snapshot.token,sources:Object.freeze(rows.map(row=>row.source))});
}
export function isProfessionalReportApprovalLive(root,fence){
 if(!fence)return true;
 const snapshot=professionalReportSelectionSnapshot(root,fence.clientId);
 return Boolean(snapshot?.token&&snapshot.token===fence.token&&fence.sources.every(source=>snapshot.items.some(item=>item.row.source===source)));
}
export function requireProfessionalReportApprovalLive(root,fence){if(!isProfessionalReportApprovalLive(root,fence))throw professionalReportApprovalError();}
