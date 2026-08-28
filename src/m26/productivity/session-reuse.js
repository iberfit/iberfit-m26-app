import {createM26Id} from '../platform/id.js';
import {createSessionDraft,validateSessionDraft} from '../workflows/session-builder.js';

export const SESSION_TEMPLATE_SCHEMA_VERSION='iberfit.session-template.v1';
export const SESSION_TEMPLATE_MAX_ITEMS=20;
export const SESSION_TEMPLATE_MAX_VERSIONS=5;

const GROUP_TYPES=new Set(['biserie','triserie','circuito','amrap','tabata']);

function text(value,max=160){return String(value??'').trim().slice(0,max);}
function positiveInt(value,fallback,{min=1,max=1000}={}){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
function number(value,fallback,{min=0,max=10}={}){const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;}
function recordBody(record={}){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;}
function normalizeName(value){return text(value,60).normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/\s+/gu,' ');}

function safePrescription(input={}){
  return {
    reps:text(input.reps||'8–12',40)||'8–12',
    restSeconds:positiveInt(input.restSeconds,60,{min:1,max:3600}),
    tempo:text(input.tempo||'controlado',40)||'controlado',
    targetRpe:number(input.targetRpe,7,{min:1,max:10}),
    targetRir:number(input.targetRir,3,{min:0,max:10}),
    alternativeId:text(input.alternativeId,160)||null,
  };
}

function safeTemplateBlock(block={}){
  if(block.type==='exercise'){
    return {
      type:'exercise',
      exerciseId:text(block.exerciseId,160),
      name:text(block.name,160),
      sets:positiveInt(block.sets,3,{min:1,max:100}),
      ...safePrescription(block),
    };
  }
  if(!GROUP_TYPES.has(block.type))throw new Error('M26_SESSION_REUSE_BLOCK_TYPE_UNSUPPORTED');
  const exerciseIds=[...new Set((Array.isArray(block.exerciseIds)?block.exerciseIds:[]).map((id)=>text(id,160)).filter(Boolean))];
  return {
    type:block.type,
    exerciseIds,
    rounds:positiveInt(block.rounds,3,{min:1,max:100}),
    prescriptions:Object.fromEntries(exerciseIds.map((exerciseId)=>[
      exerciseId,
      safePrescription(block.prescriptions?.[exerciseId]||{}),
    ])),
  };
}

function instantiateBlocks(blocks=[]){
  return (Array.isArray(blocks)?blocks:[]).map((block)=>({
    id:createM26Id(),
    ...structuredClone(safeTemplateBlock(block)),
  }));
}

function assertReusableDraft(draft,catalog){
  if(!catalog?.has)return draft;
  const check=validateSessionDraft(draft,catalog);
  if(!check.ok)throw new Error(`M26_SESSION_REUSE_INVALID:${check.errors.join(',')}`);
  return draft;
}

export function createReusableSessionDraft(record,{clientId,catalog,titleSuffix='copia'}={}){
  if(!clientId)throw new Error('M26_SESSION_REUSE_CLIENT_REQUIRED');
  const source=recordBody(record);
  const titleBase=text(source.title||source.name||'Sesión IBERFIT',120)||'Sesión IBERFIT';
  const suffix=text(titleSuffix,24);
  const title=suffix?`${titleBase} · ${suffix}`.slice(0,120):titleBase;
  const draft=createSessionDraft({
    clientId,
    title,
    durationMinutes:positiveInt(source.durationMinutes||source.duration_minutes,50,{min:10,max:240}),
  });
  draft.blocks=instantiateBlocks(source.blocks||[]);
  draft.previewAccepted=false;
  draft.revision=0;
  draft.status='draft';
  return assertReusableDraft(draft,catalog);
}

export function sessionTemplateStorageKey(ownerId){
  const owner=text(ownerId,180).replace(/[^a-zA-Z0-9._-]/gu,'_');
  if(!owner)throw new Error('M26_SESSION_TEMPLATE_OWNER_REQUIRED');
  return `iberfit-m26:session-templates:${owner}`;
}

export function sessionTemplateSnapshot(draft={}){
  return Object.freeze({
    title:text(draft.title||'Sesión IBERFIT',120)||'Sesión IBERFIT',
    durationMinutes:positiveInt(draft.durationMinutes,50,{min:10,max:240}),
    blocks:Object.freeze((draft.blocks||[]).map((block)=>Object.freeze(safeTemplateBlock(block)))),
  });
}

