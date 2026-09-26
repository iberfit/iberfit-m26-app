import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.4";

const VERSION="admin-media-review-v1.1";
const PROD_REF="pjhmrhejsoofmouedavw";
const STAGING_BUCKET="iberfit-exercise-media-review";
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256=/^[0-9a-f]{64}$/u;
const OPS=new Map([
  ["ADMIN_MEDIA_REVIEW_APROBAR_PUBLICAR","approve"],
  ["ADMIN_MEDIA_REVIEW_RECHAZAR","reject"],
  ["ADMIN_MEDIA_REVIEW_REGENERAR","regenerate"],
]);
const ORIGINS=new Set([
  "https://m26-canary.iberfit.cl",
  "https://app.iberfit.cl",
  "https://coach.iberfit.cl",
]);

function cors(origin=""){
  const h:Record<string,string>={
    "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods":"POST, OPTIONS",
    "access-control-max-age":"600",
    "cache-control":"no-store",
    "content-type":"application/json; charset=utf-8",
    "vary":"Origin",
    "x-content-type-options":"nosniff",
  };
  if(ORIGINS.has(origin))h["access-control-allow-origin"]=origin;
  return h;
}
function reply(status:number,body:unknown,origin=""){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
function fail(code:string,status=400):never{throw Object.assign(new Error(code),{status});}
function safe(value:unknown,max=800){return String(value??"").replace(/[\u0000-\u001f\u007f]/gu," ").trim().slice(0,max);}
function env(name:string){const value=String(Deno.env.get(name)||"").trim();if(!value)fail(`IBERFIT_MEDIA_REVIEW_${name}_MISSING`,500);return value;}
function service(){const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");if(!url.includes(PROD_REF))fail("IBERFIT_MEDIA_REVIEW_PROD_ENV_INVALID",500);return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{"x-client-info":"iberfit-admin-media-review/1"}}});}
function userClient(authorization:string,origin:string){return createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization,Origin:origin,"x-client-info":"iberfit-admin-media-review-user/1"}}});}

async function authorize(authorization:string,origin:string,db:any){
  const client=userClient(authorization,origin);
  const userRes=await client.auth.getUser();
  const actor=String(userRes.data?.user?.id||"");
  if(userRes.error||!UUID.test(actor))fail("IBERFIT_MEDIA_REVIEW_AUTH_REQUIRED",401);
  const contextRes=await client.rpc("iberfit_application_context_v14");
  if(contextRes.error)fail("IBERFIT_MEDIA_REVIEW_CONTEXT_FORBIDDEN",403);
  const ctx=Array.isArray(contextRes.data)?contextRes.data[0]:contextRes.data;
  const roles=Array.isArray(ctx?.roles)?ctx.roles.map((x:unknown)=>String(x).toLowerCase()):[];
  if(!roles.includes("admin"))fail("IBERFIT_MEDIA_REVIEW_ADMIN_REQUIRED",403);
  const orgId=String(ctx?.organizationId||ctx?.organization_id||"");
  if(!UUID.test(orgId))fail("IBERFIT_MEDIA_REVIEW_ORGANIZATION_INVALID",403);
  const org=await db.from("iberfit_organizations").select("id,settings").eq("id",orgId).maybeSingle();
  if(org.error||!org.data)fail("IBERFIT_MEDIA_REVIEW_ORGANIZATION_NOT_FOUND",403);
  if(org.data?.settings?.admin_media_review_enabled!==true)fail("IBERFIT_MEDIA_REVIEW_DISABLED",404);
  return {actor,orgId};
}
function reviewOf(job:any){return job?.visual_spec?.review&&typeof job.visual_spec.review==="object"?job.visual_spec.review:{};}
function stagingOf(job:any){const r=reviewOf(job);return r?.staging&&typeof r.staging==="object"?r.staging:{};}
async function signed(db:any,path:unknown){const value=safe(path,500);if(!value)return null;const res=await db.storage.from(STAGING_BUCKET).createSignedUrl(value,600);if(res.error||!res.data?.signedUrl)return null;return res.data.signedUrl;}
async function listCandidates(db:any){
  const jobsRes=await db.from("exercise_media_jobs")
    .select("id,exercise_id,status,attempts,visual_spec,output_manifest,last_error,created_at,updated_at,completed_at")
    .eq("status","qa").order("updated_at",{ascending:true}).limit(100);
  if(jobsRes.error)fail("IBERFIT_MEDIA_REVIEW_LIST_FAILED",502);
  const jobs=jobsRes.data||[];
  const ids=[...new Set(jobs.map((x:any)=>String(x.exercise_id||"")).filter((x:string)=>SAFE_ID.test(x)))];
  const catalogRes=ids.length?await db.from("exercise_catalog").select("id,name_es,pattern,intent,equipment,difficulty,primary_muscles,secondary_muscles,media_status,review_status").in("id",ids):{data:[],error:null};
  if(catalogRes.error)fail("IBERFIT_MEDIA_REVIEW_CATALOG_FAILED",502);
  const catalog=new Map((catalogRes.data||[]).map((x:any)=>[String(x.id),x]));
  const candidates=[];
  for(const job of jobs){
    const review=reviewOf(job),staging=stagingOf(job),exercise=catalog.get(String(job.exercise_id))||{};
    const sha=String(review?.sha256||job?.output_manifest?.proof?.delivery_sha256||"").toLowerCase();
    if(review?.automatic_qa!=="passed"||!SHA256.test(sha))continue;
    candidates.push({
      jobId:job.id,exerciseId:job.exercise_id,exerciseName:exercise.name_es||job.exercise_id,
      pattern:exercise.pattern||null,intent:exercise.intent||null,equipment:exercise.equipment||null,difficulty:exercise.difficulty||null,
      primaryMuscles:exercise.primary_muscles||[],secondaryMuscles:exercise.secondary_muscles||[],
      status:job.status,reviewState:String(review.state||"awaiting_human_approval"),attempts:Number(job.attempts||0),sha256:sha,
      confidence:{biomechanics:Number(review.biomechanics_confidence||0),visual:Number(review.visual_confidence||0)},
      provenance:{runId:review.run_id||null,workflowSha:review.workflow_sha||null,artifactName:review.artifact_name||null,publishWorkflowRunId:review.publish_workflow_run_id||null,publishWorkflowSha:review.publish_workflow_sha||null},
      timestamps:{createdAt:job.created_at||null,updatedAt:job.updated_at||null,qaCompletedAt:job.completed_at||null,approvedAt:review.approved_at||null,publishClaimedAt:review.publish_claimed_at||null,publishFailedAt:review.publish_failed_at||null},
      error:job.last_error||review.publish_error||null,
      startUrl:await signed(db,staging.start_path),finalUrl:await signed(db,staging.final_path),deliveryUrl:await signed(db,staging.delivery_path),
      staging:{startSha256:staging.start_sha256||null,finalSha256:staging.final_sha256||null,deliverySha256:staging.delivery_sha256||sha},
    });
  }
  return candidates;
}
function normalizeCommand(value:any){
  if(!value||typeof value!=="object"||Array.isArray(value))fail("IBERFIT_MEDIA_REVIEW_COMMAND_INVALID");
  const type=String(value.type||"").toUpperCase(),action=OPS.get(type);if(!action)fail("IBERFIT_MEDIA_REVIEW_COMMAND_INVALID");
  const operationId=safe(value.operationId,200),jobId=safe(value.entityId||value.payload?.jobId,80),reason=safe(value.reason,500);
  if(operationId.length<3||!UUID.test(jobId))fail("IBERFIT_MEDIA_REVIEW_COMMAND_INVALID");
  if(["reject","regenerate"].includes(action)&&reason.length<3)fail("IBERFIT_MEDIA_REVIEW_REASON_REQUIRED");
  return {type,action,operationId,jobId,reason};
}

