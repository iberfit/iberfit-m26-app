import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.4";
import {PDFDocument,StandardFonts,rgb} from "npm:pdf-lib@1.17.1";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";

const QA_REF="gjztkdwfmunnzhtvxrsu";
const EXPECTED_REPOSITORY="iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID="1306074388";
const EXPECTED_WORKFLOW_PATH="iberfit/iberfit-m26-app/.github/workflows/qa-real-write-cert.yml";
const CANARY_REF="refs/heads/canary/rc74-4";
const OIDC_AUDIENCE="iberfit-iri-document-qa-fixture";
const CLIENT_ID="57f56a87-d04e-47d5-b1cc-8d4939d7c804";
const ASSESSMENT_ID="7a000000-0000-4000-8000-000000000001";
const COACH_USER_ID="d381eb97-6c53-40e0-b0dc-916dd06bcd35";
const BUCKET="iberfit-iri-external-reports";
const OBJECT_PATH=CLIENT_ID+"/"+ASSESSMENT_ID+"/bioimpedancia";
const FILE_NAME="qa-bioimpedancia-sintetica.pdf";
const SHA40=/^[0-9a-f]{40}$/u;
const PULL_REF=/^refs\/pull\/\d+\/merge$/u;
const JWKS=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function response(status:number,body:unknown){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "x-content-type-options":"nosniff",
    },
  });
}
function fail(code:string,status=400):never{throw Object.assign(new Error(code),{status});}
function projectRef(value:string){
  try{return new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1]||"";}catch{return "";}
}
function bearer(req:Request){
  const raw=String(req.headers.get("authorization")||"");
  if(!raw.startsWith("Bearer "))fail("IRI_QA_FIXTURE_OIDC_REQUIRED",401);
  const token=raw.slice(7).trim();
  if(token.length<100||token.length>20_000)fail("IRI_QA_FIXTURE_OIDC_INVALID",401);
  return token;
}
async function parseBody(req:Request){
  const raw=await req.text();
  if(raw.length<2||raw.length>4000)fail("IRI_QA_FIXTURE_BODY_INVALID");
  let body:Record<string,unknown>;
  try{body=JSON.parse(raw);}catch{fail("IRI_QA_FIXTURE_BODY_INVALID");}
  const action=String(body.action||"").trim().toLowerCase();
  const sourceSha=String(body.sourceSha||"").trim().toLowerCase();
  const runId=String(body.runId||"").trim();
  if(action!=="seed")fail("IRI_QA_FIXTURE_ACTION_INVALID");
  if(!SHA40.test(sourceSha))fail("IRI_QA_FIXTURE_SOURCE_SHA_INVALID");
  if(!/^\d{1,20}$/u.test(runId))fail("IRI_QA_FIXTURE_RUN_ID_INVALID");
  return {action,sourceSha,runId};
}
function splitWorkflowRef(value:unknown){
  const raw=String(value||"");
  const at=raw.lastIndexOf("@");
  return at>0?{path:raw.slice(0,at),ref:raw.slice(at+1)}:{path:raw,ref:""};
}
async function authenticate(req:Request,body:{sourceSha:string;runId:string}){
  const {payload}=await jwtVerify(bearer(req),JWKS,{
    issuer:"https://token.actions.githubusercontent.com",
    audience:OIDC_AUDIENCE,
  });
  if(payload.repository!==EXPECTED_REPOSITORY||String(payload.repository_id||"")!==EXPECTED_REPOSITORY_ID){
    fail("IRI_QA_FIXTURE_REPOSITORY_FORBIDDEN",403);
  }
  const event=String(payload.event_name||"");
  const ref=String(payload.ref||"");
  const workflow=splitWorkflowRef(payload.workflow_ref);
  if(workflow.path!==EXPECTED_WORKFLOW_PATH)fail("IRI_QA_FIXTURE_WORKFLOW_FORBIDDEN",403);
  if(event==="pull_request"){
    if(!PULL_REF.test(ref))fail("IRI_QA_FIXTURE_REF_FORBIDDEN",403);
    if(workflow.ref!==ref&&workflow.ref!==CANARY_REF)fail("IRI_QA_FIXTURE_WORKFLOW_REF_FORBIDDEN",403);
  }else if(event==="push"||event==="workflow_dispatch"){
    if(ref!==CANARY_REF||workflow.ref!==CANARY_REF)fail("IRI_QA_FIXTURE_REF_FORBIDDEN",403);
  }else{
    fail("IRI_QA_FIXTURE_EVENT_FORBIDDEN",403);
  }
  if(payload.runner_environment&&payload.runner_environment!=="github-hosted")fail("IRI_QA_FIXTURE_RUNNER_FORBIDDEN",403);
  if(String(payload.sha||"").toLowerCase()!==body.sourceSha)fail("IRI_QA_FIXTURE_SHA_MISMATCH",403);
  if(String(payload.run_id||"")!==body.runId)fail("IRI_QA_FIXTURE_RUN_MISMATCH",403);
  return payload;
}
async function syntheticPdf(){
  const doc=await PDFDocument.create();
  doc.setTitle("Bioimpedancia sintética QA · IBERFIT");
  doc.setAuthor("IBERFIT QA");
  doc.setSubject("Fixture sintética para certificación del anexo IRI");
  doc.setCreator("IBERFIT QA document fixture");
  doc.setProducer("pdf-lib");
  const fixed=new Date("2026-10-03T21:50:00Z");
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  const regular=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const dark=rgb(11/255,19/255,16/255);
  const ink=rgb(19/255,34/255,28/255);
  const gold=rgb(197/255,160/255,89/255);
  const cream=rgb(245/255,245/255,240/255);
  const muted=rgb(100/255,116/255,108/255);
  const page=doc.addPage([595.28,841.89]);
  page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:cream});
  page.drawRectangle({x:0,y:775,width:595.28,height:66,color:dark});
  page.drawRectangle({x:0,y:0,width:11,height:841.89,color:gold});
  page.drawText("IBERFIT · BIOIMPEDANCIA",{x:44,y:803,size:10,font:bold,color:gold});
  page.drawText("Informe sintético de certificación QA",{x:44,y:735,size:22,font:bold,color:ink});
  page.drawText("Documento no clínico · no corresponde a una persona real",{x:44,y:710,size:9,font:regular,color:muted});
  const metrics=[
    ["Peso","62,4 kg"],["Grasa corporal","20,6 %"],["Masa libre de grasa","49,5 kg"],
    ["Agua corporal","54,1 %"],["Grasa visceral","5"],["Cintura","72,0 cm"],
  ];
  let y=655;
  for(let i=0;i<metrics.length;i+=1){
    const col=i%2,row=Math.floor(i/2),x=44+col*255,yy=y-row*86;
    page.drawRectangle({x,y:yy-58,width:225,height:58,borderColor:gold,borderWidth:.7});
    page.drawText(metrics[i][0].toUpperCase(),{x:x+12,y:yy-18,size:7,font:bold,color:muted});
    page.drawText(metrics[i][1],{x:x+12,y:yy-43,size:16,font:bold,color:ink});
  }
  page.drawText("Método",{x:44,y:367,size:7,font:bold,color:muted});
  page.drawText("Bioimpedancia segmental · equipo sintético QA",{x:44,y:349,size:10,font:regular,color:ink});
  page.drawText("Condiciones de medición",{x:44,y:310,size:7,font:bold,color:muted});
  page.drawText("Fixture controlada para probar la incorporación del documento original al Informe IRI.",{x:44,y:292,size:9,font:regular,color:ink});
  page.drawText("Este archivo existe únicamente en el entorno QA y no contiene datos personales reales.",{x:44,y:272,size:9,font:regular,color:ink});
  page.drawLine({start:{x:44,y:70},end:{x:551,y:70},thickness:.7,color:gold});
  page.drawText("IBERFIT QA · evidencia sintética privada",{x:44,y:50,size:7,font:regular,color:muted});
  return new Uint8Array(await doc.save({useObjectStreams:true}));
}
async function sha256(bytes:Uint8Array){
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}
async function validateFixtureTarget(db:any){
  const assessment=await db.from("iri_assessments")
    .select("id,client_id,assessment_type,sections")
    .eq("id",ASSESSMENT_ID).maybeSingle();
  if(assessment.error||assessment.data?.client_id!==CLIENT_ID||assessment.data?.assessment_type!=="inicial"){
    fail("IRI_QA_FIXTURE_ASSESSMENT_INVALID",409);
  }
  const marker=JSON.stringify(assessment.data?.sections||{}).toLowerCase();
  if(!marker.includes("fixture sint"))fail("IRI_QA_FIXTURE_SYNTHETIC_MARKER_MISSING",409);
  const user=await db.auth.admin.getUserById(COACH_USER_ID);
  if(user.error||String(user.data?.user?.email||"").toLowerCase()!=="qa.rc74.coach@iberfit.cl"){
    fail("IRI_QA_FIXTURE_COACH_INVALID",409);
  }
}
async function seed(db:any){
  await validateFixtureTarget(db);
  const current=await db.from("iri_external_reports_v26")
    .select("id,assessment_id,object_path,file_name,version")
    .eq("assessment_id",ASSESSMENT_ID).maybeSingle();
  if(current.error)fail("IRI_QA_FIXTURE_EXTERNAL_READ_FAILED",502);
  if(current.data&&(
    current.data.object_path!==OBJECT_PATH||
    (current.data.file_name!==FILE_NAME&&current.data.file_name!=="")
  )){
    fail("IRI_QA_FIXTURE_UNEXPECTED_EXISTING_REPORT",409);
  }

  const pdf=await syntheticPdf();
  const artifactSha256=await sha256(pdf);
  const upload=await db.storage.from(BUCKET).upload(OBJECT_PATH,pdf,{
    contentType:"application/pdf",
    cacheControl:"private, no-store",
    upsert:true,
  });
  if(upload.error)fail("IRI_QA_FIXTURE_STORAGE_UPLOAD_FAILED",502);

  const now=new Date().toISOString();
  if(current.data){
    const update=await db.from("iri_external_reports_v26").update({
      file_name:FILE_NAME,mime_type:"application/pdf",size_bytes:pdf.byteLength,
      visible_to_client:true,uploaded_by:COACH_USER_ID,updated_at:now,
    }).eq("id",current.data.id)
      .select("id,version,file_name,mime_type,size_bytes,visible_to_client").single();
    if(update.error)fail("IRI_QA_FIXTURE_EXTERNAL_UPDATE_FAILED",502);
    return {...update.data,artifactSha256,objectPath:OBJECT_PATH,kind:"updated"};
  }
  const insert=await db.from("iri_external_reports_v26").insert({
    client_id:CLIENT_ID,assessment_id:ASSESSMENT_ID,bucket_id:BUCKET,object_path:OBJECT_PATH,
    file_name:FILE_NAME,mime_type:"application/pdf",size_bytes:pdf.byteLength,
    visible_to_client:true,version:1,uploaded_by:COACH_USER_ID,uploaded_at:now,updated_at:now,
  }).select("id,version,file_name,mime_type,size_bytes,visible_to_client").single();
  if(insert.error)fail("IRI_QA_FIXTURE_EXTERNAL_INSERT_FAILED",502);
  return {...insert.data,artifactSha256,objectPath:OBJECT_PATH,kind:"created"};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return response(405,{ok:false,code:"IRI_QA_FIXTURE_METHOD_NOT_ALLOWED"});
  try{
    const supabaseUrl=String(Deno.env.get("SUPABASE_URL")||"").trim();
    const serviceRole=String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
    if(projectRef(supabaseUrl)!==QA_REF||serviceRole.length<20)fail("IRI_QA_FIXTURE_QA_ENV_REQUIRED",500);
    const body=await parseBody(req);
    const claims=await authenticate(req,body);
    const db=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await seed(db);
    return response(200,{
      ok:true,action:"seed",projectRef:QA_REF,synthetic:true,realPersonData:false,
      assessmentId:ASSESSMENT_ID,clientId:CLIENT_ID,runId:String(claims.run_id||""),...result,
    });
  }catch(error:any){
    const code=String(error?.message||error||"IRI_QA_FIXTURE_FAILED");
    const status=Number(error?.status)||(/OIDC|JWT|signature|issuer|audience/i.test(code)?401:400);
    console.error("[IRI_QA_DOCUMENT_FIXTURE]",code);
    return response(status,{ok:false,code});
  }
});
