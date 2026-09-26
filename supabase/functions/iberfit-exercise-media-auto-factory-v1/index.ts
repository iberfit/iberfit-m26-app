import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const PROD_REF="pjhmrhejsoofmouedavw";
const BUCKET="iberfit-exercise-media";
const REVIEW_BUCKET="iberfit-exercise-media-review";
const SYSTEM_V1="iberfit.exercise.media.system.v1";
const STYLE="iberfit-premium-movement-pair-v1";
const AUDIENCE="iberfit-exercise-media-auto-factory";
const EXPECTED_REPOSITORY="iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID="1306074388";
const EXPECTED_REF="refs/heads/canary/rc74-4";
const EXPECTED_PROCESS_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/exercise-media-auto-factory.yml@refs/heads/canary/rc74-4";
const EXPECTED_PROBE_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/remote-gates.yml@refs/heads/canary/rc74-4";
const EXPECTED_REGEN_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/exercise-media-human-regeneration.yml@refs/heads/canary/rc74-4";
const OFFICIAL_ISOTIPO_SHA256="d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa";
const APPROVED_MASTER_SHA256="b74f8de6b50e484fa11b5d6c928b681d4b63451ad5909d81630123603e44e0bb";
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_FILE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.webp$/u;
const SHA256=/^[0-9a-f]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_ARTIFACT_NAME=180;
const MAX_REVIEW_BYTES=12_582_912;
const BASE_MIN_CONFIDENCE=0.97;
const INFERRED_ANATOMY_MIN_CONFIDENCE=0.985;
const RETRY_AFTER_MS=6*60*60*1000;
const STALE_ACTIVE_MS=2*60*60*1000;
const MAX_ATTEMPTS=3;
const DEFER_REASONS=new Set(["AI_PROVIDER_DAILY_QUOTA_EXHAUSTED"]);
const REVIEW_MIMES=new Map([["image/webp","webp"],["image/png","png"],["image/jpeg","jpg"]]);
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function safeError(value:unknown){return String(value||"UNKNOWN").replace(/[\r\n\t]+/g," ").slice(0,800);}
function serviceClient(){
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url.includes(PROD_REF)||key.length<20)fail("IBERFIT_AUTO_FACTORY_PROD_ENV_INVALID",500);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{"x-client-info":"iberfit-exercise-media-auto-factory/3"}}});
}
async function authenticate(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))fail("IBERFIT_AUTO_FACTORY_OIDC_REQUIRED",401);
  const {payload}=await jwtVerify(auth.slice(7).trim(),JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
  if(payload.repository!==EXPECTED_REPOSITORY||String(payload.repository_id||"")!==EXPECTED_REPOSITORY_ID)fail("IBERFIT_AUTO_FACTORY_REPOSITORY_FORBIDDEN",403);
  if(payload.ref!==EXPECTED_REF)fail("IBERFIT_AUTO_FACTORY_REF_FORBIDDEN",403);
  const workflowRef=String(payload.workflow_ref||"");
  if(![EXPECTED_PROCESS_WORKFLOW_REF,EXPECTED_PROBE_WORKFLOW_REF,EXPECTED_REGEN_WORKFLOW_REF].includes(workflowRef))fail("IBERFIT_AUTO_FACTORY_WORKFLOW_FORBIDDEN",403);
  const eventName=String(payload.event_name||"");
  if(workflowRef===EXPECTED_REGEN_WORKFLOW_REF){
    if(!["workflow_dispatch","schedule"].includes(eventName))fail("IBERFIT_AUTO_FACTORY_REGEN_EVENT_FORBIDDEN",403);
  }else if(!["workflow_dispatch","workflow_call"].includes(eventName))fail("IBERFIT_AUTO_FACTORY_EVENT_FORBIDDEN",403);
  if(payload.runner_environment&&payload.runner_environment!=="github-hosted")fail("IBERFIT_AUTO_FACTORY_RUNNER_FORBIDDEN",403);
  return payload;
}
function requireWorkflow(claims:any,expected:string,error:string){if(String(claims?.workflow_ref||"")!==expected)fail(error,403);}
function isSystemV1(media:any){return media&&typeof media==="object"&&(media.visualSystem===SYSTEM_V1||media.visual_system===SYSTEM_V1);}
function isGenericMuscle(value:string){return ["movilidad","global","músculo objetivo"].includes(String(value||"").trim().toLowerCase());}
function hasGenericAnatomy(exercise:any){return Array.isArray(exercise?.primary_muscles)&&exercise.primary_muscles.some((m:string)=>isGenericMuscle(m));}
function latestByExercise(rows:any[]){const map=new Map<string,any>();for(const row of rows||[]){if(!map.has(String(row.exercise_id||"")))map.set(String(row.exercise_id||""),row);}return map;}
function isHumanRegeneration(job:any){return String(job?.status||"")==="queued"&&String(job?.visual_spec?.lineage?.reason||"")==="human_regeneration";}
function jobEligible(job:any,now:number){
  if(!job)return true;
  const status=String(job.status||"");
  if(status==="queued")return true;
  if(["qa","ready","blocked"].includes(status))return false;
  if(status==="generating"){
    const updated=Date.parse(String(job.updated_at||""));
    return Number.isFinite(updated)&&now-updated>=STALE_ACTIVE_MS;
  }
  if(status==="failed"){
    if(Number(job.attempts||0)>=MAX_ATTEMPTS)return false;
    const updated=Date.parse(String(job.updated_at||""));
    return !Number.isFinite(updated)||now-updated>=RETRY_AFTER_MS;
  }
  return true;
}
async function loadQueue(db:any){
  const catalogRes=await db.from("exercise_catalog").select("id,name_es,pattern,intent,equipment,difficulty,primary_muscles,secondary_muscles,cues,instructions_es,precautions,tags,media_status,media,review_status,active").eq("active",true).neq("review_status","retirado").order("id",{ascending:true}).limit(1000);
  if(catalogRes.error)fail(`IBERFIT_AUTO_FACTORY_CATALOG_READ_FAILED:${catalogRes.error.message}`,502);
  const jobsRes=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts,last_error,updated_at,visual_spec,output_manifest").order("updated_at",{ascending:false}).limit(5000);
  if(jobsRes.error)fail(`IBERFIT_AUTO_FACTORY_JOBS_READ_FAILED:${jobsRes.error.message}`,502);
  return {catalog:catalogRes.data||[],jobs:jobsRes.data||[],latest:latestByExercise(jobsRes.data||[])};
}
async function peek(db:any,mode="normal"){
  const {catalog,latest}=await loadQueue(db);const now=Date.now();
  const remaining=catalog.filter((exercise:any)=>!isSystemV1(exercise.media));
  if(mode==="human_regeneration"){
    const queued=[...latest.values()].filter(isHumanRegeneration);
    return json({ok:true,schema:"iberfit.exercise.media.auto-factory.peek.v3",mode,eligible:queued.length>0,eligible_count:queued.length,remaining:remaining.length,blocked:[...latest.values()].filter((job:any)=>job.status==="blocked").length,awaiting_review:[...latest.values()].filter((job:any)=>job.status==="qa").length,system_v1:catalog.length-remaining.length,done:queued.length===0});
  }
  const eligible=remaining.filter((exercise:any)=>jobEligible(latest.get(exercise.id),now));
  const blocked=[...latest.values()].filter((job:any)=>job.status==="blocked").length;
  const awaitingReview=[...latest.values()].filter((job:any)=>job.status==="qa").length;
  return json({ok:true,schema:"iberfit.exercise.media.auto-factory.peek.v3",mode,eligible:eligible.length>0,eligible_count:eligible.length,remaining:remaining.length,blocked,awaiting_review:awaitingReview,system_v1:catalog.length-remaining.length,done:remaining.length===0});
}
async function claim(db:any,claims:any,mode="normal"){
  const runId=String(claims?.run_id||"");const workflowSha=String(claims?.sha||"");
  if(!runId||!workflowSha)fail("IBERFIT_AUTO_FACTORY_RUN_ID_REQUIRED",400);
  const staleBefore=new Date(Date.now()-STALE_ACTIVE_MS).toISOString();
  await db.from("exercise_media_jobs").update({status:"failed",last_error:"AUTO_FACTORY_STALE_RECOVERY",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("status","generating").lt("updated_at",staleBefore);
  const {catalog,jobs,latest}=await loadQueue(db);
  const reviewed=jobs.find((job:any)=>String(job?.status||"")==="qa"&&String(job?.visual_spec?.run_id||"")===runId&&String(job?.visual_spec?.workflow_sha||"")===workflowSha&&job?.visual_spec?.visualSystem===SYSTEM_V1);
  if(reviewed)return json({ok:true,done:false,recovered:true,review_ready:true,claim:null,exercise_id:reviewed.exercise_id,job_id:reviewed.id,mode});
  const prior=jobs.find((job:any)=>String(job?.status||"")==="generating"&&String(job?.visual_spec?.run_id||"")===runId&&String(job?.visual_spec?.workflow_sha||"")===workflowSha&&job?.visual_spec?.visualSystem===SYSTEM_V1);
  if(prior){
    const exercise=catalog.find((item:any)=>String(item?.id||"")===String(prior.exercise_id||""));
    if(!exercise)fail("IBERFIT_AUTO_FACTORY_RECOVERY_EXERCISE_MISSING",409);
    return json({ok:true,done:false,recovered:true,mode,claim:{job:prior,exercise,inferred_anatomy:prior?.visual_spec?.inferredAnatomy===true}});
  }

  if(mode==="human_regeneration"){
    const queued=[...latest.values()].filter(isHumanRegeneration).sort((a:any,b:any)=>String(a.updated_at||"").localeCompare(String(b.updated_at||"")));
    for(const previous of queued.slice(0,12)){
      const exercise=catalog.find((item:any)=>String(item?.id||"")===String(previous.exercise_id||""));
      if(!exercise)continue;
      const inferredAnatomy=hasGenericAnatomy(exercise);
      const visualSpec={...previous.visual_spec,schema:"iberfit.exercise.media.auto-job.v1",visualSystem:SYSTEM_V1,inferredAnatomy,run_id:runId,workflow_sha:workflowSha};
      const update=await db.from("exercise_media_jobs").update({status:"generating",attempts:Number(previous.attempts||0)+1,visual_spec:visualSpec,output_manifest:{},last_error:null,locked_at:new Date().toISOString(),completed_at:null,updated_at:new Date().toISOString()}).eq("id",previous.id).eq("status","queued").select("id,exercise_id,status,attempts,visual_spec").maybeSingle();
      if(!update.error&&update.data)return json({ok:true,done:false,recovered:false,mode,claim:{job:update.data,exercise,inferred_anatomy:inferredAnatomy}});
    }
    return json({ok:true,done:true,mode,claim:null,remaining:0,blocked:[...latest.values()].filter((x:any)=>x.status==="blocked").length,awaiting_review:[...latest.values()].filter((x:any)=>x.status==="qa").length,system_v1:catalog.filter((x:any)=>isSystemV1(x.media)).length});
  }

  const now=Date.now();
  const candidates=catalog.filter((exercise:any)=>{
    if(isSystemV1(exercise.media))return false;
    const job=latest.get(exercise.id);
    if(!job)return true;
    if(["generating","qa","ready","blocked"].includes(job.status))return false;
    if(job.status==="failed"){
      if(Number(job.attempts||0)>=MAX_ATTEMPTS)return false;
      const updated=Date.parse(String(job.updated_at||""));
      return !Number.isFinite(updated)||now-updated>=RETRY_AFTER_MS;
    }
    return job.status==="queued";
  }).sort((a:any,b:any)=>Number(hasGenericAnatomy(a))-Number(hasGenericAnatomy(b))||Number(a.media_status==="aprobado")-Number(b.media_status==="aprobado")||String(a.id).localeCompare(String(b.id)));
  if(!candidates.length){
    const remaining=catalog.filter((x:any)=>!isSystemV1(x.media)).length;
    const blocked=[...latest.values()].filter((x:any)=>x.status==="blocked").length;
    const awaitingReview=[...latest.values()].filter((x:any)=>x.status==="qa").length;
    return json({ok:true,done:remaining===0,mode,claim:null,remaining,blocked,awaiting_review:awaitingReview,system_v1:catalog.length-remaining});
  }
  for(const exercise of candidates.slice(0,12)){
    const previous=latest.get(exercise.id);
    const inferredAnatomy=hasGenericAnatomy(exercise);
    const base={schema:"iberfit.exercise.media.auto-job.v1",visualSystem:SYSTEM_V1,inferredAnatomy,run_id:runId,workflow_sha:workflowSha};
    const visualSpec=previous?.status==="queued"?{...previous.visual_spec,...base}:base;
    let job:any=null;
    if(previous?.status==="failed"){
      const update=await db.from("exercise_media_jobs").update({status:"generating",attempts:Number(previous.attempts||0)+1,visual_spec:visualSpec,output_manifest:{},last_error:null,locked_at:new Date().toISOString(),completed_at:null,updated_at:new Date().toISOString()}).eq("id",previous.id).eq("status","failed").select("id,exercise_id,status,attempts,visual_spec").maybeSingle();
      if(!update.error&&update.data)job=update.data;
    }else if(previous?.status==="queued"){
      const update=await db.from("exercise_media_jobs").update({status:"generating",attempts:Number(previous.attempts||0)+1,visual_spec:visualSpec,output_manifest:{},last_error:null,locked_at:new Date().toISOString(),completed_at:null,updated_at:new Date().toISOString()}).eq("id",previous.id).eq("status","queued").select("id,exercise_id,status,attempts,visual_spec").maybeSingle();
      if(!update.error&&update.data)job=update.data;
    }else{
      const insert=await db.from("exercise_media_jobs").insert({exercise_id:exercise.id,status:"generating",attempts:1,visual_spec:visualSpec,locked_at:new Date().toISOString()}).select("id,exercise_id,status,attempts,visual_spec").maybeSingle();
      if(!insert.error&&insert.data)job=insert.data;
    }
    if(job)return json({ok:true,done:false,recovered:false,mode,claim:{job,exercise,inferred_anatomy:inferredAnatomy}});
  }
  fail("IBERFIT_AUTO_FACTORY_CLAIM_RACE",409);
}
async function markFailed(db:any,body:any){
  const jobId=String(body?.job_id||"");const exerciseId=String(body?.exercise_id||"");
  if(!UUID.test(jobId)||!SAFE_ID.test(exerciseId))fail("IBERFIT_AUTO_FACTORY_FAIL_ID_INVALID");
  const read=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts").eq("id",jobId).eq("exercise_id",exerciseId).maybeSingle();
  if(read.error||!read.data)fail("IBERFIT_AUTO_FACTORY_JOB_NOT_FOUND",404);
  if(String(read.data.status||"")!=="generating")fail("IBERFIT_AUTO_FACTORY_FAIL_STATE_INVALID",409);
  const blocked=Number(read.data.attempts||0)>=MAX_ATTEMPTS;
  const update=await db.from("exercise_media_jobs").update({status:blocked?"blocked":"failed",last_error:safeError(body?.error),completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).eq("exercise_id",exerciseId).eq("status","generating");
  if(update.error)fail(`IBERFIT_AUTO_FACTORY_FAIL_UPDATE_FAILED:${update.error.message}`,502);
  return json({ok:true,job_id:jobId,exercise_id:exerciseId,status:blocked?"blocked":"failed",attempts:read.data.attempts});
}
async function markDeferred(db:any,body:any){
  const jobId=String(body?.job_id||"");const exerciseId=String(body?.exercise_id||"");const reason=safeError(body?.reason);
  if(!UUID.test(jobId)||!SAFE_ID.test(exerciseId))fail("IBERFIT_AUTO_FACTORY_DEFER_ID_INVALID");
  if(!DEFER_REASONS.has(reason))fail("IBERFIT_AUTO_FACTORY_DEFER_REASON_INVALID");
  const read=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts").eq("id",jobId).eq("exercise_id",exerciseId).maybeSingle();
  if(read.error||!read.data)fail("IBERFIT_AUTO_FACTORY_JOB_NOT_FOUND",404);
  if(String(read.data.status||"")!=="generating")fail("IBERFIT_AUTO_FACTORY_DEFER_STATE_INVALID",409);
  const attempts=Math.max(0,Number(read.data.attempts||0)-1);
  const update=await db.from("exercise_media_jobs").update({status:"failed",attempts,last_error:`AUTO_FACTORY_DEFERRED:${reason}`,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).eq("exercise_id",exerciseId).eq("status","generating");
  if(update.error)fail(`IBERFIT_AUTO_FACTORY_DEFER_UPDATE_FAILED:${update.error.message}`,502);
  return json({ok:true,deferred:true,job_id:jobId,exercise_id:exerciseId,status:"failed",attempts,reason});
}
function validateQa(report:any,mode:string,minConfidence:number){
  if(report?.schema!=="iberfit.exercise.media.auto.qa.v1"||report?.mode!==mode||report?.pass!==true)fail(`IBERFIT_AUTO_FACTORY_QA_${mode.toUpperCase()}_INVALID`);
  if(!Number.isFinite(Number(report.confidence))||Number(report.confidence)<minConfidence)fail(`IBERFIT_AUTO_FACTORY_QA_${mode.toUpperCase()}_CONFIDENCE`);
  if(mode==="visual"&&report?.checks?.muscle_target_match!==true)fail("IBERFIT_AUTO_FACTORY_QA_MUSCLE_TARGET_INVALID");
}
function validateReviewCandidate(item:any,metadata:any,qaBiomechanics:any,qaVisual:any,inferred:boolean){
  const id=String(item?.exercise_id||"");if(!SAFE_ID.test(id))fail("IBERFIT_AUTO_FACTORY_EXERCISE_ID_INVALID");
  const minConfidence=inferred?INFERRED_ANATOMY_MIN_CONFIDENCE:BASE_MIN_CONFIDENCE;
  validateQa(qaBiomechanics,"biomechanics",minConfidence);validateQa(qaVisual,"visual",minConfidence);
  if(item?.human_approved!==false||item?.publishable!==false||item?.approval?.method!=="automatic_dual_gate_v1"||item?.approval?.automatic_qa!=="passed")fail("IBERFIT_AUTO_FACTORY_REVIEW_APPROVAL_INVALID");
  if(item?.approval?.visual_system!==SYSTEM_V1||Boolean(item?.approval?.anatomy_inferred)!==inferred)fail("IBERFIT_AUTO_FACTORY_REVIEW_SYSTEM_INVALID");
  if(metadata?.visual_system!==SYSTEM_V1||metadata?.branding?.official_isotipo_sha256!==OFFICIAL_ISOTIPO_SHA256||metadata?.identity_master_sha256!==APPROVED_MASTER_SHA256)fail("IBERFIT_AUTO_FACTORY_REVIEW_METADATA_PROOF_INVALID");
  if(metadata?.master?.width!==1280||metadata?.master?.height!==1600||metadata?.delivery?.width!==640||metadata?.delivery?.height!==800||metadata?.publishable!==false)fail("IBERFIT_AUTO_FACTORY_REVIEW_METADATA_DIMENSIONS_INVALID");
  const media=item?.media;const movement=media?.movement;
  if(media?.schema!=="iberfit.exercise.visual.v1"||media?.style!==STYLE||media?.visualSystem!==SYSTEM_V1||media?.bucket!==BUCKET||media?.published!==false||media?.qa?.biomechanics!=="approved"||media?.qa?.visual!=="approved"||media?.clientVisible!==false||media?.coachVisible!==false)fail("IBERFIT_AUTO_FACTORY_REVIEW_MEDIA_INVALID");
  const storagePath=String(movement?.path||"");const parts=storagePath.split("/");const sha=String(movement?.sha256||"").toLowerCase();
  if(parts.length!==2||parts[0]!==id||!SAFE_FILE.test(parts[1])||storagePath.includes("..")||!SHA256.test(sha)||!parts[1].includes(sha.slice(0,12)))fail("IBERFIT_AUTO_FACTORY_REVIEW_PATH_INVALID");
  if(Number(movement?.width)!==640||Number(movement?.height)!==800||String(movement?.mime||"")!=="image/webp")fail("IBERFIT_AUTO_FACTORY_REVIEW_MEDIA_DIMENSIONS_INVALID");
  if(String(item?.proof?.delivery_sha256||"").toLowerCase()!==sha||String(metadata?.delivery?.sha256||"").toLowerCase()!==sha)fail("IBERFIT_AUTO_FACTORY_REVIEW_SHA_MISMATCH");
  return {id,sha,storagePath,minConfidence};
}
async function digestHex(bytes:Uint8Array){const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map((b)=>b.toString(16).padStart(2,"0")).join("");}
async function storeReviewFile(db:any,{exerciseId,jobId,phase,file}:{exerciseId:string;jobId:string;phase:string;file:File}){
  const extension=REVIEW_MIMES.get(String(file.type||""));if(!extension)fail("IBERFIT_AUTO_FACTORY_STAGE_MIME_INVALID");
  if(file.size<100||file.size>MAX_REVIEW_BYTES)fail("IBERFIT_AUTO_FACTORY_STAGE_SIZE_INVALID");
  const bytes=new Uint8Array(await file.arrayBuffer());const sha=await digestHex(bytes);const path=`${exerciseId}/${jobId}/${phase}-${sha.slice(0,12)}.${extension}`;
  const existing=await db.storage.from(REVIEW_BUCKET).download(path);
  if(!existing.error&&existing.data){const oldSha=await digestHex(new Uint8Array(await existing.data.arrayBuffer()));if(oldSha!==sha)fail("IBERFIT_AUTO_FACTORY_STAGE_EXISTING_CONFLICT",409);return {path,sha256:sha,mime:file.type,bytes:bytes.byteLength,idempotent:true};}
  const uploaded=await db.storage.from(REVIEW_BUCKET).upload(path,bytes,{contentType:file.type,cacheControl:"3600",upsert:false});
  if(uploaded.error)fail(`IBERFIT_AUTO_FACTORY_STAGE_UPLOAD_FAILED:${uploaded.error.message}`,502);
  const verify=await db.storage.from(REVIEW_BUCKET).download(path);if(verify.error||!verify.data)fail("IBERFIT_AUTO_FACTORY_STAGE_VERIFY_READ_FAILED",502);
  if(await digestHex(new Uint8Array(await verify.data.arrayBuffer()))!==sha){await db.storage.from(REVIEW_BUCKET).remove([path]);fail("IBERFIT_AUTO_FACTORY_STAGE_VERIFY_SHA_FAILED",502);}
  return {path,sha256:sha,mime:file.type,bytes:bytes.byteLength,idempotent:false};
}
async function stageReview(db:any,form:FormData,claims:any){
  const jobId=String(form.get("job_id")||"");const exerciseId=String(form.get("exercise_id")||"");
  if(!UUID.test(jobId)||!SAFE_ID.test(exerciseId))fail("IBERFIT_AUTO_FACTORY_STAGE_ID_INVALID");
  const jobRes=await db.from("exercise_media_jobs").select("id,exercise_id,status,visual_spec").eq("id",jobId).eq("exercise_id",exerciseId).maybeSingle();
  if(jobRes.error||!jobRes.data)fail("IBERFIT_AUTO_FACTORY_JOB_NOT_FOUND",404);
  const job=jobRes.data;const runId=String(claims?.run_id||"");const workflowSha=String(claims?.sha||"");
  if(job.status!=="generating"||String(job?.visual_spec?.run_id||"")!==runId||String(job?.visual_spec?.workflow_sha||"")!==workflowSha||job?.visual_spec?.visualSystem!==SYSTEM_V1)fail("IBERFIT_AUTO_FACTORY_STAGE_PROVENANCE_INVALID",409);
  const start=form.get("start"),final=form.get("final"),delivery=form.get("delivery");
  if(!(start instanceof File)||!(final instanceof File)||!(delivery instanceof File))fail("IBERFIT_AUTO_FACTORY_STAGE_FILES_REQUIRED");
  const [s,f,d]=await Promise.all([
    storeReviewFile(db,{exerciseId,jobId,phase:"start",file:start}),
    storeReviewFile(db,{exerciseId,jobId,phase:"final",file:final}),
    storeReviewFile(db,{exerciseId,jobId,phase:"delivery",file:delivery}),
  ]);
  return json({ok:true,staged:true,job_id:jobId,exercise_id:exerciseId,bucket:REVIEW_BUCKET,staging:{start_path:s.path,start_sha256:s.sha256,final_path:f.path,final_sha256:f.sha256,delivery_path:d.path,delivery_sha256:d.sha256}});
}
function validateStaging(value:any,jobId:string,exerciseId:string,candidateSha:string){
  if(!value||typeof value!=="object"||Array.isArray(value))fail("IBERFIT_AUTO_FACTORY_REVIEW_STAGING_REQUIRED");
  const prefix=`${exerciseId}/${jobId}/`;
  for(const phase of ["start","final","delivery"]){const path=String(value?.[`${phase}_path`]||"");const sha=String(value?.[`${phase}_sha256`]||"").toLowerCase();if(!path.startsWith(prefix)||path.includes("..")||!SHA256.test(sha))fail("IBERFIT_AUTO_FACTORY_REVIEW_STAGING_INVALID");}
  if(String(value.delivery_sha256||"").toLowerCase()!==candidateSha)fail("IBERFIT_AUTO_FACTORY_REVIEW_STAGING_SHA_MISMATCH");
  return value;
}
async function markReview(db:any,body:any,claims:any){
  const jobId=String(body?.job_id||"");const item=body?.item;const metadata=body?.metadata;const qaBiomechanics=body?.qa_biomechanics;const qaVisual=body?.qa_visual;const artifactName=String(body?.artifact_name||"");
  if(!UUID.test(jobId))fail("IBERFIT_AUTO_FACTORY_REVIEW_JOB_ID_INVALID");
  const runId=String(claims?.run_id||"");const workflowSha=String(claims?.sha||"");const expectedArtifact=`iberfit-exercise-media-auto-factory-${runId}`;
  if(!runId||!workflowSha||artifactName!==expectedArtifact||artifactName.length>MAX_ARTIFACT_NAME)fail("IBERFIT_AUTO_FACTORY_REVIEW_ARTIFACT_INVALID");
  const id=String(item?.exercise_id||"");if(!SAFE_ID.test(id))fail("IBERFIT_AUTO_FACTORY_EXERCISE_ID_INVALID");
  const jobRes=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts,visual_spec,output_manifest").eq("id",jobId).eq("exercise_id",id).maybeSingle();
  if(jobRes.error||!jobRes.data)fail("IBERFIT_AUTO_FACTORY_JOB_NOT_FOUND",404);
  const job=jobRes.data;
  if(String(job?.visual_spec?.run_id||"")!==runId||String(job?.visual_spec?.workflow_sha||"")!==workflowSha||job?.visual_spec?.visualSystem!==SYSTEM_V1)fail("IBERFIT_AUTO_FACTORY_REVIEW_JOB_PROVENANCE_INVALID",409);
  const inferred=job?.visual_spec?.inferredAnatomy===true;
  const candidate=validateReviewCandidate(item,metadata,qaBiomechanics,qaVisual,inferred);
  const staging=validateStaging(body?.staging,jobId,id,candidate.sha);
  if(job.status==="qa"){
    const existingSha=String(job?.output_manifest?.proof?.delivery_sha256||"").toLowerCase();
    if(existingSha===candidate.sha)return json({ok:true,review_ready:true,idempotent:true,status:"qa",exercise_id:id,job_id:jobId,artifact_name:artifactName,sha256:candidate.sha});
    fail("IBERFIT_AUTO_FACTORY_REVIEW_CONFLICT",409);
  }
  if(job.status!=="generating")fail("IBERFIT_AUTO_FACTORY_REVIEW_STATE_INVALID",409);
  const reviewSpec={...job.visual_spec,review:{schema:"iberfit.exercise.media.review-candidate.v1",state:"awaiting_human_approval",artifact_name:artifactName,run_id:runId,workflow_sha:workflowSha,sha256:candidate.sha,path:candidate.storagePath,automatic_qa:"passed",biomechanics_confidence:Number(qaBiomechanics.confidence),visual_confidence:Number(qaVisual.confidence),human_approved:false,staging}};
  const now=new Date().toISOString();
  const update=await db.from("exercise_media_jobs").update({status:"qa",visual_spec:reviewSpec,output_manifest:item,last_error:null,completed_at:now,updated_at:now}).eq("id",jobId).eq("exercise_id",id).eq("status","generating").select("id,status").maybeSingle();
  if(update.error||!update.data)fail(`IBERFIT_AUTO_FACTORY_REVIEW_UPDATE_FAILED:${update.error?.message||"no_row"}`,502);
  return json({ok:true,review_ready:true,idempotent:false,status:"qa",exercise_id:id,job_id:jobId,artifact_name:artifactName,sha256:candidate.sha,confidence:{biomechanics:Number(qaBiomechanics.confidence),visual:Number(qaVisual.confidence)},inferred_anatomy:inferred});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    const claims=await authenticate(req);const db=serviceClient();const contentType=req.headers.get("content-type")||"";
    if(contentType.startsWith("multipart/form-data")){
      requireWorkflow(claims,EXPECTED_PROCESS_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROCESS_WORKFLOW_FORBIDDEN");
      const form=await req.formData();const action=String(form.get("action")||"");
      if(action==="stage_review")return await stageReview(db,form,claims);
      fail("IBERFIT_AUTO_FACTORY_DIRECT_PUBLISH_DISABLED",403);
    }
    const body=await req.json();const action=String(body?.action||"");const mode=String(body?.mode||"normal");
    if(!["normal","human_regeneration"].includes(mode))fail("IBERFIT_AUTO_FACTORY_MODE_INVALID");
    if(action==="probe"){
      requireWorkflow(claims,EXPECTED_PROBE_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROBE_WORKFLOW_FORBIDDEN");
      return json({ok:true,probe:true,schema:"iberfit.exercise.media.auto-factory.probe.v3",project_ref:PROD_REF,repository:String(claims.repository||""),ref:String(claims.ref||""),workflow_ref:String(claims.workflow_ref||""),run_id:String(claims.run_id||""),sha:String(claims.sha||"")});
    }
    if(String(claims?.workflow_ref||"")===EXPECTED_REGEN_WORKFLOW_REF){
      if(action!=="peek"||mode!=="human_regeneration")fail("IBERFIT_AUTO_FACTORY_REGEN_WORKFLOW_FORBIDDEN",403);
      return await peek(db,mode);
    }
    requireWorkflow(claims,EXPECTED_PROCESS_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROCESS_WORKFLOW_FORBIDDEN");
    if(action==="peek")return await peek(db,mode);
    if(action==="claim")return await claim(db,claims,mode);
    if(action==="review")return await markReview(db,body,claims);
    if(action==="defer")return await markDeferred(db,body);
    if(action==="fail")return await markFailed(db,body);
    fail("IBERFIT_AUTO_FACTORY_ACTION_INVALID");
  }catch(error:any){const message=safeError(error?.message||error);const status=Number(error?.status)||(/JWT|signature|issuer|audience/i.test(message)?401:400);return json({ok:false,error:message},status);}
});
