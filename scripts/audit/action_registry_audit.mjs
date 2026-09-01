import fs from 'node:fs/promises';
import path from 'node:path';
import {M26_ACTION_REGISTRY} from '../../src/m26/ui/interactive-audit.js';

const root=path.resolve('src/m26');
const validRoles=new Set(['admin','coach','client']);

async function walk(dir){
  const out=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full));
    else if(entry.name.endsWith('.js'))out.push(full);
  }
  return out;
}

const files=await walk(root);
const markupActions=new Set();
const handlerActions=new Set();
const markupPattern=/data-(?:session-action|m26-action|engagement-action|verification-action|workflow-action)=["']([A-Za-z0-9_-]+)["']/g;
const handlerPattern=/\baction\s*===\s*["']([A-Za-z0-9_-]+)["']/g;

for(const file of files){
  const text=await fs.readFile(file,'utf8');
  for(const match of text.matchAll(markupPattern))markupActions.add(match[1]);
  for(const match of text.matchAll(handlerPattern))handlerActions.add(match[1]);
}

const registryActions=new Set(Object.keys(M26_ACTION_REGISTRY));
const errors=[];
for(const action of markupActions)if(!registryActions.has(action))errors.push(`MARKUP_ACTION_UNREGISTERED:${action}`);
for(const action of handlerActions)if(!registryActions.has(action))errors.push(`HANDLER_ACTION_UNREGISTERED:${action}`);
for(const [action,entry] of Object.entries(M26_ACTION_REGISTRY)){
  if(!entry||!Array.isArray(entry.roles)||!entry.roles.length)errors.push(`REGISTRY_ROLES_INVALID:${action}`);
  else for(const role of entry.roles)if(!validRoles.has(role))errors.push(`REGISTRY_ROLE_UNKNOWN:${action}:${role}`);
  if(!String(entry?.domain||'').trim())errors.push(`REGISTRY_DOMAIN_MISSING:${action}`);
}

console.log(`FILES_SCANNED=${files.length}`);
console.log(`MARKUP_ACTIONS=${markupActions.size}`);
console.log(`HANDLER_ACTIONS=${handlerActions.size}`);
console.log(`REGISTRY_ACTIONS=${registryActions.size}`);
if(errors.length){
  for(const item of errors.sort())console.error(item);
  console.error(`IBERFIT_ACTION_REGISTRY_AUDIT=FAIL:${errors.length}`);
  process.exitCode=1;
}else console.log('IBERFIT_ACTION_REGISTRY_AUDIT=PASS');
