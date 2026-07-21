import { createBrowserKeyValueStore,createMemoryKeyValueStore } from '../platform/key-value-store.js';
function clone(value){return value==null?value:structuredClone(value);}
function number(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function clampScore(value){const n=number(value);return n===null?null:Math.max(0,Math.min(10,n));}
function bool(value){return value===true||value==='true'||value==='1'||value==='on'||value===1;}
export function normalizeCheckinDraft(input={}){return Object.freeze({energy:clampScore(input.energy),sleep:clampScore(input.sleep),stress:clampScore(input.stress),pain:clampScore(input.pain),notes:String(input.notes||'').trim().slice(0,1000),recordedAt:input.recordedAt||new Date().toISOString()});}
export function validateCheckinDraft(input={}){const value=normalizeCheckinDraft(input);const errors=[];for(const key of ['energy','sleep','stress','pain'])if(value[key]===null)errors.push(`${key.toUpperCase()}_REQUIRED`);return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});}
export function normalizeHabitDefinitionDraft(input={}){return Object.freeze({title:String(input.title||'').trim().slice(0,120),description:String(input.description||'').trim().slice(0,500),target:number(input.target),unit:String(input.unit||'veces').trim().slice(0,40),frequency:String(input.frequency||'diario').trim().slice(0,40)});}
export function validateHabitDefinitionDraft(input={}){const value=normalizeHabitDefinitionDraft(input);const errors=[];if(value.title.length<2)errors.push('TITLE_REQUIRED');if(value.target===null||value.target<=0)errors.push('TARGET_INVALID');return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});}
export function normalizeHabitLogDraft(input={}){return Object.freeze({habitId:String(input.habitId||'').trim(),completed:bool(input.completed),value:input.value===''||input.value===undefined?null:input.value,notes:String(input.notes||'').trim().slice(0,500),recordedAt:input.recordedAt||new Date().toISOString()});}
export function validateHabitLogDraft(input={}){const value=normalizeHabitLogDraft(input);const errors=[];if(!value.habitId)errors.push('HABIT_ID_REQUIRED');return Object.freeze({ok:errors.length===0,errors:Object.freeze(errors),value});}
export function validatePrivateNoteDraft(input={}){const value=String(input.body||input||'').trim().slice(0,4000);return Object.freeze({ok:value.length>=3,errors:Object.freeze(value.length>=3?[]:['BODY_REQUIRED']),value});}
export function createEngagementDraftRepository({ownerId,storage=createBrowserKeyValueStore(),prefix='m26:engagement-draft:'}={}){
  const owner=String(ownerId||'').trim();if(!owner)throw new Error('M26_ENGAGEMENT_OWNER_REQUIRED');const base=`${prefix}${owner}:`;const key=(clientId,scope)=>`${base}${clientId}:${scope}`;
  return Object.freeze({
    async save(clientId,scope,value){if(!clientId||!scope)throw new Error('M26_ENGAGEMENT_DRAFT_SCOPE_REQUIRED');const record={ownerId:owner,clientId,scope,value:clone(value),updatedAt:new Date().toISOString(),confirmed:false};await storage.set(key(clientId,scope),record);return clone(record);},
    async load(clientId,scope){return clone(await storage.get(key(clientId,scope)));},
    async remove(clientId,scope){await storage.remove(key(clientId,scope));},
    async list(clientId=''){return (await storage.entries(`${base}${clientId}`)).map(([,value])=>clone(value)).filter(Boolean);},
    async clearOwner(){await storage.clear(base);},
  });
}
export function createMemoryEngagementDraftRepository(options={}){return createEngagementDraftRepository({...options,storage:createMemoryKeyValueStore()});}
