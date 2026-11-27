// Read-only contract: never deploys or contacts Supabase. Distinguishes
// repository source identity, remote source inventory, and rollback runtime.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const EXPECTED_SHA='9076875af47d78284273e495dbd7fb227dbb5865',BASE='50ba022115091478a86900be6f0b0e4c816044ef';
const PROJECTS={prod:'pjhmrhejsoofmouedavw',qa:'gjztkdwfmunnzhtvxrsu'};
const SLUGS=["iberfit-admin-client-invite-v1","iberfit-evolution-report-emission-v1","iberfit-iri-report-emission-v1"];
const COUNTS=[[1,1],[3,6],[10,11]];
const HASH=/^[0-9a-f]{40}$/u, BUNDLE=/^[0-9a-f]{64}$/u;
const fail=reason=>{throw Error('GX350_EDGE_'+reason);};
const safePath=p=>typeof p==='string'&&p.length<300&&p.split('/').every(x=>x!=='.'&&x!=='..'&&/^[a-zA-Z0-9_.-]+$/u.test(x));
export function gitBlob(bytes){
 if(!Buffer.isBuffer(bytes)&&typeof bytes!=='string')fail('SOURCE_BYTES_INVALID');
 // Git object identity, not a cryptographic signature. Use Git's own collision-aware object hashing.
 const git=process.platform==='win32'?'C:/Program Files/Git/cmd/git.exe':'/usr/bin/git';
 const id=execFileSync(git,['hash-object','--stdin','--no-filters'],{input:Buffer.from(bytes),encoding:'utf8',maxBuffer:1024}).trim();
 if(!HASH.test(id))fail('GIT_OBJECT_ID_INVALID');
 return id;
}
export function validateScope(m){
 if(!m||m.schema!=='iberfit.gx350.edge-scope.v1'||m.candidate!==EXPECTED_SHA||
  m.previousLiveSource!==BASE||m.productionProject!==PROJECTS.prod||m.qaProject!==PROJECTS.qa||
  m.productionAuthorized!==false||m.rollbackRuntimeCertified!==false||m.fullPlatformRecoveryCertified!==false||
  !Array.isArray(m.functions)||m.functions.length!==3)fail('SCOPE_INVALID');
 for(const [i,f] of m.functions.entries()){
  if(f.slug!==SLUGS[i]||f.verifyJwt!==(i===1)||!BUNDLE.test(f.prodBundle)||!BUNDLE.test(f.qaBundle)||
   !Number.isSafeInteger(f.prodVersion)||f.prodVersion<1||!Number.isSafeInteger(f.qaVersion)||f.qaVersion<1)fail('METADATA_INVALID');
  for(const [j,kind] of ['prod','candidate'].entries()){
   const files=f[kind];
   if(!Array.isArray(files)||files.length!==COUNTS[i][j]||new Set(files.map(x=>x.name)).size!==files.length||!files.some(x=>x.name==='index.ts'))fail('FILES_INVALID');
   for(const file of files){
    if(!safePath(file.name)||!safePath(file.sourcePath)||!HASH.test(file.blob)||
      ![EXPECTED_SHA,BASE].includes(file.sourceRef)||kind==='candidate'&&file.sourceRef!==EXPECTED_SHA)fail('SOURCE_INVALID');
    const canonical=f.slug===SLUGS[1]&&kind==='candidate'&&file.name==='report-trend-contract.js'&&file.sourcePath==='src/m26/workflows/report-trend-contract.js';
    const standard=file.sourcePath==='supabase/functions/'+f.slug+'/'+file.name;
    const historical=kind==='prod'&&file.sourcePath.startsWith('scripts/ops/m44_legacy_edge_source/'+f.slug+'-prod-')&&file.sourcePath.endsWith('/'+file.name);
    if(!canonical&&!standard&&!historical)fail('SOURCE_BOUNDARY_INVALID');
   }
  }
  if(i===1){const x=f.importMap;if(!x||x.name!=='deno.json'||x.sourceRef!==BASE||x.sourcePath!=='supabase/functions/'+f.slug+'/deno.json'||!HASH.test(x.blob)||x.liveBytesVerified!==false)fail('IMPORT_MAP_SCOPE_INVALID');}
  else if(f.importMap!==null)fail('IMPORT_MAP_UNEXPECTED');
 }
 return m;
}
export function verifyRepositorySources(m,read){
 validateScope(m);if(typeof read!=='function')fail('READER_INVALID');
 let files=0;
 for(const f of m.functions)for(const x of [...f.prod,...f.candidate,...(f.importMap?[f.importMap]:[])]){
  if(gitBlob(read(x.sourceRef,x.sourcePath))!==x.blob)fail('SOURCE_HASH_DRIFT');files++;
 }
 return Object.freeze({repositoryEntriesVerified:files,prodSources:14,candidateSources:18,priorImportMapRepositoryVerified:true,priorImportMapLiveBytesVerified:false,rollbackRuntimeCertified:false,productionAuthorized:false});
}
export function verifyObservedSources(m,kind,project,observed){
 validateScope(m);
 if(!['prod','qa'].includes(kind)||project!==PROJECTS[kind]||!Array.isArray(observed)||observed.length!==3)fail('OBSERVATION_SCOPE_INVALID');
 for(const f of m.functions){
  const matches=observed.filter(x=>x.slug===f.slug);if(matches.length!==1)fail('OBSERVATION_SLUG_INVALID');
  const actual=matches[0],expected=kind==='prod'?f.prod:f.candidate;
  if(actual.status!=='ACTIVE'||actual.version!==f[kind+'Version']||actual.ezbr_sha256!==f[kind+'Bundle']||actual.verify_jwt!==f.verifyJwt||
    !Array.isArray(actual.files)||actual.files.length!==expected.length)fail('OBSERVATION_METADATA_DRIFT');
  const names=new Set();
  for(const x of actual.files){
   const name=typeof x.name==='string'&&x.name.startsWith(f.slug+'/')?x.name.slice(f.slug.length+1):x.name;
   if(!safePath(name)||names.has(name))fail('OBSERVATION_NAME_INVALID');names.add(name);
   if(!expected.some(y=>y.name===name&&y.blob===gitBlob(x.content)))fail('OBSERVATION_SOURCE_DRIFT');
  }
 }
 return Object.freeze({sourceFilesVerified:kind==='prod'?14:18,functionsVerified:3,remoteWrites:0,rollbackRuntimeCertified:false,fullPlatformRecoveryCertified:false,productionAuthorized:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const m=JSON.parse(readFileSync(new URL('./gx350_edge_scope.json',import.meta.url),'utf8'));
 const git=process.platform==='win32'?'C:/Program Files/Git/cmd/git.exe':'/usr/bin/git';
 console.log(JSON.stringify(verifyRepositorySources(m,(ref,p)=>execFileSync(git,['show',ref+':'+p],{cwd:root,maxBuffer:1024*1024}))));
}