function emptyWorkspace(){return {schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,templates:[]};}
function readWorkspace(storage,key){
  if(!storage?.getItem)return emptyWorkspace();
  try{
    const parsed=JSON.parse(storage.getItem(key)||'null');
    if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.templates))return emptyWorkspace();
    return {
      schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
      templates:parsed.templates.slice(0,SESSION_TEMPLATE_MAX_ITEMS),
    };
  }catch{return emptyWorkspace();}
}
function writeWorkspace(storage,key,workspace){
  if(!storage?.setItem)throw new Error('M26_SESSION_TEMPLATE_STORAGE_UNAVAILABLE');
  storage.setItem(key,JSON.stringify({
    schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
    templates:(workspace.templates||[]).slice(0,SESSION_TEMPLATE_MAX_ITEMS),
  }));
}

export function createSessionTemplateRepository({
  ownerId,
  storage=globalThis.localStorage,
  now=()=>new Date(),
  idFactory=createM26Id,
}={}){
  const key=sessionTemplateStorageKey(ownerId);
  function state(){return readWorkspace(storage,key);}
  function list(){
    return Object.freeze(state().templates.map((template)=>Object.freeze({
      id:template.id,
      name:template.name,
      version:Number(template.latestVersion||0),
      updatedAt:template.updatedAt||null,
      title:template.versions?.at?.(-1)?.snapshot?.title||'Sesión IBERFIT',
      blockCount:Number(template.versions?.at?.(-1)?.snapshot?.blocks?.length||0),
    })).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));
  }
  function get(templateId,version=null){
    const template=state().templates.find((item)=>item.id===String(templateId||''));
    if(!template)return null;
    const target=version==null
      ?template.versions?.at?.(-1)
      :template.versions?.find((item)=>Number(item.version)===Number(version));
    if(!target)return null;
    return Object.freeze({
      id:template.id,
      name:template.name,
      version:Number(target.version||0),
      createdAt:target.createdAt||null,
      snapshot:structuredClone(target.snapshot),
    });
  }
  function save(name,draft){
    const safeName=text(name,60);
    if(!safeName)throw new Error('M26_SESSION_TEMPLATE_NAME_REQUIRED');
    const workspace=state();
    const normalized=normalizeName(safeName);
    const existing=workspace.templates.find((item)=>normalizeName(item.name)===normalized)||null;
    const timestamp=now() instanceof Date?now().toISOString():new Date(now()).toISOString();
    const nextVersion=Number(existing?.latestVersion||0)+1;
    const versionEntry={
      version:nextVersion,
      createdAt:timestamp,
      snapshot:sessionTemplateSnapshot(draft),
    };
    const template={
      id:existing?.id||idFactory(),
      name:safeName,
      latestVersion:nextVersion,
      updatedAt:timestamp,
      versions:[...(existing?.versions||[]),versionEntry].slice(-SESSION_TEMPLATE_MAX_VERSIONS),
    };
    const templates=[template,...workspace.templates.filter((item)=>item.id!==template.id)]
      .slice(0,SESSION_TEMPLATE_MAX_ITEMS);
    writeWorkspace(storage,key,{schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,templates});
    return Object.freeze({id:template.id,name:template.name,version:nextVersion,updatedAt:timestamp});
  }
  function clearOwner(){try{storage?.removeItem?.(key);return true;}catch{return false;}}
  return Object.freeze({key,list,get,save,clearOwner});
}

export function createDraftFromSessionTemplate(template,{clientId,catalog}={}){
  if(!template?.snapshot)throw new Error('M26_SESSION_TEMPLATE_NOT_FOUND');
  if(!clientId)throw new Error('M26_SESSION_TEMPLATE_CLIENT_REQUIRED');
  const snapshot=template.snapshot;
  const draft=createSessionDraft({
    clientId,
    title:text(snapshot.title||template.name||'Sesión IBERFIT',120),
    durationMinutes:positiveInt(snapshot.durationMinutes,50,{min:10,max:240}),
  });
  draft.blocks=instantiateBlocks(snapshot.blocks||[]);
  draft.previewAccepted=false;
  draft.revision=0;
  draft.status='draft';
  return assertReusableDraft(draft,catalog);
}

export const __sessionReuseInternals=Object.freeze({
  safePrescription,
  safeTemplateBlock,
  instantiateBlocks,
  normalizeName,
  readWorkspace,
});