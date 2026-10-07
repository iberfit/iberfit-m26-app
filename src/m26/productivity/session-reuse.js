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
    plannedLoad:text(input.plannedLoad,80),
    restSeconds:input.restSeconds==null||input.restSeconds===''?60:positiveInt(input.restSeconds,60,{min:0,max:3600}),
    tempo:text(input.tempo||'controlado',40)||'controlado',
    targetRpe:number(input.targetRpe,7,{min:1,max:10}),
    targetRir:number(input.targetRir,3,{min:0,max:10}),
    prescriptionNotes:text(input.prescriptionNotes,1000),
    progression:text(input.progression,500),
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

function safeIso(value){
  const time=Date.parse(String(value||''));
  return Number.isFinite(time)?new Date(time).toISOString():null;
}
function safeWorkspaceVersion(version,index=0){
  if(!version||typeof version!=='object'||Array.isArray(version))return null;
  try{
    return {
      version:positiveInt(version.version,index+1,{min:1,max:1_000_000}),
      createdAt:safeIso(version.createdAt)||new Date(0).toISOString(),
      snapshot:sessionTemplateSnapshot(version.snapshot||{}),
    };
  }catch{return null;}
}
function mergeWorkspaceTemplateRecords(left,right){
  const leftUpdated=safeIso(left?.updatedAt)||new Date(0).toISOString();
  const rightUpdated=safeIso(right?.updatedAt)||new Date(0).toISOString();
  const preferred=rightUpdated>=leftUpdated?right:left;
  const versions=[...(left?.versions||[]),...(right?.versions||[])]
    .map((item,index)=>safeWorkspaceVersion(item,index))
    .filter(Boolean)
    .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const deduped=[];
  const seen=new Set();
  for(const version of versions){
    const key=`${version.createdAt}|${JSON.stringify(version.snapshot)}`;
    if(seen.has(key))continue;
    seen.add(key);
    deduped.push(version);
  }
  const retained=deduped.slice(-SESSION_TEMPLATE_MAX_VERSIONS);
  const versionTip=Math.max(
    retained.length,
    Math.min(1_000_000,Number(left?.latestVersion)||0),
    Math.min(1_000_000,Number(right?.latestVersion)||0),
    retained.length ? Math.min(...retained.map((entry)=>entry.version))+retained.length-1 : 0,
  );
  const kept=retained.map((version,index)=>({
    ...version,
    version:versionTip-retained.length+index+1,
  }));
  if(!kept.length)return null;
  return {
    id:text(preferred?.id||left?.id||right?.id,160)||createM26Id(),
    name:text(preferred?.name||left?.name||right?.name,60),
    latestVersion:versionTip,
    updatedAt:[leftUpdated,rightUpdated,kept.at(-1)?.createdAt||''].sort().at(-1),
    versions:kept,
  };
}
function safeWorkspaceTemplate(template){
  if(!template||typeof template!=='object'||Array.isArray(template))return null;
  const id=text(template.id,160);
  const name=text(template.name,60);
  if(!id||!name)return null;
  const versions=(Array.isArray(template.versions)?template.versions:[])
    .map((item,index)=>safeWorkspaceVersion(item,index))
    .filter(Boolean)
    .slice(-SESSION_TEMPLATE_MAX_VERSIONS);
  if(!versions.length)return null;
  const versionTip=Math.max(
    versions.length,
    Math.min(1_000_000,Number(template.latestVersion)||0),
    ...versions.map((entry)=>entry.version),
  );
  const renumbered=versions.map((version,index)=>({...version,version:versionTip-versions.length+index+1}));
  return {
    id,
    name,
    latestVersion:versionTip,
    updatedAt:safeIso(template.updatedAt)||renumbered.at(-1).createdAt,
    versions:renumbered,
  };
}
export function normalizeSessionTemplateWorkspace(input={}){
  const remoteRevision=Math.max(0,Number(input?.remoteRevision)||0);
  const byName=new Map();
  for(const raw of Array.isArray(input?.templates)?input.templates:[]){
    const template=safeWorkspaceTemplate(raw);
    if(!template)continue;
    const key=normalizeName(template.name);
    const current=byName.get(key);
    byName.set(key,current?mergeWorkspaceTemplateRecords(current,template):template);
  }
  const templates=[...byName.values()]
    .filter(Boolean)
    .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))
    .slice(0,SESSION_TEMPLATE_MAX_ITEMS);
  return {
    schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
    remoteRevision,
    templates,
  };
}
export function mergeSessionTemplateWorkspaces(localWorkspace={},remoteWorkspace={}){
  return normalizeSessionTemplateWorkspace({
    remoteRevision:Math.max(
      Number(localWorkspace?.remoteRevision)||0,
      Number(remoteWorkspace?.remoteRevision)||0,
    ),
    templates:[
      ...(Array.isArray(localWorkspace?.templates)?localWorkspace.templates:[]),
      ...(Array.isArray(remoteWorkspace?.templates)?remoteWorkspace.templates:[]),
    ],
  });
}
function emptyWorkspace(){return {schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,remoteRevision:0,templates:[]};}
function readWorkspace(storage,key){
  if(!storage?.getItem)return emptyWorkspace();
  try{
    const parsed=JSON.parse(storage.getItem(key)||'null');
    if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.templates))return emptyWorkspace();
    return normalizeSessionTemplateWorkspace(parsed);
  }catch{return emptyWorkspace();}
}
function writeWorkspace(storage,key,workspace){
  if(!storage?.setItem)throw new Error('M26_SESSION_TEMPLATE_STORAGE_UNAVAILABLE');
  const normalized=normalizeSessionTemplateWorkspace(workspace);
  storage.setItem(key,JSON.stringify(normalized));
  return normalized;
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
    if(nextVersion>1_000_000)throw new Error('M26_SESSION_TEMPLATE_VERSION_LIMIT');
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
    writeWorkspace(storage,key,{
      schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
      remoteRevision:workspace.remoteRevision,
      templates,
    });
    return Object.freeze({id:template.id,name:template.name,version:nextVersion,updatedAt:timestamp});
  }
  function workspace(){return structuredClone(state());}
  function replaceWorkspace(next,{remoteRevision=next?.remoteRevision}={}){
    const normalized=normalizeSessionTemplateWorkspace({
      ...next,
      remoteRevision:Math.max(0,Number(remoteRevision)||0),
    });
    writeWorkspace(storage,key,normalized);
    return structuredClone(normalized);
  }
  function mergeWorkspace(next,{remoteRevision=next?.remoteRevision}={}){
    const merged=mergeSessionTemplateWorkspaces(
      state(),
      normalizeSessionTemplateWorkspace({
        ...next,
        remoteRevision:Math.max(0,Number(remoteRevision)||0),
      }),
    );
    merged.remoteRevision=Math.max(0,Number(remoteRevision)||0);
    writeWorkspace(storage,key,merged);
    return structuredClone(merged);
  }
  function clearOwner(){try{storage?.removeItem?.(key);return true;}catch{return false;}}
  return Object.freeze({key,list,get,save,workspace,replaceWorkspace,mergeWorkspace,clearOwner});
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
  safeWorkspaceTemplate,
  mergeWorkspaceTemplateRecords,
});