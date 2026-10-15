import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import {renderEvolutionReportPdf,M44_PDF_TEMPLATE} from './pdf-renderer.js';

const VERSION='m44-issued-pdf-broker-2026.10-v1';
const BUCKET='iberfit-evolution-issued-reports';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA=/^[0-9a-f]{64}$/iu;
const QA='gjztkdwfmunnzhtvxrsu',PROD='pjhmrhejsoofmouedavw';
const url=Deno.env.get('SUPABASE_URL')||'';
const ref=(()=>{try{return new URL(url).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1]||'';}catch{return '';}})();
function key(primary,legacy){
 const raw=Deno.env.get(primary);
 if(raw){try{const ob=JSON.parse(raw);const value=String(ob.default||Object.values(ob)[0]||'').trim();if(value)return value;}catch{}}
 return String(Deno.env.get(legacy)||'').trim();
}
const allowed=new Set(ref===QA?['https://m26-canary.iberfit.cl']:
 ref===PROD?['https://app.iberfit.cl','https://coach.iberfit.cl']:[]);
const appOrigin=ref===QA?'https://m26-canary.iberfit.cl':ref===PROD?'https://app.iberfit.cl':'';
function uuid(value,label){
 const id=String(value||'').trim();
 if(!UUID.test(id))throw Error(label);
 return id;
}
function headers(origin){
 const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'Vary':'Origin','X-Content-Type-Options':'nosniff','X-IBERFIT-Version':VERSION,
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Max-Age':'600'};
 if(allowed.has(origin))h['Access-Control-Allow-Origin']=origin;
 return h;
}
function result(status,body,origin){return new Response(status===204?null:JSON.stringify(body),{status,headers:headers(origin)});}
async function digest(data){
 const b=typeof data==='string'?new TextEncoder().encode(data):data;
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',b));
 return [...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function code(error){
 const value=String(error?.message||error||'').toUpperCase();
 return value.match(/\b(?:M44|IBERFIT)_?[A-Z0-9_:-]{4,90}\b/u)?.[0]||'M44_PDF_BROKER_ERROR';
}
function clients(auth){
 const publishable=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const secret=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 if(!publishable||!secret||!url)throw Error('M44_PDF_BROKER_CONFIG_MISSING');
 return {
  user:createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false},
   global:{headers:{Authorization:auth}}}),
  service:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),
 };
}
async function signed(service,path){
 const response=await service.storage.from(BUCKET).createSignedUrl(path,120);
 if(response.error||!response.data?.signedUrl)throw Error('M44_PDF_SIGNED_URL_FAILED');
 return response.data.signedUrl;
}
async function logoBytes(){
 try{
  const res=await fetch(appOrigin+'/public/isotipo-iberfit.png',{signal:AbortSignal.timeout(4500)});
  if(!res.ok||Number(res.headers.get('content-length')||0)>250_000)return null;
  const buf=new Uint8Array(await res.arrayBuffer());
  return buf.length>100&&buf.length<250_000?buf:null;
 }catch{return null;}
}
async function issue({user,service,actor,body}){
 const id=uuid(body.reportId,'M44_PDF_REPORT_ID_INVALID');
 const requestId=body.issueRequestId?uuid(body.issueRequestId,'M44_PDF_REQUEST_ID_INVALID'):crypto.randomUUID();
 // User-scoped prepare is the source of truth; browser supplies no content.
 const pre=await user.rpc('iberfit_m44_prepare_evolution_report_issue_v1',{p_report_id:id});
 if(pre.error)throw pre.error;
 const src=pre.data;
 if(!src?.ok||src.reportId!==id||!SHA.test(src.sourceSha256)||
    src.artifactBucket!==BUCKET||src.sourceSnapshot?.reportId!==id)
  throw Error('M44_PDF_SOURCE_AUTHORIZATION_INVALID');
 const prior=await service.from('iberfit_evolution_report_issuances_v1')
  .select('id,report_id,report_revision,source_sha256,artifact_path,artifact_sha256,status,version')
  .eq('issue_request_id',requestId).maybeSingle();
 if(prior.error)throw prior.error;
 if(prior.data){
  const previous=prior.data;
  if(previous.report_id!==id||previous.report_revision!==Number(src.sourceRevision)||
     previous.source_sha256!==src.sourceSha256||previous.status!=='issued')
   throw Error('M44_PDF_ISSUE_REPLAY_COLLISION');
  return {kind:'already-issued',issuanceId:previous.id,version:previous.version,
   artifactSha256:previous.artifact_sha256,signedUrl:await signed(service,previous.artifact_path),
   expiresIn:120};
 }
 const rendered=await renderEvolutionReportPdf({
  source:src.sourceSnapshot,pdfLib:{PDFDocument,StandardFonts,rgb},
  brandImageBytes:await logoBytes(),generatedAt:new Date().toISOString(),
 });
 const bytes=rendered.bytes;
 if(!(bytes instanceof Uint8Array)||bytes.length<1024||bytes.length>20*1024*1024)
  throw Error('M44_PDF_RENDER_BYTES_INVALID');
 // Compute independently after generation and after storage download.
 const hash=await digest(bytes);
 const path=String(src.clientId)+'/'+id+'/'+requestId+'/report.pdf';
 let uploaded=false;
 try{
  const save=await service.storage.from(BUCKET).upload(path,bytes,{
   contentType:'application/pdf',cacheControl:'31536000',upsert:false,
  });
  if(save.error)throw save.error;
  uploaded=true;
  const downloaded=await service.storage.from(BUCKET).download(path);
  if(downloaded.error||!downloaded.data)throw Error('M44_PDF_STORAGE_READBACK_FAILED');
  const actual=new Uint8Array(await downloaded.data.arrayBuffer());
  if(actual.length!==bytes.length||(await digest(actual))!==hash)
   throw Error('M44_PDF_STORAGE_CHECKSUM_MISMATCH');
  // Only the service role may bind these verified bytes to an issuance.
  const persisted=await service.rpc('iberfit_m44_finalize_evolution_report_issue_v1',{
   p_report_id:id,p_issue_request_id:requestId,
   p_source_revision:Number(src.sourceRevision),p_source_sha256:src.sourceSha256,
   p_artifact_path:path,p_artifact_sha256:hash,p_artifact_size_bytes:bytes.length,
   p_template_version:rendered.templateVersion,p_engine_version:VERSION,
   p_actor_user_id:actor,
  });
  if(persisted.error||!persisted.data?.ok)throw persisted.error||Error('M44_PDF_ISSUE_FINALIZE_FAILED');
  const record=persisted.data,canonicalPath=record.artifactPath;
  if(!canonicalPath||typeof canonicalPath!=='string')throw Error('M44_PDF_CANONICAL_PATH_MISSING');
  if(record.kind==='already-issued'&&canonicalPath!==path){
   await service.storage.from(BUCKET).remove([path]);uploaded=false;
  }
  return {kind:record.kind,issuanceId:record.issuanceId,version:record.version,
   artifactSha256:record.artifactSha256||hash,pages:rendered.pages,
   signedUrl:await signed(service,canonicalPath),expiresIn:120};
 }catch(error){
  if(uploaded)await service.storage.from(BUCKET).remove([path]).catch(()=>{});
  throw error;
 }
}
async function open({user,service,body}){
 const id=uuid(body.issuanceId,'M44_PDF_ISSUANCE_INVALID');
 const auth=await user.rpc('iberfit_m44_authorize_evolution_report_pdf_v1',{p_issuance_id:id});
 if(auth.error)throw auth.error;
 const row=auth.data;
 if(!row?.ok||row.withdrawn||row.artifactBucket!==BUCKET)
  throw Error('M44_PDF_ISSUANCE_NOT_AVAILABLE');
 return {kind:'opened',issuanceId:id,version:row.version,
  artifactSha256:row.artifactSha256,signedUrl:await signed(service,row.artifactPath),
  expiresIn:120};
}
Deno.serve(async(req)=>{
 const origin=String(req.headers.get('origin')||'').trim().toLowerCase();
 if(!appOrigin||!allowed.has(origin))return result(403,{ok:false,code:'M44_PDF_ORIGIN_FORBIDDEN'},origin);
 if(req.method==='OPTIONS')return result(204,{},origin);
 if(req.method!=='POST')return result(405,{ok:false,code:'M44_PDF_METHOD_NOT_ALLOWED'},origin);
 const bearer=String(req.headers.get('authorization')||'');
 if(!bearer.startsWith('Bearer ')||bearer.length>20000)
  return result(401,{ok:false,code:'M44_PDF_AUTH_REQUIRED'},origin);
 try{
  const raw=await req.text();
  if(!raw||raw.length>2400)throw Error('M44_PDF_BODY_INVALID');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('M44_PDF_BODY_INVALID');
  const action=String(body.action||'');
  if(!['issue','open','withdraw'].includes(action))throw Error('M44_PDF_ACTION_INVALID');
  const {user,service}=clients(bearer);
  const auth=await user.auth.getUser(bearer.slice(7).trim());
  if(auth.error||!UUID.test(auth.data?.user?.id||''))throw Error('M44_PDF_AUTH_REQUIRED');
  const actor=auth.data.user.id;
  let data;
  if(action==='issue')data=await issue({user,service,actor,body});
  else if(action==='open')data=await open({user,service,body});
  else{
   const id=uuid(body.issuanceId,'M44_PDF_ISSUANCE_INVALID');
   const reason=String(body.reason||'').trim();
   if(reason.length<3||reason.length>500)throw Error('M44_PDF_WITHDRAW_REASON_INVALID');
   const response=await user.rpc('iberfit_m44_withdraw_evolution_report_pdf_v1',{
    p_issuance_id:id,p_reason:reason,
   });
   if(response.error||!response.data?.ok)throw response.error||Error('M44_PDF_WITHDRAW_FAILED');
   data=response.data;
  }
  return result(200,{ok:true,version:VERSION,...data},origin);
 }catch(e){
  const c=code(e),status=/AUTH_REQUIRED/.test(c)?401:
   /SCOPE|FORBIDDEN|SERVICE_ONLY|NOT_AUTHORIZED/.test(c)?403:
   /NOT_FOUND|NOT_AVAILABLE/.test(c)?404:400;
  console.error('[m44-pdf]',c);
  return result(status,{ok:false,code:c,version:VERSION},origin);
 }
});
