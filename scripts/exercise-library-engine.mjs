#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const args=new Set(process.argv.slice(2));
const valueAfter=(flag)=>{const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null;};
const input=valueAfter('--input');
const apply=args.has('--apply');
if(!input)throw new Error('IBERFIT_EXERCISE_INPUT_REQUIRED');

function text(v=''){return String(v??'').trim();}
function norm(v=''){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[^a-z0-9]+/gu,' ').trim();}
function list(v){return [...new Set((Array.isArray(v)?v:[]).map(text).filter(Boolean))];}
function slug(v){return norm(v).replace(/\s+/gu,'-').slice(0,120);}
function stableId(raw){
  const explicit=text(raw.id);if(explicit)return explicit;
  const source=text(raw.source||'IBERFIT_IMPORT').toUpperCase().replace(/[^A-Z0-9]+/gu,'_');
  const sourceId=text(raw.source_id||raw.sourceId);if(sourceId)return `${source}:${slug(sourceId)}`;
  const basis=[raw.name_es||raw.name,raw.pattern,raw.equipment].map(norm).join('|');
  return `${source}:${slug(raw.name_es||raw.name)||'exercise'}:${createHash('sha1').update(basis).digest('hex').slice(0,10)}`;
}
function normalize(raw={}){
  const name=text(raw.name_es||raw.name||raw.name_source);if(!name)throw new Error('IBERFIT_EXERCISE_NAME_REQUIRED');
  return {
    id:stableId(raw),name_es:name,name_source:text(raw.name_source||raw.name)||null,
    source:text(raw.source||'IBERFIT_IMPORT').toUpperCase(),source_id:text(raw.source_id||raw.sourceId)||null,
    pattern:text(raw.pattern||'general'),intent:text(raw.intent||'fuerza'),equipment:text(raw.equipment||'sin material'),difficulty:text(raw.difficulty||'intermedio'),
    primary_muscles:list(raw.primary_muscles),secondary_muscles:list(raw.secondary_muscles),cues:list(raw.cues),instructions_es:list(raw.instructions_es),precautions:list(raw.precautions),units:list(raw.units),tags:list(raw.tags),aliases:list(raw.aliases),
    active:raw.active!==false,
  };
}
function fingerprint(ex){return [norm(ex.name_es),norm(ex.pattern),norm(ex.equipment)].join('|');}
function merge(a,b){return {...a,...b,aliases:list([...(a.aliases||[]),...(b.aliases||[]),a.name_es,b.name_es]),tags:list([...(a.tags||[]),...(b.tags||[])]),primary_muscles:list([...(a.primary_muscles||[]),...(b.primary_muscles||[])]),secondary_muscles:list([...(a.secondary_muscles||[]),...(b.secondary_muscles||[])])};}
function dedupe(records){const byKey=new Map();for(const raw of records){const ex=normalize(raw);const key=ex.source_id?`${ex.source}:${ex.source_id}`:fingerprint(ex);byKey.set(key,byKey.has(key)?merge(byKey.get(key),ex):ex);}return [...byKey.values()];}

const parsed=JSON.parse(await readFile(input,'utf8'));
const sourceRecords=Array.isArray(parsed)?parsed:Array.isArray(parsed?.exercises)?parsed.exercises:null;
if(!sourceRecords)throw new Error('IBERFIT_EXERCISE_INPUT_INVALID');
const records=dedupe(sourceRecords);
const summary={input:sourceRecords.length,normalized:records.length,deduplicated:sourceRecords.length-records.length,apply};
if(!apply){console.log(JSON.stringify({...summary,preview:records.slice(0,5)},null,2));process.exit(0);}

const url=text(process.env.IBERFIT_SUPABASE_URL).replace(/\/$/u,'');
const key=text(process.env.IBERFIT_SUPABASE_SERVICE_ROLE_KEY);
const projectRef=text(process.env.IBERFIT_PROJECT_REF);
const environment=text(process.env.IBERFIT_ENVIRONMENT).toLowerCase();
if(!url||!key||!projectRef||!environment)throw new Error('IBERFIT_EXERCISE_APPLY_ENV_MISSING');
if(new URL(url).hostname!==`${projectRef}.supabase.co`)throw new Error('IBERFIT_EXERCISE_PROJECT_MISMATCH');
if(environment==='production'&&String(process.env.IBERFIT_ALLOW_PRODUCTION).toLowerCase()!=='true')throw new Error('IBERFIT_EXERCISE_PRODUCTION_NOT_APPROVED');
if(!['qa','production'].includes(environment))throw new Error('IBERFIT_EXERCISE_ENV_INVALID');

const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};
const endpoint=`${url}/rest/v1/exercise_catalog?on_conflict=id`;
const chunkSize=100;let written=0;
for(let i=0;i<records.length;i+=chunkSize){
  const chunk=records.slice(i,i+chunkSize);
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(chunk)});
  if(!response.ok)throw new Error(`IBERFIT_EXERCISE_UPSERT_FAILED:${response.status}:${(await response.text()).slice(0,500)}`);
  written+=chunk.length;
}
console.log(JSON.stringify({...summary,written,environment,projectRef},null,2));