Deno.serve(async(req:Request)=>{
  const origin=String(req.headers.get("origin")||"").trim().toLowerCase();
  if(req.method==="OPTIONS")return reply(ORIGINS.has(origin)?204:403,{},origin);
  if(req.method!=="POST")return reply(405,{ok:false,code:"M26_METHOD_NOT_ALLOWED",version:VERSION},origin);
  if(!ORIGINS.has(origin))return reply(403,{ok:false,code:"M26_ORIGIN_FORBIDDEN",version:VERSION},origin);
  const authorization=String(req.headers.get("authorization")||"").trim();
  if(!authorization.startsWith("Bearer "))return reply(401,{ok:false,code:"M26_AUTH_REQUIRED",version:VERSION},origin);
  try{
    const db=service(),identity=await authorize(authorization,origin,db);
    const raw=await req.text();if(raw.length>100_000)fail("IBERFIT_MEDIA_REVIEW_BODY_TOO_LARGE");
    const body=raw?JSON.parse(raw):{};
    if(String(body?.action||"")==="list")return reply(200,{ok:true,version:VERSION,candidates:await listCandidates(db)},origin);
    const command=normalizeCommand(body?.command);
    const claim=await db.rpc("iberfit_admin_media_review_claim_v1",{p_job_id:command.jobId,p_operation_id:command.operationId,p_actor:identity.actor,p_action:command.action,p_reason:command.reason||null});
    if(claim.error)throw claim.error;
    const receipt=Array.isArray(claim.data)?claim.data[0]:claim.data;
    if(receipt?.ok!==true)fail("IBERFIT_MEDIA_REVIEW_CLAIM_NOT_CONFIRMED",409);
    if(command.action==="approve")return reply(200,{...receipt,ok:true,publicationQueued:true,version:VERSION},origin);
    return reply(200,{...receipt,ok:true,version:VERSION},origin);
  }catch(error:any){
    const code=safe(error?.message||error||"IBERFIT_MEDIA_REVIEW_FAILED",160).toUpperCase();
    const status=Number(error?.status)||(/ADMIN_REQUIRED|AUTH_REQUIRED|CONTEXT_FORBIDDEN|ACTOR_INVALID/u.test(code)?403:/DISABLED/u.test(code)?404:/CONFLICT|NOT_ELIGIBLE|STATE/u.test(code)?409:/NOT_FOUND/u.test(code)?404:400);
    return reply(status,{ok:false,code,version:VERSION},origin);
  }
});
