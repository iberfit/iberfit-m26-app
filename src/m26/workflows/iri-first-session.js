import {buildIriProtocolRecords,flattenIriProtocolRecords} from './iri-protocol-catalog.js';
const SCHEMA='iberfit-iri-first-session-v1';
export const IRI_FIRST_SESSION_STEPS=Object.freeze(['perfil','entrevista','composicion','movilidad','fuerza','cardio','revision']);

function text(value,max=1200){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function num(value,{min=-Infinity,max=Infinity}={}){if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;}
function bool(value){return value===true||value==='true'||value==='1'||value==='on'||value===1;}
function list(value,max=30){return String(value??'').split(/[,;\n]/).map((item)=>text(item,180)).filter(Boolean).slice(0,max);}
function values(raw,prefix,count,{min=0,max=1000}={}){return Array.from({length:count},(_,index)=>num(raw[`${prefix}${index+1}`],{min,max})).filter((item)=>item!==null);}
function best(items){return items.length?Math.max(...items):null;}
function average(items){return items.length?Math.round((items.reduce((sum,value)=>sum+value,0)/items.length)*10)/10:null;}
function difference(a,b){return a===null||b===null?null:Math.round(Math.abs(a-b)*10)/10;}
function requiredReason(skipped,reason){return skipped?text(reason,500):'';}
function assessmentBody(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;}
function field(source,...keys){for(const key of keys){const value=source?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function sourceValue(raw,current,key,...aliases){const body=assessmentBody(current);return raw[key]??field(body,key,...aliases)??'';}

export function normalizeFirstSessionDraft(raw={},current={},clientId=''){
  const body=assessmentBody(current);
  const ankleLeftTrials=values(raw,'ankleLeft',3,{min:0,max:30});
  const ankleRightTrials=values(raw,'ankleRight',3,{min:0,max:30});
  const posteriorLeftTrials=values(raw,'posteriorLeft',3,{min:-50,max:80});
  const posteriorRightTrials=values(raw,'posteriorRight',3,{min:-50,max:80});
  const ankleLeftBest=best(ankleLeftTrials),ankleRightBest=best(ankleRightTrials);
  const posteriorLeftBest=best(posteriorLeftTrials),posteriorRightBest=best(posteriorRightTrials);
  const assessmentDate=text(sourceValue(raw,body,'assessmentDate','assessment_date'),10);
  const personProfile={
    birthDate:text(sourceValue(raw,body,'birthDate','birth_date'),10),
    sexForNorms:text(sourceValue(raw,body,'sexForNorms','sex_for_norms'),20),
    genderIdentity:text(sourceValue(raw,body,'genderIdentity','gender_identity'),120),
    pronouns:text(sourceValue(raw,body,'pronouns'),80),
    email:text(sourceValue(raw,body,'email'),254).toLowerCase(),
    phone:text(sourceValue(raw,body,'phone'),40),
    preferredContactChannel:text(sourceValue(raw,body,'preferredContactChannel','preferred_contact_channel'),80),
    preferredContactTime:text(sourceValue(raw,body,'preferredContactTime','preferred_contact_time'),120),
    timezone:text(sourceValue(raw,body,'timezone'),80)||'America/Santiago',
    modality:text(sourceValue(raw,body,'modality'),30),
    trainingAddress:text(sourceValue(raw,body,'trainingAddress','training_address'),300),
    commune:text(sourceValue(raw,body,'commune'),120),
    locationType:text(sourceValue(raw,body,'locationType','location_type'),80),
    accessInstructions:text(sourceValue(raw,body,'accessInstructions','access_instructions'),500),
    preferredSchedule:text(sourceValue(raw,body,'preferredSchedule','preferred_schedule'),240),
    weeklyFrequency:num(sourceValue(raw,body,'weeklyFrequency','weekly_frequency'),{min:1,max:14}),
    sessionDurationMinutes:num(sourceValue(raw,body,'sessionDurationMinutes','session_duration_minutes'),{min:20,max:240}),
    equipment:list(sourceValue(raw,body,'equipment')),
    primaryObjective:text(sourceValue(raw,body,'primaryObjective','primary_objective','objective'),600),
    secondaryObjectives:list(sourceValue(raw,body,'secondaryObjectives','secondary_objectives')),
    emergencyContactName:text(sourceValue(raw,body,'emergencyContactName','emergency_contact_name'),160),
    emergencyContactRelation:text(sourceValue(raw,body,'emergencyContactRelation','emergency_contact_relation'),120),
    emergencyContactPhone:text(sourceValue(raw,body,'emergencyContactPhone','emergency_contact_phone'),40),
  };
  const interview={
    trainingExperience:text(sourceValue(raw,body,'trainingExperience'),120),
    trainingHistory:text(sourceValue(raw,body,'trainingHistory'),1500),
    currentTraining:text(sourceValue(raw,body,'currentTraining'),1000),
    availability:text(sourceValue(raw,body,'availability'),500),
    preferences:text(sourceValue(raw,body,'preferences'),1200),
    healthHistory:text(sourceValue(raw,body,'healthHistory'),1500),
    restrictions:text(sourceValue(raw,body,'restrictions'),1200),
    currentPain:text(sourceValue(raw,body,'currentPain'),1000),
    sleepScore:num(sourceValue(raw,body,'sleepScore'),{min:0,max:10}),
    stressScore:num(sourceValue(raw,body,'stressScore'),{min:0,max:10}),
    energyScore:num(sourceValue(raw,body,'energyScore'),{min:0,max:10}),
    screeningAccepted:bool(raw.screeningAccepted??body?.interview?.screeningAccepted),
    screeningNotes:text(sourceValue(raw,body,'screeningNotes'),1000),
  };
  const bodyComposition={
    skipped:bool(raw.bodyCompositionSkipped),
    skipReason:requiredReason(bool(raw.bodyCompositionSkipped),raw.bodyCompositionSkipReason),
    weightKg:num(sourceValue(raw,body,'weightKg'),{min:20,max:350}),
    heightCm:num(sourceValue(raw,body,'heightCm'),{min:100,max:230}),
    bodyFatPercent:num(sourceValue(raw,body,'bodyFatPercent'),{min:1,max:80}),
    leanMassKg:num(sourceValue(raw,body,'leanMassKg'),{min:1,max:250}),
    muscleMassKg:num(sourceValue(raw,body,'muscleMassKg'),{min:1,max:250}),
    bodyWaterPercent:num(sourceValue(raw,body,'bodyWaterPercent'),{min:10,max:80}),
    waistCm:num(sourceValue(raw,body,'waistCm'),{min:30,max:250}),
    visceralFatLevel:num(sourceValue(raw,body,'visceralFatLevel'),{min:0,max:100}),
    method:text(sourceValue(raw,body,'bodyCompositionMethod'),160),
    device:text(sourceValue(raw,body,'bodyCompositionDevice'),160),
    measurementConditions:text(sourceValue(raw,body,'measurementConditions'),800),
    attachmentName:text(sourceValue(raw,body,'bodyCompositionAttachmentName'),240),
    attachmentType:text(sourceValue(raw,body,'bodyCompositionAttachmentType'),120),
    attachmentSize:num(sourceValue(raw,body,'bodyCompositionAttachmentSize'),{min:0,max:50_000_000}),
    notes:text(sourceValue(raw,body,'bodyCompositionNotes'),1000),
  };
  if(bodyComposition.weightKg&&bodyComposition.heightCm)bodyComposition.bmi=Math.round((bodyComposition.weightKg/((bodyComposition.heightCm/100)**2))*10)/10;
  const mobility={
    skipped:bool(raw.mobilitySkipped),skipReason:requiredReason(bool(raw.mobilitySkipped),raw.mobilitySkipReason),
    ankle:{leftTrials:ankleLeftTrials,rightTrials:ankleRightTrials,leftBest:ankleLeftBest,rightBest:ankleRightBest,asymmetryCm:difference(ankleLeftBest,ankleRightBest),pain:text(raw.anklePain,300),compensation:text(raw.ankleCompensation,500)},
    posteriorChain:{leftTrials:posteriorLeftTrials,rightTrials:posteriorRightTrials,leftBest:posteriorLeftBest,rightBest:posteriorRightBest,asymmetryCm:difference(posteriorLeftBest,posteriorRightBest),pain:text(raw.posteriorPain,300)},
    modifiedThomas:{left:text(raw.thomasLeft,80),right:text(raw.thomasRight,80),pelvicControl:text(raw.thomasPelvicControl,160),pain:text(raw.thomasPain,300)},
    hipRotation:{result:text(raw.hipRotationResult,120),pain:text(raw.hipRotationPain,300),compensation:text(raw.hipRotationCompensation,500)},
    assistedSquat:{depth:text(raw.squatDepth,100),heels:text(raw.squatHeels,100),knees:text(raw.squatKnees,100),trunk:text(raw.squatTrunk,100),lateralShift:text(raw.squatShift,100),assistanceResponse:text(raw.squatAssistanceResponse,160),pain:text(raw.squatPain,300)},
    notes:text(raw.mobilityNotes,1200),
  };
  const strength={
    skipped:bool(raw.strengthSkipped),skipReason:requiredReason(bool(raw.strengthSkipped),raw.strengthSkipReason),
    chairStand:{repetitions:num(sourceValue(raw,body,'chairStand30s','chair_stand_30s'),{min:0,max:100}),chairHeightCm:num(raw.chairHeightCm,{min:30,max:70}),valid:bool(raw.chairStandValid),notes:text(raw.chairStandNotes,500)},
    push:{variant:text(raw.pushVariant,40),repetitions:num(sourceValue(raw,body,'pushUps','push_ups'),{min:0,max:200}),supportHeightCm:num(raw.pushSupportHeightCm,{min:0,max:180}),valid:bool(raw.pushValid),notes:text(raw.pushNotes,500)},
    trxRow:{repetitions:num(raw.trxRowRepetitions,{min:0,max:200}),handleHeightCm:num(raw.trxHandleHeightCm,{min:0,max:250}),heelDistanceCm:num(raw.trxHeelDistanceCm,{min:0,max:300}),position:text(raw.trxPosition,100),valid:bool(raw.trxValid),notes:text(raw.trxNotes,500)},
    core:{frontPlankSeconds:num(raw.frontPlankSeconds,{min:0,max:1800}),sidePlankLeftSeconds:num(raw.sidePlankLeftSeconds,{min:0,max:1800}),sidePlankRightSeconds:num(raw.sidePlankRightSeconds,{min:0,max:1800}),quality:text(raw.coreQuality,120),pain:text(raw.corePain,300)},
    posteriorChain:{protocol:text(raw.posteriorChainProtocol,80),seconds:num(raw.posteriorChainSeconds,{min:0,max:1800}),equipmentCompatible:bool(raw.posteriorEquipmentCompatible),notPerformedReason:text(raw.posteriorNotPerformedReason,500),pain:text(raw.posteriorChainPain,300)},
    notes:text(raw.strengthNotes,1200),
  };
  const finalHr=num(sourceValue(raw,body,'stepFinalHr','step_final_hr'),{min:30,max:240});
  const oneMinuteHr=num(sourceValue(raw,body,'stepOneMinuteHr','step_one_minute_hr'),{min:30,max:240});
  const cardio={
    skipped:bool(raw.cardioSkipped),skipReason:requiredReason(bool(raw.cardioSkipped),raw.cardioSkipReason),
    protocol:text(raw.cardioProtocol||body?.cardio?.protocol||'ymca-3min-standard',80),
    stepHeightCm:num(raw.stepHeightCm??body?.cardio?.stepHeightCm,{min:10,max:50}),
    cadenceBpm:num(raw.cadenceBpm??body?.cardio?.cadenceBpm,{min:40,max:160}),
    durationSeconds:num(raw.cardioDurationSeconds??body?.cardio?.durationSeconds,{min:30,max:300}),
    restingHr:num(raw.restingHr,{min:30,max:220}),finalHr,oneMinuteHr,
    twoMinuteHr:num(raw.twoMinuteHr,{min:30,max:220}),rpe:num(raw.cardioRpe,{min:0,max:10}),
    valid:bool(raw.cardioValid),symptoms:text(raw.cardioSymptoms,600),stopReason:text(raw.cardioStopReason,600),notes:text(raw.cardioNotes,1000),
  };
  cardio.deltaOneMinute=finalHr!==null&&oneMinuteHr!==null?finalHr-oneMinuteHr:null;
  const diagnosis={
    strengths:list(raw.diagnosisStrengths,6),priorities:list(raw.diagnosisPriorities,6),
    coachInterpretation:text(raw.coachInterpretation,2200),trainingImplications:text(raw.trainingImplications,2200),
    initialPlan:text(raw.initialPlan,2200),recommendedFrequency:text(raw.recommendedFrequency,200),
    reevaluationDate:text(raw.reevaluationDate,10),reviewAccepted:bool(raw.reviewAccepted),
  };
  const protocolRecords=buildIriProtocolRecords({raw,existingRecords:body.protocolRecords||body.protocol_records||[],assessmentDate,bodyComposition,mobility,strength,cardio});
  return Object.freeze({schema:SCHEMA,clientId:text(clientId||body.clientId||body.client_id,200),assessmentId:text(current?.id||body.id,200),assessmentDate,personProfile:Object.freeze(personProfile),interview:Object.freeze(interview),bodyComposition:Object.freeze(bodyComposition),mobility:Object.freeze(mobility),strength:Object.freeze(strength),cardio:Object.freeze(cardio),diagnosis:Object.freeze(diagnosis),protocolRecords,updatedAt:new Date().toISOString()});
}

function hasBodyMeasurement(value){return [value.weightKg,value.bodyFatPercent,value.leanMassKg,value.muscleMassKg,value.waistCm].some((item)=>item!==null);}
function stepErrors(draft,step){const errors=[];const profile=draft.personProfile;
  if(step==='perfil'){
    if(!draft.assessmentDate)errors.push('assessmentDate');if(!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate))errors.push('birthDate');if(!['female','male'].includes(profile.sexForNorms))errors.push('sexForNorms');if(!profile.email.includes('@'))errors.push('email');if(!profile.phone)errors.push('phone');if(!profile.modality)errors.push('modality');if(['presencial','hibrido'].includes(profile.modality)&&!profile.trainingAddress)errors.push('trainingAddress');if(!profile.primaryObjective)errors.push('primaryObjective');
  }
  if(step==='entrevista'){if(!draft.interview.screeningAccepted)errors.push('screeningAccepted');if(!draft.interview.trainingExperience)errors.push('trainingExperience');if(!draft.interview.availability)errors.push('availability');}
  if(step==='composicion'){if(draft.bodyComposition.skipped){if(!draft.bodyComposition.skipReason)errors.push('bodyCompositionSkipReason');}else if(!hasBodyMeasurement(draft.bodyComposition))errors.push('bodyCompositionMeasurement');}
  if(step==='movilidad'){if(draft.mobility.skipped){if(!draft.mobility.skipReason)errors.push('mobilitySkipReason');}else{if(draft.mobility.ankle.leftBest===null||draft.mobility.ankle.rightBest===null)errors.push('ankleTrials');if(draft.mobility.posteriorChain.leftBest===null||draft.mobility.posteriorChain.rightBest===null)errors.push('posteriorTrials');if(!draft.mobility.hipRotation.result)errors.push('hipRotationResult');if(!draft.mobility.assistedSquat.depth)errors.push('squatDepth');}}
  if(step==='fuerza'){if(draft.strength.skipped){if(!draft.strength.skipReason)errors.push('strengthSkipReason');}else{if(draft.strength.chairStand.repetitions===null||!draft.strength.chairStand.valid)errors.push('chairStand30s');if(!draft.strength.push.variant||draft.strength.push.repetitions===null||!draft.strength.push.valid)errors.push('pushTest');if(draft.strength.trxRow.repetitions===null||!draft.strength.trxRow.valid)errors.push('trxRow');if(draft.strength.core.frontPlankSeconds===null)errors.push('frontPlank');}}
  if(step==='cardio'){if(draft.cardio.skipped){if(!draft.cardio.skipReason)errors.push('cardioSkipReason');}else{if(!draft.cardio.valid)errors.push('cardioValid');if(draft.cardio.finalHr===null||draft.cardio.oneMinuteHr===null||draft.cardio.deltaOneMinute<0)errors.push('cardioHeartRate');if(draft.cardio.durationSeconds===null||draft.cardio.durationSeconds>180)errors.push('cardioDuration');}}
  if(step==='revision'){if(draft.diagnosis.strengths.length<1)errors.push('diagnosisStrengths');if(draft.diagnosis.priorities.length<1)errors.push('diagnosisPriorities');if(draft.diagnosis.coachInterpretation.length<20)errors.push('coachInterpretation');if(draft.diagnosis.initialPlan.length<20)errors.push('initialPlan');if(!draft.diagnosis.reviewAccepted)errors.push('reviewAccepted');}
  return errors;
}
export function validateFirstSessionStep(draft,step){const errors=stepErrors(draft,step);return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors)});}
export function validateFirstSessionDraft(draft){const byStep=Object.fromEntries(IRI_FIRST_SESSION_STEPS.map((step)=>[step,stepErrors(draft,step)]));const errors=Object.values(byStep).flat();return Object.freeze({ok:errors.length===0,errors:Object.freeze([...new Set(errors)]),byStep:Object.freeze(byStep),completion:Object.freeze(firstSessionCompletion(draft))});}
export function firstSessionCompletion(draft){const steps=IRI_FIRST_SESSION_STEPS.map((step)=>({step,complete:stepErrors(draft,step).length===0}));const complete=steps.filter((item)=>item.complete).length;return {complete,total:steps.length,percent:Math.round((complete/steps.length)*100),steps};}

