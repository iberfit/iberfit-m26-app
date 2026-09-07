#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SAFE_REL=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,499}$/u;
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function resolveWithin(root,rel){
  if(!SAFE_REL.test(rel)||rel.startsWith('/')||rel.split('/').includes('..')) throw new Error(`IBERFIT_REHYDRATE_PATH_INVALID:${rel}`);
  const base=path.resolve(root),out=path.resolve(base,rel);
  if(out!==base&&!out.startsWith(`${base}${path.sep}`)) throw new Error(`IBERFIT_REHYDRATE_PATH_ESCAPE:${rel}`);
  return out;
}
export function rehydrateManifest(manifest,{sourceRoot='.'}={}){
  const items=Array.isArray(manifest?.items)?manifest.items:[];
  let count=0;
  for(const item of items){
    const parts=item?.source_base64_parts;
    if(!Array.isArray(parts)||parts.length===0) continue;
    if(parts.length>32) throw new Error(`IBERFIT_REHYDRATE_TOO_MANY_PARTS:${item?.exercise_id||''}`);
    const output=resolveWithin(sourceRoot,String(item.local_path||''));
    const encoded=parts.map(p=>fs.readFileSync(resolveWithin(sourceRoot,String(p)),'utf8').replace(/\s+/g,'')).join('');
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error(`IBERFIT_REHYDRATE_BASE64_INVALID:${item.exercise_id}`);
    const bytes=Buffer.from(encoded,'base64');
    const expected=String(item?.media?.movement?.sha256||'').toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(expected)||sha256(bytes)!==expected) throw new Error(`IBERFIT_REHYDRATE_SHA_MISMATCH:${item.exercise_id}`);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,bytes,{flag:'wx'});
    count++;
  }
  return count;
}
export function run({sourceRoot='.',manifestList}={}){
  if(!manifestList) throw new Error('IBERFIT_REHYDRATE_MANIFEST_LIST_REQUIRED');
  const manifests=fs.readFileSync(manifestList,'utf8').trim().split(/\r?\n/).filter(Boolean);
  let count=0;
  for(const rel of manifests){
    const file=resolveWithin(sourceRoot,rel);
    count+=rehydrateManifest(JSON.parse(fs.readFileSync(file,'utf8')),{sourceRoot});
  }
  console.log(JSON.stringify({ok:true,rehydrated:count,manifests:manifests.length}));
  return count;
}
if(import.meta.url===new URL(`file://${path.resolve(process.argv[1]||'')}`).href){
  const a=process.argv.slice(2),get=n=>{const i=a.indexOf(n);return i>=0?a[i+1]:null};
  try{run({sourceRoot:get('--source-root')||'.',manifestList:get('--manifest-list')});}
  catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
}
