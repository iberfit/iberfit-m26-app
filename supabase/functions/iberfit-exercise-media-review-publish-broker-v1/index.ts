import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.4";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";

const VERSION="exercise-media-review-publish-broker-v1.0";
const PROD_REF="pjhmrhejsoofmouedavw";
const REVIEW_BUCKET="iberfit-exercise-media-review";
const PUBLISHER_PATH="/functions/v1/iberfit-exercise-media-publisher";
const AUDIENCE="iberfit-exercise-media-prod";
const EXPECTED_REPOSITORY="iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID="1306074388";
const EXPECTED_REF="refs/heads/canary/rc74-4";
const EXPECTED_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/exercise-media-publish-approved.yml@refs/heads/canary/rc74-4";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256=/^[0-9a-f]{64}$/u;
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
function fail(code:string,status=400):never{throw Object.assign(new Error(code),{status});}
function safe(value:unknown,max=800){return String(value??"").replace(/[\u0000-\u001f\u007f]/gu," ").trim().slice(0,max);}
function env(name:string){const value=String(Deno.env.get(name)||"").trim();if(!value)fail(`IBERFIT_REVIEW_BROKER_${name}_MISSING`,500);return value;}
function dbClient(){const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");if(!url.includes(PROD_REF)||key.length<20)fail("IBERFIT_REVIEW_BROKER_PROD_ENV_INVALID",500);return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{"x-client-info":"iberfit-exercise-media-review-publish-broker/1"}}});}
function bearer(req:Request){const value=String(req.headers.get("authorization")||"");if(!value.startsWith("Bearer "))fail("IBERFIT_REVIEW_BROKER_OIDC_REQUIRED",401);return value.slice(7).trim();}
async function authenticate(token:string){
  const {payload}=await jwtVerify(token,JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
  if(payload.repository!==EXPECTED_REPOSITORY||String(payload.repository_id||"")!==EXPECTED_REPOSITORY_ID)fail("IBERFIT_REVIEW_BROKER_REPOSITORY_FORBIDDEN",403);
  if(payload.ref!==EXPECTED_REF)fail("IBERFIT_REVIEW_BROKER_REF_FORBIDDEN",403);
  if(payload.workflow_ref!==EXPECTED_WORKFLOW_REF)fail("IBERFIT_REVIEW_BROKER_WORKFLOW_FORBIDDEN",403);
  if(!["workflow_dispatch","workflow_call","push"].includes(String(payload.event_name||"")))fail("IBERFIT_REVIEW_BROKER_EVENT_FORBIDDEN",403);
  if(payload.runner_environment&&payload.runner_environment!=="github-hosted")fail("IBERFIT_REVIEW_BROKER_RUNNER_FORBIDDEN",403);
  const runId=String(payload.run_id||"").trim(),sha=String(payload.sha||"").toLowerCase();
  if(!runId||!/^[0-9a-f]{40}$/u.test(sha))fail("IBERFIT_REVIEW_BROKER_WORKFLOW_IDENTITY_INVALID",403);
  return {payload,runId,sha};
}
async function digest(bytes:Uint8Array){const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map((x)=>x.toString(16).padStart(2,"0")).join("");}
function approvedItem(claim:any){
  const item=structuredClone(claim?.outputManifest||{}),media=item?.media;
  if(!item||typeof item!=="object"||Array.isArray(item)||!media||typeof media!=="object"||Array.isArray(media))fail("IBERFIT_REVIEW_BROKER_MANIFEST_INVALID",409);
  if(String(item.exercise_id||"")!==String(claim.exerciseId||""))fail("IBERFIT_REVIEW_BROKER_EXERCISE_MISMATCH",409);
  item.human_approved=true;item.publishable=true;
  item.approval={...(item.approval||{}),method:"human_owner_approval",scopes:["visual","biomechanics"],automatic_qa:"passed",approved_by:claim.actorUserId,operation_id:claim.operationId};
  media.published=true;media.clientVisible=true;media.coachVisible=true;
  return item;
}
async function finalize(db:any,claim:any,success:boolean,error:string|null,detail:any){
  const res=await db.rpc("iberfit_admin_media_review_publish_result_v1",{
    p_job_id:claim.jobId,p_operation_id:claim.operationId,p_actor:claim.actorUserId,p_success:success,p_error:error,p_detail:detail||{},
  });
  if(res.error)fail(`IBERFIT_REVIEW_BROKER_RESULT_FAILED:${safe(res.error.message)}`,502);
  const value=Array.isArray(res.data)?res.data[0]:res.data;
  if(value?.ok!==true)fail("IBERFIT_REVIEW_BROKER_RESULT_NOT_CONFIRMED",502);
  return value;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED",version:VERSION},405);
  let claim:any=null,db:any=null;
  try{
    const token=bearer(req),identity=await authenticate(token);db=dbClient();
    const claimed=await db.rpc("iberfit_admin_media_review_publish_claim_v1",{p_workflow_run_id:identity.runId,p_workflow_sha:identity.sha});
    if(claimed.error)fail(`IBERFIT_REVIEW_BROKER_CLAIM_FAILED:${safe(claimed.error.message)}`,502);
    const receipt=Array.isArray(claimed.data)?claimed.data[0]:claimed.data;
    if(receipt?.ok!==true)fail("IBERFIT_REVIEW_BROKER_CLAIM_NOT_CONFIRMED",502);
    if(receipt.done===true||!receipt.claim)return json({ok:true,done:true,version:VERSION});
    claim=receipt.claim;
    if(!UUID.test(String(claim.jobId||""))||!UUID.test(String(claim.actorUserId||""))||!SHA256.test(String(claim.sha256||"").toLowerCase()))fail("IBERFIT_REVIEW_BROKER_CLAIM_INVALID",409);
    const path=safe(claim?.review?.staging?.delivery_path,500);
    if(!path||path.includes("..")||path.startsWith("/"))fail("IBERFIT_REVIEW_BROKER_STAGING_PATH_INVALID",409);
    const download=await db.storage.from(REVIEW_BUCKET).download(path);
    if(download.error||!download.data)fail("IBERFIT_REVIEW_BROKER_STAGING_READ_FAILED",502);
    const bytes=new Uint8Array(await download.data.arrayBuffer()),sha=await digest(bytes);
    if(sha!==String(claim.sha256).toLowerCase())fail("IBERFIT_REVIEW_BROKER_STAGING_SHA_MISMATCH",409);
    const item=approvedItem(claim),mime=String(item?.media?.movement?.mime||"image/webp");
    const form=new FormData();form.set("item",JSON.stringify(item));form.set("file",new File([bytes],"delivery.webp",{type:mime}));
    const origin=new URL(env("SUPABASE_URL")).origin;
    const response=await fetch(`${origin}${PUBLISHER_PATH}`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:form});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload?.ok!==true){
      const message=safe(payload?.error||`PUBLISHER_HTTP_${response.status}`);
      await finalize(db,claim,false,message,{publisherStatus:response.status,publisherError:message});
      return json({ok:false,done:false,error:message,jobId:claim.jobId,version:VERSION},502);
    }
    const result=await finalize(db,claim,true,null,{publisher:payload});
    return json({ok:true,done:false,published:true,jobId:claim.jobId,exerciseId:claim.exerciseId,publication:payload,result,version:VERSION});
  }catch(error:any){
    const message=safe(error?.message||error||"IBERFIT_REVIEW_BROKER_FAILED");
    if(db&&claim){try{await finalize(db,claim,false,message,{brokerError:message});}catch{/* keep original failure */}}
    const status=Number(error?.status)||(/OIDC|JWT|signature|issuer|audience/i.test(message)?401:/FORBIDDEN/u.test(message)?403:/MISMATCH|INVALID|STATE/u.test(message)?409:502);
    return json({ok:false,error:message,version:VERSION},status);
  }
});