export function buildIriCommandDraftFromFirstSession(draft,current={}){
  const check=validateFirstSessionDraft(draft);if(!check.ok)throw new Error(`M26_IRI_FIRST_SESSION_INVALID:${check.errors.join(',')}`);
  if(!current?.id)throw new Error('M26_IRI_REMOTE_ENTITY_REQUIRED');
  if(draft.bodyComposition.skipped||draft.strength.skipped||draft.cardio.skipped)throw new Error('M26_IRI_CORE_DOMAINS_REQUIRED');
  const standardPush=draft.strength.push.variant==='standard'&&draft.strength.push.valid;
  const weightBearingLunge=average([draft.mobility.ankle.leftBest,draft.mobility.ankle.rightBest].filter((value)=>value!==null));
  return {
    ...assessmentBody(current),id:current.id,clientId:draft.clientId,assessmentDate:draft.assessmentDate,
    birthDate:draft.personProfile.birthDate,sexForNorms:draft.personProfile.sexForNorms,
    stepFinalHr:draft.cardio.finalHr,stepOneMinuteHr:draft.cardio.oneMinuteHr,
    ...(standardPush?{pushUps:draft.strength.push.repetitions}:{}),
    chairStand30s:draft.strength.chairStand.repetitions,
    ...(weightBearingLunge!==null?{weightBearingLunge}:{}),
    bodyComposition:{...draft.bodyComposition},
    strengthPatterns:{chairStand:draft.strength.chairStand,push:draft.strength.push,trxRow:draft.strength.trxRow,core:draft.strength.core,posteriorChain:draft.strength.posteriorChain},
    personProfile:{...draft.personProfile},interview:{...draft.interview},mobility:{...draft.mobility},strengthAssessment:{...draft.strength},cardio:{...draft.cardio},diagnosis:{...draft.diagnosis},
    protocolRecords:(draft.protocolRecords||[]).map((record)=>({...record,result:{...(record.result||{})}})),
    firstSessionSchema:SCHEMA,firstSessionCompletedAt:new Date().toISOString(),
  };
}

