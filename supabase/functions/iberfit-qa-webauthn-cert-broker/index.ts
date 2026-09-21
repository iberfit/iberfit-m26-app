import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.4";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";

const QA_REF="gjztkdwfmunnzhtvxrsu";
const TARGET_USER_ID="d381eb97-6c53-40e0-b0dc-916dd06bcd35";
const TARGET_EMAIL="qa.rc74.coach@iberfit.cl";
const ORG_ID="00000000-0000-4000-8000-000000000140";
const AUDIENCE="iberfit-webauthn-qa-cert";
const EXPECTED_REPOSITORY="iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID="1306074388";
const EXPECTED_REF="refs/heads/canary/rc74-4";
const EXPECTED_WORKFLOW_REF="iberfit/iberfit-m26-app/.github/workflows/coach-webauthn-recurring.yml@refs/heads/canary/rc74-4";
const SHA40=/^[0-9a-f]{40}$/u;
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});}
function fail(code:string,status=400):never{throw Object.assign(new Error(code),{status});}
function projectRef(value:string){try{return new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1]||"";}catch{return "";}}
function bearer(req:Request){
  const value=String(req.headers.get("authorization")||"");
  if(!value.startsWith("Bearer "))fail("IBERFIT_QA_CERT_OIDC_REQUIRED",401);
  const token=value.slice(7).trim();
  if(token.length<100||token.length>20_000)fail("IBERFIT_QA_CERT_OIDC_INVALID",401);
  return token;
}
async function parseBody(req:Request){
  const raw=await req.text();
  if(raw.length<2||raw.length>10_000)fail("IBERFIT_QA_CERT_BODY_INVALID");
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw);}catch{fail("IBERFIT_QA_CERT_BODY_INVALID");}
  const action=String(body.action||"").trim();
  const sourceSha=String(body.sourceSha||"").trim().toLowerCase();
  const runId=String(body.runId||"").trim();
  if(action!=="reset")fail("IBERFIT_QA_CERT_ACTION_INVALID");
  if(!SHA40.test(sourceSha))fail("IBERFIT_QA_CERT_SOURCE_SHA_INVALID");
  if(!/^\d{1,20}$/u.test(runId))fail("IBERFIT_QA_CERT_RUN_ID_INVALID");
  return {sourceSha,runId};
}
async function authenticate(req:Request,body:{sourceSha:string;runId:string}){
  const {payload}=await jwtVerify(bearer(req),JWKS,{issuer:"https://token.actions.githubusercontent.com",audience:AUDIENCE});
  if(payload.repository!==EXPECTED_REPOSITORY||String(payload.repository_id||"")!==EXPECTED_REPOSITORY_ID)fail("IBERFIT_QA_CERT_REPOSITORY_FORBIDDEN",403);
  if(payload.ref!==EXPECTED_REF)fail("IBERFIT_QA_CERT_REF_FORBIDDEN",403);
  if(payload.workflow_ref!==EXPECTED_WORKFLOW_REF)fail("IBERFIT_QA_CERT_WORKFLOW_FORBIDDEN",403);
  if(!["push","workflow_dispatch"].includes(String(payload.event_name||"")))fail("IBERFIT_QA_CERT_EVENT_FORBIDDEN",403);
  if(payload.runner_environment&&payload.runner_environment!=="github-hosted")fail("IBERFIT_QA_CERT_RUNNER_FORBIDDEN",403);
  if(String(payload.sha||"").toLowerCase()!==body.sourceSha)fail("IBERFIT_QA_CERT_SHA_MISMATCH",403);
  if(String(payload.run_id||"")!==body.runId)fail("IBERFIT_QA_CERT_RUN_MISMATCH",403);
  return payload;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json(405,{ok:false,code:"IBERFIT_QA_CERT_METHOD_NOT_ALLOWED"});
  try{
    const supabaseUrl=String(Deno.env.get("SUPABASE_URL")||"").trim();
    const serviceRole=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
    if(projectRef(supabaseUrl)!==QA_REF||serviceRole.length<20)fail("IBERFIT_QA_CERT_QA_ENV_REQUIRED",500);
    const body=await parseBody(req);
    const claims=await authenticate(req,body);
    const db=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await db.auth.admin.getUserById(TARGET_USER_ID);
    if(userError||String(userData?.user?.email||"").toLowerCase()!==TARGET_EMAIL)fail("IBERFIT_QA_CERT_TARGET_INVALID",409);
    const [{data:profile,error:profileError},{data:membership,error:membershipError},{count:assignments,error:assignmentError}]=await Promise.all([
      db.from("user_profiles").select("role").eq("user_id",TARGET_USER_ID).maybeSingle(),
      db.from("iberfit_organization_memberships").select("status").eq("organization_id",ORG_ID).eq("user_id",TARGET_USER_ID).maybeSingle(),
      db.from("iberfit_coach_client_assignments").select("id",{count:"exact",head:true}).eq("coach_user_id",TARGET_USER_ID),
    ]);
    if(profileError||String(profile?.role||"")!=="coach")fail("IBERFIT_QA_CERT_TARGET_ROLE_INVALID",409);
    if(membershipError||String(membership?.status||"")!=="active")fail("IBERFIT_QA_CERT_TARGET_MEMBERSHIP_INVALID",409);
    if(assignmentError||Number(assignments||0)!==0)fail("IBERFIT_QA_CERT_TARGET_ASSIGNMENTS_PRESENT",409);
    const now=new Date().toISOString();
    const credentials=await db.from("iberfit_webauthn_credentials_v1").update({revoked_at:now}).eq("user_id",TARGET_USER_ID).is("revoked_at",null).select("id");
    if(credentials.error)fail("IBERFIT_QA_CERT_CREDENTIAL_RESET_FAILED",502);
    const challenges=await db.from("iberfit_webauthn_challenges_v1").delete().eq("user_id",TARGET_USER_ID).select("id");
    if(challenges.error)fail("IBERFIT_QA_CERT_CHALLENGE_RESET_FAILED",502);
    const assurance=await db.from("iberfit_privileged_assurance_v1").update({revoked_at:now}).eq("user_id",TARGET_USER_ID).is("revoked_at",null).select("session_id");
    if(assurance.error)fail("IBERFIT_QA_CERT_ASSURANCE_RESET_FAILED",502);
    const emailAssurance=await db.from("iberfit_email_privileged_assurance_v1").update({revoked_at:now}).eq("user_id",TARGET_USER_ID).is("revoked_at",null).select("otp_session_id");
    if(emailAssurance.error)fail("IBERFIT_QA_CERT_EMAIL_ASSURANCE_RESET_FAILED",502);
    return json(200,{ok:true,action:"reset",target:TARGET_EMAIL,credentialsRevoked:credentials.data?.length||0,challengesDeleted:challenges.data?.length||0,assuranceRevoked:assurance.data?.length||0,emailAssuranceRevoked:emailAssurance.data?.length||0,runId:String(claims.run_id||"")});
  }catch(error:any){
    const message=String(error?.message||error||"IBERFIT_QA_CERT_FAILED");
    const status=Number(error?.status)||(/JWT|signature|issuer|audience|OIDC/i.test(message)?401:400);
    console.error(`[IBERFIT_QA_WEBAUTHN_CERT] ${message}`);
    return json(status,{ok:false,code:message});
  }
});
