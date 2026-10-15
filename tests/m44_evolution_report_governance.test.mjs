import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvolutionReportGovernanceService} from '../src/m26/workflows/evolution-report-governance.js';
const qa={enabled:true,qaOnly:true,projectRef:'gjztkdwfmunnzhtvxrsu',
 url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',publishableKey:'sb-publishable-fixture'};
const uid='11111111-1111-4111-8111-111111111111';
const issue='22222222-2222-4222-8222-222222222222';

test('M44 issuance client refuses disabled and wrong-project connection',()=>{
 assert.throws(()=>createEvolutionReportGovernanceService({runtime:{...qa,enabled:false}}),/BACKEND_DISABLED/);
 assert.throws(()=>createEvolutionReportGovernanceService({runtime:{...qa,projectRef:'other'}}),/PROJECT_MISMATCH/);
});
test('M44 refuses signed URLs and accepts only token-bound delivery',async()=>{
 const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async()=>({
  ok:true,status:200,json:async()=>({
   ok:true,issuanceId:issue,version:1,artifactSha256:'f'.repeat(64),
   signedUrl:'https://other.supabase.co/leak',
  }),
 })});
 await assert.rejects(service.latest('synthetic',{reportId:uid}),/AUTHENTICATED_DELIVERY_REQUIRED/);
});
test('M44 idempotent issuance retains same request ID across lost ACK and clears after success',async()=>{
 const stored=new Map(),payloads=[];let attempts=0;
 const service=createEvolutionReportGovernanceService({
  runtime:qa,uuidFactory:()=>issue,
  storage:{getItem:x=>stored.get(x),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
  fetchImpl:async (_url,init)=>{
   payloads.push(JSON.parse(init.body));
   attempts++;
   if(attempts===1)throw Error('offline');
   return {ok:true,status:200,json:async()=>({
    ok:true,issuanceId:issue,delivery:'authenticated-pdf',version:1,artifactSha256:'f'.repeat(64),
   })};
  },
 });
 await assert.rejects(service.issue('jwt',{reportId:uid}),/offline/);
 const output=await service.issue('jwt',{reportId:uid});
 assert.equal(output.issuanceId,issue);
 assert.equal(payloads.length,2);
 assert.equal(payloads[0].issueRequestId,payloads[1].issueRequestId);
 assert.equal(stored.size,0);
 assert.equal(output.delivery,'authenticated-pdf');
});
test('M44 client latest never asks server to issue a document',async()=>{
 const requests=[];
 const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async (_,init)=>{
  requests.push(JSON.parse(init.body));
  return {ok:true,status:200,json:async()=>({ok:true,issuanceId:issue,delivery:'authenticated-pdf',artifactSha256:'f'.repeat(64),version:2})};
 }});
 await service.latest('jwt',{reportId:uid});
 assert.deepEqual(requests,[{action:'latest',reportId:uid}]);
});


test('M44 document history is scoped and strips arbitrary metadata, without changing issuance state',async()=>{
 const calls=[];
 const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async(_,args)=>{
  calls.push(JSON.parse(args.body));
  return {ok:true,status:200,json:async()=>({
   ok:true,reportId:uid,manager:true,items:[
    {issuanceId:issue,version:1,issuedAt:'2026-10-15T12:00:00Z',withdrawn:true,
     withdrawnReason:'Rectificado',artifactPath:'PRIVATE_STORAGE_OBJECT_SHOULD_NOT_LEAK'},
   ],
  })};
 }});
 const found=await service.history('jwt',{reportId:uid});
 assert.equal(found.items[0].artifactPath,undefined);
 assert.equal(found.items[0].withdrawn,true);
 assert.deepEqual(calls,[{action:'history',reportId:uid}]);
});

test('M44 fetches PDF only after authenticated authorization, verifies SHA and never opens a signed URL',async()=>{
 const {createHash}=await import('node:crypto');
 const bytes=Buffer.from('%PDF-1.7\n'+'a'.repeat(1600)+'\n%%EOF');
 const hash=createHash('sha256').update(bytes).digest('hex');
 const calls=[];
 const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async (_url,opts)=>{
  calls.push({headers:opts.headers,body:JSON.parse(opts.body)});
  return {ok:true,status:200,headers:{get:()=> 'application/pdf'},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 }});
 const blob=await service.download('qa-access-token',{issuanceId:issue,sha256:hash});
 assert.equal(blob.type,'application/pdf');
 assert.equal(blob.size,bytes.length);
 assert.deepEqual(calls[0].body,{action:'download',issuanceId:issue});
 assert.equal(calls[0].headers.authorization,'Bearer qa-access-token');
 assert.equal(calls[0].body.signedUrl,undefined);
 await assert.rejects(service.download('qa-access-token',{issuanceId:issue,sha256:'0'.repeat(64)}),/M44_PDF_DOWNLOAD_INTEGRITY_INVALID/);
});
test('M44 withdrawn download returns the server forbidden code; client never renders bytes',async()=>{
 const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async()=>({
  ok:false,status:403,json:async()=>({ok:false,code:'M44_PDF_ISSUANCE_NOT_AVAILABLE'}),
 })});
 await assert.rejects(service.download('jwt',{issuanceId:issue,sha256:'f'.repeat(64)}),/M44_PDF_ISSUANCE_NOT_AVAILABLE/);
});
