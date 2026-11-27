// Local runtime rehearsal using the exact recovered and candidate modules.
// No Deno hosted deployment, real credentials, external service or DB access.
// Native Node module loader with an exact package allowlist and inert external packages.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import '../offline_network_guard.mjs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gitBlob,validateScope} from './gx350_edge_scope.mjs';
import {repositoryReader,rehearseEdgePackages} from './gx350_edge_stage_rehearsal.mjs';
const manifest=validateScope(JSON.parse(readFileSync(new URL('./gx350_edge_scope.json',import.meta.url),'utf8')));
const read=repositoryReader(fileURLToPath(new URL('../../',import.meta.url)));
const safe=()=>{throw Error('GX350_EDGE_UNEXPECTED_PROVIDER_OR_NETWORK');};
const uuid='00000000-0000-4000-8000-000000000001';
const PROD='https://app.iberfit.cl',QA='https://m26-canary.iberfit.cl',BAD='https://untrusted.invalid';
function buildPackage(f,kind){
 const entries=[...f[kind],...(kind==='prod'&&f.importMap?[f.importMap]:[])];
 return new Map(entries.map(x=>{
 const bytes=read(x.sourceRef,x.sourcePath);
 assert.equal(gitBlob(bytes),x.blob);
 return [x.name,bytes.toString('utf8')];
 }));
}
async function instantiate(files,project){
 let handler,authCalls=0,providerCalls=0;
 const forbidden=()=>{providerCalls++;return safe();};
 // Inputs are only immutable Git objects validated by buildPackage and the
 // package closure check. This is a test subprocess, not a sandbox for untrusted JS.
 const dir=mkdtempSync(join(tmpdir(),'iberfit-gx350-edge-'));
 const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
 const previousMocks=globalThis.__gx350LocalMocks;
 const stubs=new Map([
  ['npm:@supabase/supabase-js@2.112.4','export const createClient=globalThis.__gx350LocalMocks.createClient;'],
  ['npm:pdf-lib@1.17.1','export const {PDFDocument,StandardFonts,rgb}=globalThis.__gx350LocalMocks;'],
  ['npm:@pdf-lib/fontkit@1.1.1','export default Object.freeze({});']
 ]);
 const allowed=new Set();
 let hooks;
 const cleanup=()=>{
  hooks?.deregister();
  if(originalDeno===undefined)delete globalThis.Deno;else globalThis.Deno=originalDeno;
  globalThis.fetch=originalFetch;
  if(previousMocks===undefined)delete globalThis.__gx350LocalMocks;else globalThis.__gx350LocalMocks=previousMocks;
  rmSync(dir,{recursive:true,force:true});
 };
 try{
  globalThis.fetch=forbidden;
  globalThis.Deno=Object.freeze({env:Object.freeze({get(name){
   if(name==='SUPABASE_URL')return 'https://'+project+'.supabase.co';
   if(name==='SUPABASE_ANON_KEY'||name==='SUPABASE_SERVICE_ROLE_KEY')return 'synthetic-unusable';
   return undefined;
  }}),serve(fn){assert.equal(handler,undefined);handler=fn;}});
  globalThis.__gx350LocalMocks=Object.freeze({
   createClient:()=>({auth:{getUser:async()=>{authCalls++;return {data:{user:null},error:{message:'SYNTHETIC_INVALID_JWT'}};},
   admin:{listUsers:forbidden,inviteUserByEmail:forbidden},resetPasswordForEmail:forbidden},rpc:forbidden,from:forbidden,storage:{from:forbidden}}),
   PDFDocument:{create:forbidden,load:forbidden},StandardFonts:{},rgb:(red,green,blue)=>{
    assert.ok([red,green,blue].every(n=>Number.isFinite(n)&&n>=0&&n<=1));return Object.freeze({type:'RGB',red,green,blue});
   }
  });
  writeFileSync(join(dir,'package.json'),'{"type":"module"}',{flag:'wx'});
  for(const [name,source] of files){
   const file=join(dir,name);mkdirSync(dirname(file),{recursive:true});
   writeFileSync(file,source,{flag:'wx'});allowed.add(pathToFileURL(file).href);
  }
  const replacements=new Map();
  let index=0;
  for(const [name,source] of stubs){
   const file=join(dir,'stub-'+index+++'.mjs');
   writeFileSync(file,source,{flag:'wx'});const url=pathToFileURL(file).href;
   replacements.set(name,url);allowed.add(url);
  }
  hooks=registerHooks({resolve(specifier,context,nextResolve){
   if(replacements.has(specifier))return {url:replacements.get(specifier),shortCircuit:true};
   const result=nextResolve(specifier,context);
   if(!allowed.has(result.url))throw Error('GX350_EDGE_IMPORT_BOUNDARY');
   return result;
  }});
  await import(pathToFileURL(join(dir,'index.ts')).href);
 }catch(error){cleanup();throw error;}
 assert.equal(typeof handler,'function');
 return {async call(method,origin,body,token){
  const headers={Origin:origin,'Content-Type':'application/json'};
  if(token)headers.Authorization=token;
  const request=new Request('https://edge.invalid/',{method,headers,...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const response=await handler(request);
  const raw=await response.text();
  const data=raw?JSON.parse(raw):null;
  assert.ok(!/signedUrl|sourceSnapshot|artifactSha256|gx333CommandHash/.test(raw));
  return {status:response.status,cors:response.headers.get('access-control-allow-origin'),ok:data?.ok??null};
 },counts:()=>({authCalls,providerCalls}),cleanup};
}
await rehearseEdgePackages(manifest,read);
let checks=0,instances=0;
for(const f of manifest.functions){
 const body=f.slug.includes('invite')?{command:{type:'ADMIN_CLIENTE_REENVIAR_INVITACION',operationId:'gx350-synthetic',entityId:uuid,payload:{clientId:uuid}}}:
  f.slug.includes('evolution')?{action:'latest',reportId:uuid}:{action:'health'};
 // Prove old -> new -> old using identical source bytes, in fresh native module trees.
 for(const [project,origin] of [[manifest.productionProject,PROD],[manifest.qaProject,QA]]){
  let baseline;
  for(const kind of ['prod','candidate','prod']){
   const runtime=await instantiate(buildPackage(f,kind),project);instances++;
   try{
   const observed=[];
   for(const [method,o,token,status] of [['POST',origin,null,401],['POST',BAD,null,403],['GET',origin,null,405],['OPTIONS',origin,null,204],['POST',origin,'Bearer synthetic-invalid',401]]){
    const result=await runtime.call(method,o,body,token);
    assert.equal(result.status,status,f.slug+' '+kind+' '+method+' '+status);
    assert.equal(result.cors,o===BAD?null:o);
    if(status!==204)assert.equal(result.ok,false);
    observed.push(result);checks++;
   }
   assert.deepEqual(runtime.counts(),{authCalls:1,providerCalls:0});
   if(baseline)assert.deepEqual(observed,baseline);else baseline=observed;
   }finally{runtime.cleanup();}
  }
 }
}
console.log(JSON.stringify({schema:'iberfit.gx350.edge-local-runtime.v1',instances,checks,realLocalModules:true,externalPackagesStubbed:true,hostedGatewayVerified:false,hostedRollbackVerified:false,productionAuthorized:false,remoteWrites:0}));
