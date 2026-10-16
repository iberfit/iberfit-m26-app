// Recovery inventory of referenced runtime configuration names, never their values.
// No network access, no privileged APIs and no assumption that keys are configured.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadInventory,validateLocalSources} from './m44_edge_source_recovery_contract.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const FILENAME=path.join(ROOT,'scripts/ops/m44_edge_runtime_config_inventory.json');
export const SCHEMA='iberfit.m44.edge-runtime-recovery-inventory.v1';
const REF='pjhmrhejsoofmouedavw';
const PREFIX='IBERFIT_EDGE_RUNTIME_RECOVERY_';
const NAME=/^[A-Z][A-Z0-9_]{2,100}$/;
const DYNAMIC_ARGUMENTS=new Set(['envName','legacyName','jsonName','primary','legacy','name']);
const CATEGORIES=['supabase_provided_or_legacy','nonstandard_fallback','external_or_operator_provided','optional_configuration'];

export function extractReferencedNames(source){
  if(typeof source!=='string')throw Error(PREFIX+'SOURCE_INVALID');
  const found=new Set();
  let dynamicCount=0;
  for(const m of source.matchAll(/(?:Deno|process)\.env\.get\s*\(\s*([^)]*?)\s*\)/g)){
    const arg=m[1].trim();
    const literal=/^(['"\x60])([A-Z][A-Z0-9_]{2,100})\1$/.exec(arg);
    if(literal){found.add(literal[2]);continue;}
    if(!DYNAMIC_ARGUMENTS.has(arg))throw Error(PREFIX+'DYNAMIC_ENV_UNREVIEWED');
    dynamicCount++;
  }
  // Approved helpers may resolve JSON-style modern keys with legacy fallbacks
  // or a single legacy key; collecting callsite names closes that static gap.
  for(const m of source.matchAll(/\b(?:jsonKey|jsonEnv|key|env)\s*\(\s*(['"\x60])([A-Z][A-Z0-9_]{2,100})\1/g)){
    found.add(m[2]);
  }
  // A two-argument helper's second argument is the fallback key.
  for(const m of source.matchAll(/\b(?:jsonKey|jsonEnv|key)\s*\(\s*(['"\x60])([A-Z][A-Z0-9_]{2,100})\1\s*,\s*(['"\x60])([A-Z][A-Z0-9_]{2,100})\3/g)){
    found.add(m[4]);
  }
  if(dynamicCount>0 && ![...found].some(n=>/^(SUPABASE_|IBERFIT_)/.test(n)))
    throw Error(PREFIX+'INDIRECT_ENV_UNRESOLVED');
  return Object.freeze([...found].sort());
}

function assertKeys(item,expected,code){
  if(!item||typeof item!=='object'||Array.isArray(item)||
     Object.keys(item).sort().join('|')!==[...expected].sort().join('|'))
    throw Error(PREFIX+code);
}
function assertNames(names){
  if(!Array.isArray(names)||new Set(names).size!==names.length||
     names.some(n=>typeof n!=='string'||!NAME.test(n))||
     JSON.stringify(names)!==JSON.stringify([...names].sort()))
    throw Error(PREFIX+'NAMES_INVALID');
}
export function validateInventory(inventory,original=loadInventory(),root=ROOT){
  assertKeys(inventory,['schema','project_ref','note','classes','functions'],'MANIFEST_SHAPE');
  if(inventory.schema!==SCHEMA||inventory.project_ref!==REF||
     typeof inventory.note!=='string'||inventory.note.length<20)
    throw Error(PREFIX+'MANIFEST_IDENTITY_INVALID');
  assertKeys(inventory.classes,CATEGORIES,'CLASSES_INVALID');
  const classes=new Map();
  for(const label of CATEGORIES){
    const names=inventory.classes[label];
    assertNames(names);
    for(const name of names){
      if(classes.has(name))throw Error(PREFIX+'CLASS_DUPLICATE');
      classes.set(name,label);
    }
  }
  if(!Array.isArray(inventory.functions)||inventory.functions.length!==original.sources.length)
    throw Error(PREFIX+'FUNCTION_COUNT_INVALID');
  if(JSON.stringify(inventory.functions.map(x=>x.slug))!==
     JSON.stringify(original.sources.map(x=>x.slug)))
    throw Error(PREFIX+'FUNCTION_ORDER_INVALID');
  const evidence=validateLocalSources(original,root);
  if(evidence.filesVerified!==original.sources.length)
    throw Error(PREFIX+'SOURCE_PROVENANCE_INVALID');
  for(let i=0;i<original.sources.length;i++){
    const expected=original.sources[i],entry=inventory.functions[i];
    assertKeys(entry,['slug','referenced_names','deployment_policy'],'FUNCTION_SHAPE');
    const policy=expected.source_state==='historical_live_snapshot_not_deploy_target'?
      'historical_source_not_to_deploy':'canonical';
    if(entry.slug!==expected.slug||entry.deployment_policy!==policy)
      throw Error(PREFIX+'FUNCTION_IDENTITY_INVALID');
    assertNames(entry.referenced_names);
    const input=fs.readFileSync(path.join(root,expected.source_path),'utf8');
    const discovered=extractReferencedNames(input);
    if(JSON.stringify(entry.referenced_names)!==JSON.stringify(discovered))
      throw Error(PREFIX+'UNREGISTERED_ENV_REFERENCE:'+entry.slug);
    if(entry.referenced_names.some(n=>!classes.has(n)))
      throw Error(PREFIX+'UNKNOWN_RUNTIME_NAME:'+entry.slug);
  }
  return Object.freeze({
    functionsAudited:original.sources.length,
    referencedNamesCatalogued:classes.size,
    // This tool only sees source code and configured NAME references, not values.
    runtimeSecretsAvailable:false,
    hostedAuthRecoveryVerified:false,
    hostedVaultRecoveryVerified:false,
    platformRecoveryVerified:false
  });
}

export function runInventoryCheck(file=FILENAME,root=ROOT){
  const input=fs.readFileSync(file,'utf8');
  if(input.length>100000)throw Error(PREFIX+'MANIFEST_OVERSIZED');
  return validateInventory(JSON.parse(input),loadInventory(),root);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    if(process.argv.length!==2)throw Error(PREFIX+'USAGE_INVALID');
    const result=runInventoryCheck();
    console.log('IBERFIT_EDGE_RUNTIME_REFERENCE_CATALOGUED:functions='+result.functionsAudited+
      ':names='+result.referencedNamesCatalogued);
    console.log('IBERFIT_EDGE_RUNTIME_ACTUAL_SECRET_VALUES_AND_HOSTED_SERVICES_NOT_VERIFIED');
  }catch(err){
    const message=String(err?.message||'');
    console.error(message.startsWith(PREFIX)?message:PREFIX+'CHECK_FAILED');
    process.exitCode=1;
  }
}