export function flattenFirstSessionDraft(draft={}){
  const p=draft.personProfile||{},i=draft.interview||{},b=draft.bodyComposition||{},m=draft.mobility||{},s=draft.strength||{},c=draft.cardio||{},d=draft.diagnosis||{};
  const out={assessmentDate:draft.assessmentDate||'',...p,secondaryObjectives:(p.secondaryObjectives||[]).join(', '),equipment:(p.equipment||[]).join(', '),...i,
    bodyCompositionSkipped:b.skipped,bodyCompositionSkipReason:b.skipReason||'',weightKg:b.weightKg??'',heightCm:b.heightCm??'',bodyFatPercent:b.bodyFatPercent??'',leanMassKg:b.leanMassKg??'',muscleMassKg:b.muscleMassKg??'',bodyWaterPercent:b.bodyWaterPercent??'',waistCm:b.waistCm??'',visceralFatLevel:b.visceralFatLevel??'',bodyCompositionMethod:b.method||'',bodyCompositionDevice:b.device||'',measurementConditions:b.measurementConditions||'',bodyCompositionAttachmentName:b.attachmentName||'',bodyCompositionAttachmentType:b.attachmentType||'',bodyCompositionAttachmentSize:b.attachmentSize??'',bodyCompositionNotes:b.notes||'',
    mobilitySkipped:m.skipped,mobilitySkipReason:m.skipReason||'',anklePain:m.ankle?.pain||'',ankleCompensation:m.ankle?.compensation||'',posteriorPain:m.posteriorChain?.pain||'',thomasLeft:m.modifiedThomas?.left||'',thomasRight:m.modifiedThomas?.right||'',thomasPelvicControl:m.modifiedThomas?.pelvicControl||'',thomasPain:m.modifiedThomas?.pain||'',hipRotationResult:m.hipRotation?.result||'',hipRotationPain:m.hipRotation?.pain||'',hipRotationCompensation:m.hipRotation?.compensation||'',squatDepth:m.assistedSquat?.depth||'',squatHeels:m.assistedSquat?.heels||'',squatKnees:m.assistedSquat?.knees||'',squatTrunk:m.assistedSquat?.trunk||'',squatShift:m.assistedSquat?.lateralShift||'',squatAssistanceResponse:m.assistedSquat?.assistanceResponse||'',squatPain:m.assistedSquat?.pain||'',mobilityNotes:m.notes||'',
    strengthSkipped:s.skipped,strengthSkipReason:s.skipReason||'',chairStand30s:s.chairStand?.repetitions??'',chairHeightCm:s.chairStand?.chairHeightCm??'',chairStandValid:s.chairStand?.valid,pushVariant:s.push?.variant||'',pushUps:s.push?.repetitions??'',pushSupportHeightCm:s.push?.supportHeightCm??'',pushValid:s.push?.valid,trxRowRepetitions:s.trxRow?.repetitions??'',trxHandleHeightCm:s.trxRow?.handleHeightCm??'',trxHeelDistanceCm:s.trxRow?.heelDistanceCm??'',trxPosition:s.trxRow?.position||'',trxValid:s.trxRow?.valid,frontPlankSeconds:s.core?.frontPlankSeconds??'',sidePlankLeftSeconds:s.core?.sidePlankLeftSeconds??'',sidePlankRightSeconds:s.core?.sidePlankRightSeconds??'',coreQuality:s.core?.quality||'',corePain:s.core?.pain||'',posteriorChainProtocol:s.posteriorChain?.protocol||'',posteriorChainSeconds:s.posteriorChain?.seconds??'',posteriorEquipmentCompatible:s.posteriorChain?.equipmentCompatible,posteriorNotPerformedReason:s.posteriorChain?.notPerformedReason||'',posteriorChainPain:s.posteriorChain?.pain||'',strengthNotes:s.notes||'',
    cardioSkipped:c.skipped,cardioSkipReason:c.skipReason||'',cardioProtocol:c.protocol||'',stepHeightCm:c.stepHeightCm??'',cadenceBpm:c.cadenceBpm??'',cardioDurationSeconds:c.durationSeconds??'',restingHr:c.restingHr??'',stepFinalHr:c.finalHr??'',stepOneMinuteHr:c.oneMinuteHr??'',twoMinuteHr:c.twoMinuteHr??'',cardioRpe:c.rpe??'',cardioValid:c.valid,cardioSymptoms:c.symptoms||'',cardioStopReason:c.stopReason||'',cardioNotes:c.notes||'',
    diagnosisStrengths:(d.strengths||[]).join('\n'),diagnosisPriorities:(d.priorities||[]).join('\n'),coachInterpretation:d.coachInterpretation||'',trainingImplications:d.trainingImplications||'',initialPlan:d.initialPlan||'',recommendedFrequency:d.recommendedFrequency||'',reevaluationDate:d.reevaluationDate||'',reviewAccepted:d.reviewAccepted};
  Object.assign(out,flattenIriProtocolRecords(draft.protocolRecords||[]));
  for(const [prefix,trials] of [['ankleLeft',m.ankle?.leftTrials],['ankleRight',m.ankle?.rightTrials],['posteriorLeft',m.posteriorChain?.leftTrials],['posteriorRight',m.posteriorChain?.rightTrials]])(trials||[]).slice(0,3).forEach((value,index)=>{out[`${prefix}${index+1}`]=value;});
  return out;
}

export const __iriFirstSessionInternals=Object.freeze({SCHEMA,text,num,bool,list,values,best,average,difference,stepErrors,hasBodyMeasurement});
