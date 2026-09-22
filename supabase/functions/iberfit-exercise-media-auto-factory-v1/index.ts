import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const PROD_REF="pjhmrhejsoofmouedavw";
const BUCKET="iberfit-exercise-media";
const SYSTEM_V1="iberfit.exercise.media.system.v1";
const STYLE="iberfit-premium-movement-pair-v1";
const AUDIENCE="iberfit-exercise-media-auto-factory";
const EXPECTED_REPOSITORY="iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID="1306074388";
const EXPECTED_REF="refs/heads/canary/rc74-4";
const EXPECTED_PROCESS_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/exercise-media-auto-factory.yml@refs/heads/canary/rc74-4";
const EXPECTED_PROBE_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/remote-gates.yml@refs/heads/canary/rc74-4";
const OFFICIAL_ISOTIPO_SHA256="d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa";
const APPROVED_MASTER_SHA256="b74f8de6b50e484fa11b5d6c928b681d4b63451ad5909d81630123603e44e0bb";
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_FILE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.webp$/u;
const SHA256=/^[0-9a-f]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BYTES=5_000_000;
const BASE_MIN_CONFIDENCE=0.97;
const INFERRED_ANATOMY_MIN_CONFIDENCE=0.985;
const RETRY_AFTER_MS=6*60*60*1000;
const STALE_ACTIVE_MS=2*60*60*1000;
const MAX_ATTEMPTS=3;
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function safeError(value:unknown){return String(value||"UNKNOWN").replace(/[\r\n\t]+/g," ").slice(0,800);}
function serviceClient(){
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url.includes(PROD_REF)||key.length<20)fail("IBERFIT_AUTO_FACTORY_PROD_ENV_INVALID",500);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{"x-client-info":"iberfit-exercise-media-auto-factory/1"}}});
}
async function authenticate(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))fail("IBERFIT_AUTO_FACTORY_OIDC_REQUIRED",401);
  const {payload}=await jwtVerify(auth.slice(7).trim(),JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
  if(payload.repository!==EXPECTED_REPOSITORY||String(payload.repository_id||"")!==EXPECTED_REPOSITORY_ID)fail("IBERFIT_AUTO_FACTORY_REPOSITORY_FORBIDDEN",403);
  if(payload.ref!==EXPECTED_REF)fail("IBERFIT_AUTO_FACTORY_REF_FORBIDDEN",403);
  const workflowRef=String(payload.workflow_ref||"");
  if(![EXPECTED_PROCESS_WORKFLOW_REF,EXPECTED_PROBE_WORKFLOW_REF].includes(workflowRef))fail("IBERFIT_AUTO_FACTORY_WORKFLOW_FORBIDDEN",403);
  if(!["workflow_dispatch","workflow_call"].includes(String(payload.event_name||"")))fail("IBERFIT_AUTO_FACTORY_EVENT_FORBIDDEN",403);
  if(payload.runner_environment&&payload.runner_environment!=="github-hosted")fail("IBERFIT_AUTO_FACTORY_RUNNER_FORBIDDEN",403);
  return payload;
}
function requireWorkflow(claims:any,expected:string,error:string){if(String(claims?.workflow_ref||"")!==expected)fail(error,403);}
function isSystemV1(media:any){return media&&typeof media==="object"&&(media.visualSystem===SYSTEM_V1||media.visual_system===SYSTEM_V1);}
function isGenericMuscle(value:string){return ["movilidad","global","músculo objetivo"].includes(String(value||"").trim().toLowerCase());}
function latestByExercise(rows:any[]){const map=new Map<string,any>();for(const row of rows||[]){if(!map.has(String(row.exercise_id||"")))map.set(String(row.exercise_id||""),row);}return map;}
async function claim(db:any,claims:any){
  const staleBefore=new Date(Date.now()-STALE_ACTIVE_MS).toISOString();
  await db.from("exercise_media_jobs").update({status:"failed",last_error:"AUTO_FACTORY_STALE_RECOVERY",completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in("status",["generating","qa"]).lt("updated_at",staleBefore);
  const catalogRes=await db.from("exercise_catalog").select("id,name_es,pattern,intent,equipment,difficulty,primary_muscles,secondary_muscles,cues,instructions_es,precautions,tags,media_status,media,review_status,active").eq("active",true).neq("review_status","retirado").order("id",{ascending:true}).limit(1000);
  if(catalogRes.error)fail(`IBERFIT_AUTO_FACTORY_CATALOG_READ_FAILED:${catalogRes.error.message}`,502);
  const jobsRes=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts,last_error,updated_at").order("updated_at",{ascending:false}).limit(5000);
  if(jobsRes.error)fail(`IBERFIT_AUTO_FACTORY_JOBS_READ_FAILED:${jobsRes.error.message}`,502);
  const latest=latestByExercise(jobsRes.data||[]);
  const now=Date.now();
  const candidates=(catalogRes.data||[]).filter((exercise:any)=>{
    if(isSystemV1(exercise.media))return false;
    const job=latest.get(exercise.id);
    if(!job)return true;
    if(["generating","qa","ready","blocked"].includes(job.status))return false;
    if(job.status==="failed"){
      if(Number(job.attempts||0)>=MAX_ATTEMPTS)return false;
      const updated=Date.parse(String(job.updated_at||""));
      return !Number.isFinite(updated)||now-updated>=RETRY_AFTER_MS;
    }
    return true;
  }).sort((a:any,b:any)=>Number(a.media_status==="aprobado")-Number(b.media_status==="aprobado")||String(a.id).localeCompare(String(b.id)));
  if(!candidates.length){
    const remaining=(catalogRes.data||[]).filter((x:any)=>!isSystemV1(x.media)).length;
    const blocked=[...(latest.values())].filter((x:any)=>x.status==="blocked").length;
    return json({ok:true,done:remaining===0,claim:null,remaining,blocked,system_v1:(catalogRes.data||[]).length-remaining});
  }
  for(const exercise of candidates.slice(0,12)){
    const previous=latest.get(exercise.id);
    const inferredAnatomy=Array.isArray(exercise.primary_muscles)&&exercise.primary_muscles.some((m:string)=>isGenericMuscle(m));
    const visualSpec={schema:"iberfit.exercise.media.auto-job.v1",visualSystem:SYSTEM_V1,inferredAnatomy,run_id:String(claims.run_id||""),workflow_sha:String(claims.sha||"")};
    let job:any=null;
    if(previous?.status==="failed"){
      const update=await db.from("exercise_media_jobs").update({status:"generating",attempts:Number(previous.attempts||0)+1,visual_spec:visualSpec,last_error:null,locked_at:new Date().toISOString(),completed_at:null,updated_at:new Date().toISOString()}).eq("id",previous.id).eq("status","failed").select("id,exercise_id,status,attempts,visual_spec").maybeSingle();
      if(!update.error&&update.data)job=update.data;
    }else{
      const insert=await db.from("exercise_media_jobs").insert({exercise_id:exercise.id,status:"generating",attempts:1,visual_spec:visualSpec,locked_at:new Date().toISOString()}).select("id,exercise_id,status,attempts,visual_spec").maybeSingle();
      if(!insert.error&&insert.data)job=insert.data;
    }
    if(job)return json({ok:true,done:false,claim:{job,exercise,inferred_anatomy:inferredAnatomy}});
  }
  fail("IBERFIT_AUTO_FACTORY_CLAIM_RACE",409);
}
async function markFailed(db:any,body:any){
  const jobId=String(body?.job_id||"");const exerciseId=String(body?.exercise_id||"");
  if(!UUID.test(jobId)||!SAFE_ID.test(exerciseId))fail("IBERFIT_AUTO_FACTORY_FAIL_ID_INVALID");
  const read=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts").eq("id",jobId).eq("exercise_id",exerciseId).maybeSingle();
  if(read.error||!read.data)fail("IBERFIT_AUTO_FACTORY_JOB_NOT_FOUND",404);
  const blocked=Number(read.data.attempts||0)>=MAX_ATTEMPTS;
  const update=await db.from("exercise_media_jobs").update({status:blocked?"blocked":"failed",last_error:safeError(body?.error),completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).eq("exercise_id",exerciseId);
  if(update.error)fail(`IBERFIT_AUTO_FACTORY_FAIL_UPDATE_FAILED:${update.error.message}`,502);
  return json({ok:true,job_id:jobId,exercise_id:exerciseId,status:blocked?"blocked":"failed",attempts:read.data.attempts});
}
function webpDimensions(bytes:Uint8Array){
  const b=bytes;
  const ascii=(start:number,end:number)=>String.fromCharCode(...b.slice(start,end));
  if(b.length<30||ascii(0,4)!=="RIFF"||ascii(8,12)!=="WEBP")fail("IBERFIT_AUTO_FACTORY_WEBP_INVALID");
  let i=12;
  while(i+8<=b.length){const type=ascii(i,i+4);const n=b[i+4]|(b[i+5]<<8)|(b[i+6]<<16)|(b[i+7]<<24);const d=i+8;if(d+n>b.length)fail("IBERFIT_AUTO_FACTORY_WEBP_CHUNK_INVALID");if(type==="VP8X"&&n>=10)return{width:1+b[d+4]+(b[d+5]<<8)+(b[d+6]<<16),height:1+b[d+7]+(b[d+8]<<8)+(b[d+9]<<16)};if(type==="VP8L"&&n>=5&&b[d]===0x2f){const b1=b[d+1],b2=b[d+2],b3=b[d+3],b4=b[d+4];return{width:1+(b1|((b2&0x3f)<<8)),height:1+((b2>>6)|(b3<<2)|((b4&0x0f)<<10))};}if(type==="VP8 "&&n>=10&&b[d+3]===0x9d&&b[d+4]===1&&b[d+5]===0x2a)return{width:(b[d+6]|(b[d+7]<<8))&0x3fff,height:(b[d+8]|(b[d+9]<<8))&0x3fff};i=d+n+(n%2);}fail("IBERFIT_AUTO_FACTORY_WEBP_DIMENSIONS_MISSING");
}
async function digestHex(bytes:Uint8Array){const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map((b)=>b.toString(16).padStart(2,"0")).join("");}
function parseJsonField(form:FormData,name:string){const raw=String(form.get(name)||"");try{return JSON.parse(raw);}catch{fail(`IBERFIT_AUTO_FACTORY_${name.toUpperCase()}_JSON_INVALID`);}}
function validateQa(report:any,mode:string,minConfidence:number){
  if(report?.schema!=="iberfit.exercise.media.auto.qa.v1"||report?.mode!==mode||report?.pass!==true)fail(`IBERFIT_AUTO_FACTORY_QA_${mode.toUpperCase()}_INVALID`);
  if(!Number.isFinite(Number(report.confidence))||Number(report.confidence)<minConfidence)fail(`IBERFIT_AUTO_FACTORY_QA_${mode.toUpperCase()}_CONFIDENCE`);
  if(mode==="visual"&&report?.checks?.muscle_target_match!==true)fail("IBERFIT_AUTO_FACTORY_QA_MUSCLE_TARGET_INVALID");
}
async function publish(db:any,form:FormData,claims:any){
  const jobId=String(form.get("job_id")||"");const item=parseJsonField(form,"item");const metadata=parseJsonField(form,"metadata");const qaBiomechanics=parseJsonField(form,"qa_biomechanics");const qaVisual=parseJsonField(form,"qa_visual");const file=form.get("file");
  if(!UUID.test(jobId)||!(file instanceof File))fail("IBERFIT_AUTO_FACTORY_PUBLISH_INPUT_INVALID");
  const id=String(item?.exercise_id||"");if(!SAFE_ID.test(id))fail("IBERFIT_AUTO_FACTORY_EXERCISE_ID_INVALID");
  const jobRes=await db.from("exercise_media_jobs").select("id,exercise_id,status,attempts,visual_spec").eq("id",jobId).eq("exercise_id",id).maybeSingle();
  if(jobRes.error||!jobRes.data||!["generating","qa"].includes(jobRes.data.status))fail("IBERFIT_AUTO_FACTORY_JOB_STATE_INVALID",409);
  const inferred=jobRes.data?.visual_spec?.inferredAnatomy===true;
  const minConfidence=inferred?INFERRED_ANATOMY_MIN_CONFIDENCE:BASE_MIN_CONFIDENCE;
  validateQa(qaBiomechanics,"biomechanics",minConfidence);validateQa(qaVisual,"visual",minConfidence);
  if(item?.human_approved!==false||item?.publishable!==true||item?.approval?.method!=="automatic_dual_gate_v1"||item?.approval?.automatic_qa!=="passed")fail("IBERFIT_AUTO_FACTORY_APPROVAL_INVALID");
  if(item?.approval?.visual_system!==SYSTEM_V1||Boolean(item?.approval?.anatomy_inferred)!==inferred)fail("IBERFIT_AUTO_FACTORY_APPROVAL_SYSTEM_INVALID");
  if(metadata?.visual_system!==SYSTEM_V1||metadata?.branding?.official_isotipo_sha256!==OFFICIAL_ISOTIPO_SHA256||metadata?.identity_master_sha256!==APPROVED_MASTER_SHA256)fail("IBERFIT_AUTO_FACTORY_METADATA_PROOF_INVALID");
  if(metadata?.master?.width!==1280||metadata?.master?.height!==1600||metadata?.delivery?.width!==640||metadata?.delivery?.height!==800||metadata?.publishable!==false)fail("IBERFIT_AUTO_FACTORY_METADATA_DIMENSIONS_INVALID");
  const media=item?.media;const movement=media?.movement;
  if(media?.schema!=="iberfit.exercise.visual.v1"||media?.style!==STYLE||media?.visualSystem!==SYSTEM_V1||media?.bucket!==BUCKET||media?.published!==true||media?.qa?.biomechanics!=="approved"||media?.qa?.visual!=="approved"||media?.clientVisible!==true||media?.coachVisible!==true)fail("IBERFIT_AUTO_FACTORY_MEDIA_INVALID");
  const path=String(movement?.path||"");const parts=path.split("/");const sha=String(movement?.sha256||"").toLowerCase();
  if(parts.length!==2||parts[0]!==id||!SAFE_FILE.test(parts[1])||path.includes("..")||!SHA256.test(sha)||!parts[1].includes(sha.slice(0,12)))fail("IBERFIT_AUTO_FACTORY_STORAGE_PATH_INVALID");
  if(file.type!=="image/webp"||file.size<100||file.size>MAX_BYTES)fail("IBERFIT_AUTO_FACTORY_FILE_INVALID");
  const bytes=new Uint8Array(await file.arrayBuffer());const actualSha=await digestHex(bytes);if(actualSha!==sha)fail("IBERFIT_AUTO_FACTORY_FILE_SHA_MISMATCH");
  const dims=webpDimensions(bytes);if(dims.width!==640||dims.height!==800||Number(movement?.width)!==640||Number(movement?.height)!==800)fail("IBERFIT_AUTO_FACTORY_FILE_DIMENSIONS_INVALID");
  await db.from("exercise_media_jobs").update({status:"qa",updated_at:new Date().toISOString()}).eq("id",jobId).eq("exercise_id",id);
  const [folder,filename]=path.split("/");const list=await db.storage.from(BUCKET).list(folder,{limit:100,search:filename,sortBy:{column:"name",order:"asc"}});if(list.error)fail(`IBERFIT_AUTO_FACTORY_STORAGE_LIST_FAILED:${list.error.message}`,502);
  const exists=(list.data||[]).some((x:any)=>x.name===filename);let uploaded=false;
  if(exists){const current=await db.storage.from(BUCKET).download(path);if(current.error||!current.data)fail("IBERFIT_AUTO_FACTORY_EXISTING_READ_FAILED",502);const existingSha=await digestHex(new Uint8Array(await current.data.arrayBuffer()));if(existingSha!==sha)fail("IBERFIT_AUTO_FACTORY_EXISTING_CONFLICT",409);}else{const up=await db.storage.from(BUCKET).upload(path,bytes,{cacheControl:"31536000",contentType:"image/webp",upsert:false});if(up.error)fail(`IBERFIT_AUTO_FACTORY_UPLOAD_FAILED:${up.error.message}`,502);uploaded=true;}
  const verify=await db.storage.from(BUCKET).download(path);if(verify.error||!verify.data){if(uploaded)await db.storage.from(BUCKET).remove([path]);fail("IBERFIT_AUTO_FACTORY_UPLOAD_VERIFY_FAILED",502);}const storedSha=await digestHex(new Uint8Array(await verify.data.arrayBuffer()));if(storedSha!==sha){if(uploaded)await db.storage.from(BUCKET).remove([path]);fail("IBERFIT_AUTO_FACTORY_STORED_SHA_MISMATCH",502);}
  const finalized=await db.rpc("iberfit_finalize_exercise_media_system_v1",{p_exercise_id:id,p_manifest:media});
  if(finalized.error||finalized.data?.ok!==true||finalized.data?.mediaStatus!=="aprobado"){if(uploaded)await db.storage.from(BUCKET).remove([path]);fail(`IBERFIT_AUTO_FACTORY_FINALIZE_FAILED:${finalized.error?.message||"invalid_response"}`,502);}
  const update=await db.from("exercise_media_jobs").update({status:"ready",output_manifest:media,last_error:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",jobId).eq("exercise_id",id);if(update.error)fail(`IBERFIT_AUTO_FACTORY_JOB_COMPLETE_FAILED:${update.error.message}`,502);
  const publicUrl=db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return json({ok:true,published:true,exercise_id:id,job_id:jobId,path,sha256:sha,public_url:publicUrl,confidence:{biomechanics:Number(qaBiomechanics.confidence),visual:Number(qaVisual.confidence)},inferred_anatomy:inferred,run_id:String(claims.run_id||"")});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    const claims=await authenticate(req);const db=serviceClient();const contentType=req.headers.get("content-type")||"";
    if(contentType.startsWith("multipart/form-data")){
      requireWorkflow(claims,EXPECTED_PROCESS_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROCESS_WORKFLOW_FORBIDDEN");
      const form=await req.formData();if(String(form.get("action")||"")!=="publish")fail("IBERFIT_AUTO_FACTORY_MULTIPART_ACTION_INVALID");return await publish(db,form,claims);
    }
    const body=await req.json();const action=String(body?.action||"");
    if(action==="probe"){
      requireWorkflow(claims,EXPECTED_PROBE_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROBE_WORKFLOW_FORBIDDEN");
      return json({ok:true,probe:true,schema:"iberfit.exercise.media.auto-factory.probe.v1",project_ref:PROD_REF,repository:String(claims.repository||""),ref:String(claims.ref||""),workflow_ref:String(claims.workflow_ref||""),run_id:String(claims.run_id||""),sha:String(claims.sha||"")});
    }
    requireWorkflow(claims,EXPECTED_PROCESS_WORKFLOW_REF,"IBERFIT_AUTO_FACTORY_PROCESS_WORKFLOW_FORBIDDEN");
    if(action==="claim")return await claim(db,claims);
    if(action==="fail")return await markFailed(db,body);
    fail("IBERFIT_AUTO_FACTORY_ACTION_INVALID");
  }catch(error:any){const message=safeError(error?.message||error);const status=Number(error?.status)||(/JWT|signature|issuer|audience/i.test(message)?401:400);return json({ok:false,error:message},status);}
});