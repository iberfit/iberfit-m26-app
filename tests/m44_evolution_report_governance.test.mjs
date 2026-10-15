import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvolutionReportGovernanceService} from '../src/m26/workflows/evolution-report-governance.js';
const qa={enabled:true,qaOnly:true,projectRef:'gjztkdwfmunnzhtvxrsu',
 url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',publishableKey:'sb-publishable-fixture'};
const uid='11111111-1111-4111-8111-111111111111';
const issue='22222222-2222-4222-8222-222222222222';
const fileUrl='https://gjztkdwfmunnzhtvxrsu.supabase.co/storage/v1/object/sign/iberfit-evolution-issued-reports/'+uid+'/report.pdf?token=synthetic';

test('M44 issuance client refuses disabled and wrong-project connection',()=>{
 assert.throws(()=>createEvolutionReportGovernanceService({runtime:{...qa,enabled:false}}),/BACKEND_DISABLED/);
 assert.throws(()=>createEvolutionReportGovernanceService({runtime:{...qa,projectRef:'other'}}),/PROJECT_MISMATCH/);
});
test('M44 returned download URL stays in private Supabase bucket, never third-party or public',async()=>{
 for(const candidate of ['https://other.supabase.co/storage/v1/object/sign/iberfit-evolution-issued-reports/x',
 'https://gjztkdwfmunnzhtvxrsu.supabase.co/storage/v1/object/public/x',
 'javascript:alert(1)']){
  const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async()=>({
   ok:true,status:200,json:async()=>({ok:true,issuanceId:issue,signedUrl:candidate,version:1}),
  })});
  await assert.rejects(service.latest('synthetic',{reportId:uid}),/SIGNED_URL_INVALID/);
 }
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
    ok:true,issuanceId:issue,signedUrl:fileUrl,version:1,artifactSha256:'f'.repeat(64),expiresIn:120,
   })};
  },
 });
 await assert.rejects(service.issue('jwt',{reportId:uid}),/offline/);
 const output=await service.issue('jwt',{reportId:uid});
 assert.equal(output.issuanceId,issue);
 assert.equal(payloads.length,2);
 assert.equal(payloads[0].issueRequestId,payloads[1].issueRequestId);
 assert.equal(stored.size,0);
 assert.equal(output.expiresIn,120);
});
test('M44 client latest never asks server to issue a document',async()=>{
 const requests=[];
 const service=createEvolutionReportGovernanceService({runtime:qa,fetchImpl:async (_,init)=>{
  requests.push(JSON.parse(init.body));
  return {ok:true,status:200,json:async()=>({ok:true,issuanceId:issue,signedUrl:fileUrl,version:2})};
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
