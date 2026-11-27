// Local runtime rehearsal using the exact recovered and candidate modules.
// No Deno hosted deployment, real credentials, external service or DB access.
// The VM linker supplies inert external packages; actual local modules load.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
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
 const context=vm.createContext({
  URL,Response,Request,Headers,TextEncoder,TextDecoder,crypto:globalThis.crypto,
  console:Object.freeze({log(){},warn(){},error(){}}),
  fetch:forbidden,
  Deno:Object.freeze({env:Object.freeze({get(name){
   if(name==='SUPABASE_URL')return 'https://'+project+'.supabase.co';
   if(name==='SUPABASE_ANON_KEY'||name==='SUPABASE_SERVICE_ROLE_KEY')return 'synthetic-unusable';
   return undefined;
  }}),serve(fn){assert.equal(handler,undefined);handler=fn;}}),
 },{codeGeneration:{strings:false,wasm:false}});
 const modules=new Map();
 function external(name){
  let exports;
  if(name==='npm:@supabase/supabase-js@2.112.4')exports={createClient:()=>({
   auth:{getUser:async()=>{authCalls++;return {data:{user:null},error:{message:'SYNTHETIC_INVALID_JWT'}};},
    admin:{listUsers:forbidden,inviteUserByEmail:forbidden},resetPasswordForEmail:forbidden},
   rpc:forbidden,from:forbidden,storage:{from:forbidden}
  })};
  else if(name==='npm:pdf-lib@1.17.1')exports={PDFDocument:{create:forbidden,load:forbidden},StandardFonts:{},rgb:forbidden};
  else if(name==='npm:@pdf-lib/fontkit@1.1.1')exports={default:Object.freeze({})};
  else throw Error('GX350_EDGE_UNKNOWN_EXTERNAL');
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context,identifier:name});
 }
 function module(name){
  if(modules.has(name))return modules.get(name);
  let mod;
  if(name.startsWith('npm:'))mod=external(name);
  else{
   assert.ok(files.has(name),'missing local module');
   const raw=files.get(name);
   const source=name.endsWith('.ts')?stripTypeScriptTypes(raw,{mode:'strip'}):raw;
   mod=new vm.SourceTextModule(source,{context,identifier:name,importModuleDynamically:forbidden});
  }
  modules.set(name,mod);return mod;
 }
 const entry=module('index.ts');
 await entry.link((specifier,ref)=>module(specifier.startsWith('.')?posix.normalize(posix.join(posix.dirname(ref.identifier),specifier)):specifier));
 await entry.evaluate({timeout:5000});
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
 },counts:()=>({authCalls,providerCalls})};
}
await rehearseEdgePackages(manifest,read);
let checks=0,instances=0;
for(const f of manifest.functions){
 const body=f.slug.includes('invite')?{command:{type:'ADMIN_CLIENTE_REENVIAR_INVITACION',operationId:'gx350-synthetic',entityId:uuid,payload:{clientId:uuid}}}:
  f.slug.includes('evolution')?{action:'latest',reportId:uuid}:{action:'health'};
 // Prove old -> new -> old using identical source bytes, in fresh VMs.
 for(const [project,origin] of [[manifest.productionProject,PROD],[manifest.qaProject,QA]]){
  let baseline;
  for(const kind of ['prod','candidate','prod']){
   const runtime=await instantiate(buildPackage(f,kind),project);instances++;
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
  }
 }
}
console.log(JSON.stringify({schema:'iberfit.gx350.edge-local-runtime.v1',instances,checks,realLocalModules:true,externalPackagesStubbed:true,hostedGatewayVerified:false,hostedRollbackVerified:false,productionAuthorized:false,remoteWrites:0}));
