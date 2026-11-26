import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync(new URL('../supabase/functions/iberfit-admin-client-invite-v1/index.ts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source.replace(/^import .*\n/u,''),{mode:'strip'});
const C='00000000-0000-4000-8000-000000000001',U='00000000-0000-4000-8000-000000000002',X='00000000-0000-4000-8000-000000000003';
const op='synthetic-op',resend='ADMIN_CLIENTE_REENVIAR_INVITACION',create='ADMIN_CLIENTE_CREAR',origin='https://m26-canary.iberfit.cl';
async function run(cfg={}){
 let handler;const calls=[];const type=cfg.type||resend;
 const receipt={ok:true,kind:'ack',operationId:op,commandType:type,entityId:C,clientId:C,email:'synthetic@example.invalid',accessMode:cfg.internal?'internal':'app'};
 const rpc=async(name,params)=>{calls.push([name,params]);
  if(name.endsWith('execute_v14'))return {data:cfg.badCreate?{...receipt,operationId:'foreign'}:cfg.duplicate?{...receipt,kind:'duplicate',recoveryOnly:true,invitation:{deliveryStatus:'sent'},trainingServiceStatus:'active',coachAssignment:{id:U},gx333CommandHash:'private'}:receipt};
  if(name.endsWith('prepare_v26'))return cfg.prepareError?{error:{message:cfg.prepareError}}:{data:{ok:true,clientId:cfg.badPrepare?X:C,shouldSend:!cfg.already,email:'synthetic@example.invalid',name:'Synthetic',deliveryStatus:'pending',reason:cfg.already?'operation_already_prepared':null}};
  if(name.endsWith('bind_v26'))return cfg.bindError?{error:{message:'V26_BIND_FAILED'}}:{data:{ok:true}};
  if(name.endsWith('finalize_v26'))return cfg.finalError?{error:{message:'V26_FINAL_FAILED'}}:{data:{ok:true,clientId:cfg.foreignFinal?X:C,deliveryStatus:params.p_delivery_status}};
  throw Error(name);
 };
 const provider=async()=>{calls.push(['provider']);if(cfg.providerThrow)throw Error('network');return cfg.providerError?{error:cfg.providerError}:{data:{user:{id:U}}};};
 const user={rpc,auth:{getUser:async()=>({data:{user:{id:U}}})}};
 const service={auth:{admin:{listUsers:async()=>({data:{users:[]}}),inviteUserByEmail:provider}}};
 const pub={auth:{resetPasswordForEmail:provider}};
 const fakeCreate=(_url,key,opts)=>opts?.global?user:key==='service'?service:pub;
 const Deno={env:{get:k=>({SUPABASE_URL:'https://gjztkdwfmunnzhtvxrsu.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[k]||'')},serve:f=>handler=f};
 new Function('createClient','Deno','Response','URL',js)(fakeCreate,Deno,Response,URL);
 const command={type,operationId:op,entityId:C,payload:{clientId:C,email:'synthetic@example.invalid'}};
 const response=await handler({method:'POST',headers:{get:k=>k==='origin'?origin:k==='authorization'?'Bearer synthetic':null},text:async()=>JSON.stringify({command})});
 return {status:response.status,body:await response.json(),prepared:calls.filter(x=>x[0].endsWith('prepare_v26')).length,provider:calls.filter(x=>x[0]==='provider').length,final:calls.filter(x=>x[0].endsWith('finalize_v26')).map(x=>x[1].p_delivery_status)};
}
const cases=[
 ['historical app creation recovery is read-only',{type:create,duplicate:true},x=>x.status===200&&x.body.kind==='duplicate'&&x.body.recoveryOnly===true&&x.body.invitation.reason==='creation_recovered_review_access'&&x.body.invitation.deliveryStatus===null&&!x.prepared&&!x.provider&&!x.final.length&&!('trainingServiceStatus' in x.body)&&!('coachAssignment' in x.body)&&!('gx333CommandHash' in x.body)],
 ['historical internal creation does not send or assert current access',{type:create,duplicate:true,internal:true},x=>x.body.invitation.accessStatus===null&&!x.prepared&&!x.provider&&!x.final.length],
 ['rate limit has no false ACK or finalization',{prepareError:'V26_INVITATION_RATE_LIMITED'},x=>x.status===429&&!x.body.ok&&!x.final.length&&!x.provider],
 ['wrong client prepare rejected',{badPrepare:true},x=>x.status===400&&!x.body.ok&&!x.final.length&&!x.provider],
 ['same prepared operation does not send',{already:true},x=>x.body.invitation.deliveryStatus==='pending'&&!x.provider&&!x.final.length],
 ['network error after dispatch remains pending',{providerThrow:true},x=>x.body.invitation.reason==='provider_delivery_unconfirmed'&&!x.final.length&&x.provider===1],
 ['explicit provider rejection recorded',{providerError:{name:'AuthApiError',status:429,code:'over_email_send_rate_limit',message:'rate limit'}},x=>x.body.invitation.deliveryStatus==='error'&&x.final.join(',')==='error'],
 ['accepted provider before bind error',{bindError:true},x=>x.body.invitation.reason==='provider_accepted_reconciliation_pending'&&!x.final.length],
 ['wrong client finalization not confirmed',{foreignFinal:true},x=>x.body.invitation.deliveryStatus==='pending'&&x.final.join(',')==='sent'],
 ['successful provider acceptance',{},x=>x.body.invitation.deliveryStatus==='sent'&&x.provider===1&&x.final.join(',')==='sent'],
 ['internal IRI creation no email',{type:create,internal:true},x=>x.body.invitation.reason==='internal_record'&&!x.provider&&!x.final.length],
 ['wrong operation creation receipt rejected',{type:create,badCreate:true},x=>x.status===400&&!x.provider&&!x.final.length],
 ['confirmed creation with unconfirmed invitation',{type:create,prepareError:'V26_INVITATION_RATE_LIMITED'},x=>x.body.invitation.reason==='creation_confirmed_invitation_unconfirmed'&&!x.provider&&!x.final.length],
];
for(const [name,cfg,check] of cases)test(name,async()=>assert.ok(check(await run(cfg))));
