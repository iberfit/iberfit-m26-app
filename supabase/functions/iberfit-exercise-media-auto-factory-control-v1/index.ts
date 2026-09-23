import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const PROD_REF="pjhmrhejsoofmouedavw";
const SYSTEM_V1="iberfit.exercise.media.system.v1";
const AUDIENCE="iberfit-exercise-media-auto-factory";
const EXPECTED_REPOSITORY="iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID="1306074388";
const EXPECTED_REF="refs/heads/canary/rc74-4";
const EXPECTED_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/exercise-media-auto-factory.yml@refs/heads/canary/rc74-4";
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RETRY_AFTER_MS=6*60*60*1000;
const STALE_ACTIVE_MS=2*60*60*1000;
const MAX_ATTEMPTS=3;
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function safeError(value:unknown){return String(value||"UNKNOWN").replace(/[\r\n\t]+/g," ").slice(0,500);}
function serviceClient(){
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url.includes(PROD_REF)||key.length<20)fail("IBERFIT_AUTO_FACTORY_CONTROL_PROD_ENV_INVALID",500);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{"x-client-info":"iberfit-exercise-media-auto-factory-control/1"}}});
}
async function authenticate(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))fail("IBERFIT_AUTO_FACTORY_CONTROL_OIDC_REQUIRED",401);
  const {payload}=await jwtVerify(auth.slice(7).trim(),JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
  if(payload.repository!==EXPECTED_REPOSITORY||String(payload.repository_id||"")!==EXPECTED_REPOSITORY_ID)fail("IBERFIT_AUTO_FACTORY_CONTROL_REPOSITORY_FORBIDDEN",403);
  if(payload.ref!==EXPECTED_REF)fail("IBERFIT_AUTO_FACTORY_CONTROL_REF_FORBIDDEN",403);
  if(String(payload.workflow_ref||"")!==EXPECTED_WORKFLOW_REF)fail("IBERFIT_AUTO_FACTORY_CONTROL_WORKFLOW_FORBIDDEN",403);
  if(String(payload.event_name||"")!=="workflow_dispatch")fail("IBERFIT_AUTO_FACTORY_CONTROL_EVENT_FORBIDDEN",403);
  if(payload.runner_environment&&payload.runner_environment!=="github-hosted")fail("IBERFIT_AUTO_FACTORY_CONTROL_RUNNER_FORBIDDEN",403);
  return payload;
}
function isSystemV1(media:any){return media&&typeof media==="object"&&(media.visualSystem===SYSTEM_V1||media.visual_system===SYSTEM_V1);}
function latestByExercise(rows:any[]){const map=new Map<string,any>();for(const row of rows||[]){if(!map.has(String(row.exercise_id||"")))map.set(String(row.exercise_id||""),row);}return map;}

async function status(db:any){
  const catalogRes=await db.from("exercise_catalog").select("id,media,review_status,active").eq("active",true).neq("review_status","retirado").order("id",{ascending:true}).limit(1000);
  if(catalogRes.error)fail(`IBERFIT_AUTO_FACTORY_CONTROL_CATALOG_READ_FAILED:${catalogRes.error.message}`,502);
  const jobsRes=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts,updated_at").order("updated_at",{ascending:false}).limit(5000);
  if(jobsRes.error)fail(`IBERFIT_AUTO_FACTORY_CONTROL_JOBS_READ_FAILED:${jobsRes.error.message}`,502);
  const catalog=catalogRes.data||[];
  const latest=latestByExercise(jobsRes.data||[]);
  const now=Date.now();
  const staleBefore=now-STALE_ACTIVE_MS;
  let eligibleNow=0,blocked=0,staleActive=0,waitingRetry=0;
  for(const exercise of catalog){
    if(isSystemV1(exercise.media))continue;
    const job=latest.get(String(exercise.id||""));
    if(!job){eligibleNow+=1;continue;}
    const state=String(job.status||"");
    const updated=Date.parse(String(job.updated_at||""));
    if(state==="blocked"){blocked+=1;continue;}
    if(state==="ready")continue;
    if(state==="generating"||state==="qa"){
      if(!Number.isFinite(updated)||updated<=staleBefore){eligibleNow+=1;staleActive+=1;}
      continue;
    }
    if(state==="failed"){
      if(Number(job.attempts||0)>=MAX_ATTEMPTS){blocked+=1;continue;}
      if(!Number.isFinite(updated)||now-updated>=RETRY_AFTER_MS)eligibleNow+=1;
      else waitingRetry+=1;
      continue;
    }
    eligibleNow+=1;
  }
  const remaining=catalog.filter((x:any)=>!isSystemV1(x.media)).length;
  return json({ok:true,schema:"iberfit.exercise.media.auto-control.status.v1",remaining,eligible_now:eligibleNow,blocked,stale_active:staleActive,waiting_retry:waitingRetry,system_v1:catalog.length-remaining});
}

async function release(db:any,body:any){
  const jobId=String(body?.job_id||"");
  const exerciseId=String(body?.exercise_id||"");
  if(!UUID.test(jobId)||!SAFE_ID.test(exerciseId))fail("IBERFIT_AUTO_FACTORY_CONTROL_RELEASE_ID_INVALID");
  const read=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts").eq("id",jobId).eq("exercise_id",exerciseId).maybeSingle();
  if(read.error||!read.data)fail("IBERFIT_AUTO_FACTORY_CONTROL_JOB_NOT_FOUND",404);
  if(!["generating","qa"].includes(String(read.data.status||"")))fail("IBERFIT_AUTO_FACTORY_CONTROL_RELEASE_STATE_INVALID",409);
  const attempts=Math.max(0,Number(read.data.attempts||0)-1);
  const retryEligibleAt=new Date(Date.now()-RETRY_AFTER_MS-60_000).toISOString();
  const update=await db.from("exercise_media_jobs").update({status:"failed",attempts,last_error:`AUTO_FACTORY_INFRA_RELEASE:${safeError(body?.error)}`,completed_at:new Date().toISOString(),updated_at:retryEligibleAt}).eq("id",jobId).eq("exercise_id",exerciseId).in("status",["generating","qa"]);
  if(update.error)fail(`IBERFIT_AUTO_FACTORY_CONTROL_RELEASE_UPDATE_FAILED:${update.error.message}`,502);
  return json({ok:true,released:true,job_id:jobId,exercise_id:exerciseId,status:"failed",attempts});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    await authenticate(req);
    const db=serviceClient();
    const body=await req.json();
    const action=String(body?.action||"");
    if(action==="status")return await status(db);
    if(action==="release")return await release(db,body);
    fail("IBERFIT_AUTO_FACTORY_CONTROL_ACTION_INVALID");
  }catch(error:any){
    const message=safeError(error?.message||error);
    const statusCode=Number(error?.status)||(/JWT|signature|issuer|audience/i.test(message)?401:400);
    return json({ok:false,error:message},statusCode);
  }
});
