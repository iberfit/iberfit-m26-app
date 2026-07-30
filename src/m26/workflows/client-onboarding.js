import {normalizeClientModality} from '../domain/modality.js';

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(value,max=500){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function list(value,max=20){return String(value??'').split(/[,;\n]/).map((item)=>clean(item,120)).filter(Boolean).slice(0,max);}
function integer(value,{min=0,max=1000}={}){const number=Number(value);return Number.isInteger(number)&&number>=min&&number<=max?number:null;}
function modalityLabel(value){const normalized=normalizeClientModality(value);return normalized==='presencial'?'Presencial':normalized==='hibrido'?'Híbrido':normalized==='online'?'Online':null;}

function recordBody(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;}
export function createdClientResultId(value){const item=Array.isArray(value)?value[0]:value;const nested=item?.data||item?.result||item?.client||item;return clean(nested?.clientId??nested?.client_id??nested?.id??nested?.cliente_id,200);}
export function clientDraftEmail(record){const body=recordBody(record);return clean(record?.email??body?.email??record?.profile?.email??body?.profile?.email,254).toLowerCase();}
export function findCreatedClientInSnapshot(snapshot,{id='',email=''}={}){
  const clients=Array.isArray(snapshot?.data?.clients)?snapshot.data.clients:Array.isArray(snapshot?.clients)?snapshot.clients:[];
  const expectedId=clean(id,200);const expectedEmail=clean(email,254).toLowerCase();
  return clients.find((item)=>expectedId&&String(item?.id||'')===expectedId)||clients.find((item)=>expectedEmail&&clientDraftEmail(item)===expectedEmail)||null;
}
export async function waitForCreatedClient({result,payload,fetchSnapshot,waitFn=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms)),delays=[0,250,500,1000,1800,3000]}={}){
  if(typeof fetchSnapshot!=='function')throw new Error('M26_CLIENT_CREATE_VERIFY_UNAVAILABLE');
  const id=createdClientResultId(result);if(!id)throw new Error('M26_CLIENT_CREATE_INVALID_RESPONSE');
  for(const delay of delays){if(delay>0)await waitFn(delay);const snapshot=await fetchSnapshot();const client=findCreatedClientInSnapshot(snapshot,{id,email:payload?.email});if(client)return Object.freeze({client,snapshot,result});}
  throw new Error('M26_CLIENT_CREATE_NOT_PERSISTED');
}

export function normalizeClientOnboardingDraft(input={}){
  const modality=modalityLabel(input.modality);
  const weeklyFrequency=integer(input.weeklyFrequency,{min:1,max:14});
  const sessionDurationMinutes=integer(input.sessionDurationMinutes,{min:20,max:240});
  return Object.freeze({
    name:clean(input.name,160),
    email:clean(input.email,254).toLowerCase(),
    phone:clean(input.phone,40),
    birthDate:clean(input.birthDate,10),
    sexForNorms:clean(input.sexForNorms,20),
    genderIdentity:clean(input.genderIdentity,120),
    pronouns:clean(input.pronouns,80),
    modality,
    frequency:weeklyFrequency?`${weeklyFrequency} sesiones por semana`:clean(input.frequency,100),
    weeklyFrequency,
    sessionDurationMinutes,
    objective:clean(input.primaryObjective??input.objective,500),
    primaryObjective:clean(input.primaryObjective??input.objective,500),
    secondaryObjectives:list(input.secondaryObjectives),
    zone:clean(input.commune??input.zone,120),
    commune:clean(input.commune??input.zone,120),
    address:clean(input.trainingAddress??input.address,300),
    trainingAddress:clean(input.trainingAddress??input.address,300),
    locationType:clean(input.locationType,80),
    accessInstructions:clean(input.accessInstructions,500),
    preferredSchedule:clean(input.preferredSchedule,240),
    preferredContactChannel:clean(input.preferredContactChannel,80),
    preferredContactTime:clean(input.preferredContactTime,120),
    timezone:clean(input.timezone,80)||'America/Santiago',
    level:clean(input.experienceLevel??input.level,100),
    phase:clean(input.phase,100)||'Evaluación inicial',
    restrictions:clean(input.restrictions,1000),
    pain:clean(input.pain,1000),
    history:clean(input.trainingHistory??input.history,1500),
    currentTraining:clean(input.currentTraining,1000),
    equipment:clean(input.equipment,1200),
    equipmentList:list(input.equipment),
    preferences:clean(input.preferences,1200),
    primaryLimiter:clean(input.primaryLimiter,500),
    currentRecommendation:clean(input.currentRecommendation,1000),
    pending:clean(input.pending,1000),
    emergencyContactName:clean(input.emergencyContactName,160),
    emergencyContactRelation:clean(input.emergencyContactRelation,120),
    emergencyContactPhone:clean(input.emergencyContactPhone,40),
  });
}

export function validateClientOnboardingDraft(input={}){
  const value=normalizeClientOnboardingDraft(input);const errors=[];
  if(value.name.length<3)errors.push('name');
  if(!EMAIL.test(value.email))errors.push('email');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate))errors.push('birthDate');
  if(!['female','male'].includes(value.sexForNorms))errors.push('sexForNorms');
  if(!value.modality)errors.push('modality');
  if(!value.weeklyFrequency)errors.push('weeklyFrequency');
  if(!value.sessionDurationMinutes)errors.push('sessionDurationMinutes');
  if(value.primaryObjective.length<10)errors.push('primaryObjective');
  if(['Presencial','Híbrido'].includes(value.modality)&&!value.trainingAddress)errors.push('trainingAddress');
  return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});
}

export function legacyClientDraftPayload(input={}){
  const check=validateClientOnboardingDraft(input);if(!check.ok)throw new Error(`M26_CLIENT_ONBOARDING_INVALID:${check.errors.join(',')}`);
  const value=check.value;
  return Object.freeze({
    name:value.name,email:value.email,phone:value.phone,modality:value.modality,
    frequency:value.frequency,objective:value.primaryObjective,zone:value.commune,address:value.trainingAddress,
    level:value.level,phase:value.phase,restrictions:value.restrictions,pain:value.pain,history:value.history,
    equipment:value.equipment,preferences:value.preferences,primaryLimiter:value.primaryLimiter,
    currentRecommendation:value.currentRecommendation,pending:value.pending,
    profile:{
      birthDate:value.birthDate,sexForNorms:value.sexForNorms,genderIdentity:value.genderIdentity,pronouns:value.pronouns,
      email:value.email,phone:value.phone,preferredContactChannel:value.preferredContactChannel,
      preferredContactTime:value.preferredContactTime,timezone:value.timezone,modality:normalizeClientModality(value.modality),
      trainingAddress:value.trainingAddress,commune:value.commune,locationType:value.locationType,
      accessInstructions:value.accessInstructions,preferredSchedule:value.preferredSchedule,
      sessionDurationMinutes:value.sessionDurationMinutes,weeklyFrequency:value.weeklyFrequency,
      equipmentAvailable:value.equipmentList,equipment:value.equipmentList,primaryObjective:value.primaryObjective,
      secondaryObjectives:value.secondaryObjectives,emergencyContactName:value.emergencyContactName,
      emergencyContactRelation:value.emergencyContactRelation,emergencyContactPhone:value.emergencyContactPhone,
      experienceLevel:value.level,trainingHistory:value.history,currentTraining:value.currentTraining,
      restrictions:value.restrictions,pain:value.pain,preferences:value.preferences,
    },
    accessEnabled:false,inviteClient:false,onboardingVersion:'m26-rc33',
  });
}

export const __clientOnboardingInternals=Object.freeze({clean,list,integer,modalityLabel});
