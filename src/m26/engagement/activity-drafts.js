import { createBrowserKeyValueStore,createMemoryKeyValueStore } from '../platform/key-value-store.js';
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SAFE_SCOPE_PATTERN=/^[a-z0-9][a-z0-9._-]{0,79}$/i;
function clone(value){return value==null?value:structuredClone(value);}
function number(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function score(value){const n=number(value);return n!==null&&n>=0&&n<=10?n:null;}
function bool(value){return value===true||value==='true'||value==='1'||value==='on'||value===1;}
function iso(value){const ms=new Date(value||new Date()).getTime();return Number.isFinite(ms)?new Date(ms).toISOString():null;}
function safeId(value,code){const id=String(value||'').trim();if(!SAFE_ID_PATTERN.test(id))throw new Error(code);return id;}
function safeScope(value){const scope=String(value||'').trim();if(!SAFE_SCOPE_PATTERN.test(scope))throw new Error('M26_ENGAGEMENT_DRAFT_SCOPE_REQUIRED');return scope;}
export function normalizeCheckinDraft(input={}){return Object.freeze({energy:score(input.energy),sleep:score(input.sleep),stress:score(input.stress),pain:score(input.pain),notes:String(input.notes||'').trim().slice(0,1000),recordedAt:iso(input.recordedAt)});}
export function validateCheckinDraft(input={}){const value=normalizeCheckinDraft(input);const errors=[];for(const key of ['energy','sleep','stress','pain'])if(value[key]===null)errors.push(`${key.toUpperCase()}_REQUIRED`);if(!value.recordedAt)errors.push('RECORDED_AT_INVALID');return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});}
export function normalizeHabitDefinitionDraft(input={}){return Object.freeze({title:String(input.title||'').trim().slice(0,120),description:String(input.description||'').trim().slice(0,500),target:number(input.target),unit:String(input.unit||'veces').trim().slice(0,40),frequency:String(input.frequency||'diario').trim().slice(0,40)});}
export function validateHabitDefinitionDraft(input={}){const value=normalizeHabitDefinitionDraft(input);const errors=[];if(value.title.length<2)errors.push('TITLE_REQUIRED');if(value.target===null||value.target<=0||value.target>1_000_000)errors.push('TARGET_INVALID');return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});}
export function normalizeHabitLogDraft(input={}){return Object.freeze({habitId:String(input.habitId||'').trim(),completed:bool(input.completed),value:input.value===''||input.value===undefined?null:clone(input.value),notes:String(input.notes||'').trim().slice(0,500),recordedAt:iso(input.recordedAt)});}
export function validateHabitLogDraft(input={}){const value=normalizeHabitLogDraft(input);const errors=[];if(!SAFE_ID_PATTERN.test(value.habitId))errors.push('HABIT_ID_REQUIRED');if(!value.recordedAt)errors.push('RECORDED_AT_INVALID');return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});}
export function validatePrivateNoteDraft(input={}){const value=String(input.body||input||'').trim().slice(0,4000);return Object.freeze({ok:value.length>=3,errors:Object.freeze(value.length>=3?[]:['BODY_REQUIRED']),value});}
export function createEngagementDraftRepository({ownerId,storage=createBrowserKeyValueStore(),prefix='m26:engagement-draft:'}={}){
  const owner=safeId(ownerId,'M26_ENGAGEMENT_OWNER_REQUIRED');const base=`${prefix}${owner}:`;const key=(clientId,scope)=>`${base}${safeId(clientId,'M26_ENGAGEMENT_DRAFT_SCOPE_REQUIRED')}:${safeScope(scope)}`;
  return Object.freeze({
    async save(clientId,scope,value){const client=safeId(clientId,'M26_ENGAGEMENT_DRAFT_SCOPE_REQUIRED'),safe=safeScope(scope);const record={ownerId:owner,clientId:client,scope:safe,value:clone(value),updatedAt:new Date().toISOString(),confirmed:false};await storage.set(key(client,safe),record);return clone(record);},
    async load(clientId,scope){const client=safeId(clientId,'M26_ENGAGEMENT_DRAFT_SCOPE_REQUIRED'),safe=safeScope(scope),storageKey=key(client,safe);const record=clone(await storage.get(storageKey));if(!record)return undefined;if(record.ownerId!==owner||record.clientId!==client||record.scope!==safe){await storage.remove(storageKey);return undefined;}return record;},
    async remove(clientId,scope){await storage.remove(key(clientId,scope));},
    async list(clientId=''){const prefixKey=clientId?`${base}${safeId(clientId,'M26_ENGAGEMENT_DRAFT_SCOPE_REQUIRED')}:`:base;return (await storage.entries(prefixKey)).map(([,value])=>clone(value)).filter((value)=>value?.ownerId===owner&&SAFE_ID_PATTERN.test(String(value.clientId||''))&&SAFE_SCOPE_PATTERN.test(String(value.scope||'')));},
    async clearOwner(){await storage.clear(base);},
  });
}
export function createMemoryEngagementDraftRepository(options={}){return createEngagementDraftRepository({...options,storage:createMemoryKeyValueStore()});}
