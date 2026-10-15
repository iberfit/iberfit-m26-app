import {createClient} from 'npm:@supabase/supabase-js@2.112.4';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import {renderEvolutionReportPdf,M44_PDF_TEMPLATE} from './pdf-renderer.js';
import {ensureStoredPdfArtifact} from './storage-recovery.js';

const VERSION='m44-issued-pdf-broker-2026.10-v1';
const BUCKET='iberfit-evolution-issued-reports';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA=/^[0-9a-f]{64}$/iu;
const QA='gjztkdwfmunnzhtvxrsu',PROD='pjhmrhejsoofmouedavw';
const url=Deno.env.get('SUPABASE_URL')||'';
const ref=(()=>{try{return new URL(url).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u)?.[1]||'';}catch{return '';}})();
function key(primary:string,legacy:string){
 const raw=Deno.env.get(primary);
 if(raw){try{const ob=JSON.parse(raw);const value=String(ob.default||Object.values(ob)[0]||'').trim();if(value)return value;}catch{}}
 return String(Deno.env.get(legacy)||'').trim();
}
const allowed=new Set(ref===QA?['https://m26-canary.iberfit.cl']:
 ref===PROD?['https://app.iberfit.cl','https://coach.iberfit.cl']:[]);
const appOrigin=ref===QA?'https://m26-canary.iberfit.cl':ref===PROD?'https://app.iberfit.cl':'';
function uuid(value:unknown,label:string){
 const id=String(value||'').trim();
 if(!UUID.test(id))throw Error(label);
 return id;
}
function headers(origin:string):Record<string,string>{
 const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'Vary':'Origin','X-Content-Type-Options':'nosniff','X-IBERFIT-Version':VERSION,
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Max-Age':'600'};
 if(allowed.has(origin))h['Access-Control-Allow-Origin']=origin;
 return h;
}
function result(status:number,body:unknown,origin:string){return new Response(status===204?null:JSON.stringify(body),{status,headers:headers(origin)});}
async function digest(data:Uint8Array|string){
 const b=typeof data==='string'?new TextEncoder().encode(data):data;
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(b).buffer));
 return [...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function code(error:unknown){
 const value=String((error as {message?:string})?.message||error||'').toUpperCase();
 return value.match(/\b(?:M44|IBERFIT)_?[A-Z0-9_:-]{4,90}\b/u)?.[0]||'M44_PDF_BROKER_ERROR';
}
function clients(auth:string,origin:string){
 const publishable=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
 const secret=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 if(!publishable||!secret||!url)throw Error('M44_PDF_BROKER_CONFIG_MISSING');
 return {
  user:createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false},
   global:{headers:{Authorization:auth,Origin:origin}}}),
  service:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),
 };
}
// No bearer-independent signed URLs: a withdrawn report must become
// unavailable to NEW downloads immediately, not after a Storage token expires.
async function fontBytes(name:string){
 // Restricted to static bundled official font assets on the known IBERFIT site.
 const response=await fetch(appOrigin+'/m26/fonts/'+name,{
  signal:AbortSignal.timeout(5000),
 });
 if(!response.ok||Number(response.headers.get('content-length')||0)>2_000_000)
  throw Error('M44_PDF_BRAND_FONT_FETCH_FAILED');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<1000||bytes.length>2_000_000)
  throw Error('M44_PDF_BRAND_FONT_SIZE_INVALID');
 return bytes;
}
async function logoBytes(){
 try{
  const res=await fetch(appOrigin+'/public/isotipo-iberfit.png',{signal:AbortSignal.timeout(4500)});
  if(!res.ok||Number(res.headers.get('content-length')||0)>250_000)return null;
  const buf=new Uint8Array(await res.arrayBuffer());
  return buf.length>100&&buf.length<250_000?buf:null;
 }catch{return null;}
}
type BrokerClient=ReturnType<typeof clients>['user'];
type RpcError={message:string;code?:string};
type Prepared={ok:boolean;reportId:string;clientId:string;sourceRevision:number;
 sourceSha256:string;artifactBucket:string;sourceSnapshot:{reportId:string;[key:string]:unknown}};
type Previous={id:string;report_id:string;report_revision:number;source_sha256:string;
 artifact_sha256:string;artifact_path:string;status:string;version:number};
type Finalized={ok:boolean;kind:string;issuanceId:string;version:number;artifactPath:string;artifactSha256:string;withdrawn?:boolean};
type Access={ok:boolean;withdrawn:boolean;artifactBucket:string;artifactPath:string;artifactSha256:string;version:number};
type Withdrawn={ok:boolean;kind:string;issuanceId:string};
async function callRpc<T>(client:BrokerClient,name:string,args:Record<string,unknown>):Promise<T>{
 // The new migration RPCs are not yet reflected in generated supabase-js types.
 const invoke=client.rpc.bind(client) as unknown as
  (name:string,args:Record<string,unknown>)=>Promise<{data:T|null;error:RpcError|null}>;
 const response=await invoke(name,args);
 if(response.error){
  const error=new Error(response.error.message) as Error&{sqlstate?:string};
  error.sqlstate=String(response.error.code||'');
  throw error;
 }
 if(response.data===null)throw Error('M44_PDF_RPC_EMPTY_RESPONSE');
 return response.data;
}
async function issue({user,service,actor,body}:{
 user:BrokerClient;
 service:BrokerClient;
 actor:string;
 body:{reportId?:unknown;issueRequestId?:unknown}
}){
 const id=uuid(body.reportId,'M44_PDF_REPORT_ID_INVALID');
 const requestId=body.issueRequestId?uuid(body.issueRequestId,'M44_PDF_REQUEST_ID_INVALID'):crypto.randomUUID();
 // User-scoped prepare is the source of truth; browser supplies no content.
 const src=await callRpc<Prepared>(user,'iberfit_m44_prepare_evolution_report_issue_v1',{p_report_id:id});
 if(!src?.ok||src.reportId!==id||!SHA.test(src.sourceSha256)||
    src.artifactBucket!==BUCKET||src.sourceSnapshot?.reportId!==id)
  throw Error('M44_PDF_SOURCE_AUTHORIZATION_INVALID');
 const prior=await service.from('iberfit_evolution_report_issuances_v1')
  .select('id,report_id,report_revision,source_sha256,artifact_path,artifact_sha256,status,version')
  .eq('issue_request_id',requestId).maybeSingle();
 if(prior.error)throw prior.error;
 if(prior.data){
  const previous=prior.data as Previous;
  if(previous.report_id!==id||previous.report_revision!==Number(src.sourceRevision)||
     previous.source_sha256!==src.sourceSha256||previous.status!=='issued')
   throw Error('M44_PDF_ISSUE_REPLAY_COLLISION');
  return {kind:'already-issued',issuanceId:previous.id,version:previous.version,
   artifactSha256:previous.artifact_sha256,delivery:'authenticated-pdf'};
 }
 const sourceFingerprint=`IBERFIT M44 | ${id} | revision ${src.sourceRevision} | ${src.sourceSha256}`;
 const rendered=await renderEvolutionReportPdf({
  source:src.sourceSnapshot,sourceFingerprint,pdfLib:{PDFDocument,StandardFonts,rgb},
  brandImageBytes:await logoBytes(),
  brandFonts:{
   inter:await fontBytes('inter-latin-wght-normal.woff2'),
   serif:await fontBytes('source-serif-4-latin-wght-normal.woff2'),
  },fontkit,generatedAt:new Date().toISOString(),
 });
 const bytes=rendered.bytes;
 if(!(bytes instanceof Uint8Array)||bytes.length<1024||bytes.length>20*1024*1024)
  throw Error('M44_PDF_RENDER_BYTES_INVALID');
 // Compute independently after generation and after storage download.
 const hash=await digest(bytes);
 const path=String(src.clientId)+'/'+id+'/'+requestId+'/report.pdf';
 try{
  // A lost upload acknowledgement or retry may encounter an existing private
  // object; validate its cryptographic source fingerprint before finalization.
  const artifact=await ensureStoredPdfArtifact({
   bucket:service.storage.from(BUCKET),path,bytes,expectedHash:hash,digest,
   validateExisting:async (stored:Uint8Array)=>{
    const pdf=await PDFDocument.load(stored);
    if(pdf.getSubject()!==sourceFingerprint||
       pdf.getProducer()!==M44_PDF_TEMPLATE||pdf.getPageCount()<1)
      throw Error('M44_PDF_ORPHAN_REPLAY_COLLISION');
   },
  });
  // Only the service role may bind these verified bytes to an issuance.
  // The finalizer rejects a changed source revision under a database lock.
  const persisted=await callRpc<Finalized>(service,'iberfit_m44_finalize_evolution_report_issue_v1',{
   p_report_id:id,p_issue_request_id:requestId,
   p_source_revision:Number(src.sourceRevision),p_source_sha256:src.sourceSha256,
   p_artifact_path:path,p_artifact_sha256:artifact.sha256,p_artifact_size_bytes:artifact.size,
   p_template_version:rendered.templateVersion,p_engine_version:VERSION,
   p_actor_user_id:actor,
  });
  if(!persisted.ok)throw Error('M44_PDF_ISSUE_FINALIZE_FAILED');
  const record=persisted,canonicalPath=record.artifactPath;
  if(!canonicalPath||typeof canonicalPath!=='string')throw Error('M44_PDF_CANONICAL_PATH_MISSING');
  // An issued revision that was withdrawn must never become downloadable
  // again through duplicate issuance, even if the PDF bytes still exist.
  if(record.withdrawn===true)
   throw Error('M44_PDF_WITHDRAWN_REVISION_CANNOT_BE_REISSUED');
  if(record.kind==='already-issued'&&canonicalPath!==path){
   await service.storage.from(BUCKET).remove([path]);
  }
  return {kind:record.kind,issuanceId:record.issuanceId,version:record.version,
   artifactSha256:record.artifactSha256||artifact.sha256,pages:rendered.pages,
   delivery:'authenticated-pdf'};
 }catch(error){
  // Even before our finalization, a parallel retry can have committed this
  // identical path. NEVER delete it on error: preserve the official ledger
  // and let the next authorized retry reconcile by issueRequestId.
  throw error;
 }
}
async function open({user,service,body}:{
 user:BrokerClient;
 service:BrokerClient;
 body:{issuanceId?:unknown}
}){
 const id=uuid(body.issuanceId,'M44_PDF_ISSUANCE_INVALID');
 const row=await callRpc<Access>(user,'iberfit_m44_authorize_evolution_report_pdf_v1',{p_issuance_id:id});
 if(!row?.ok||row.withdrawn||row.artifactBucket!==BUCKET)
  throw Error('M44_PDF_ISSUANCE_NOT_AVAILABLE');
 return {kind:'opened',issuanceId:id,version:row.version,
  artifactSha256:row.artifactSha256,delivery:'authenticated-pdf'};
}
async function latest({user,service,body}:{
 user:BrokerClient;
 service:BrokerClient;
 body:{reportId?:unknown}
}){
 const id=uuid(body.reportId,'M44_PDF_REPORT_ID_INVALID');
 // The service may find the candidate but ONLY the user-scoped authorization
 // RPC may release the row. No client can enumerate private ledger entries.
 const found=await service.from('iberfit_evolution_report_issuances_v1')
  .select('id')
  .eq('report_id',id)
  .eq('status','issued')
  .order('issued_at',{ascending:false})
  .limit(1).maybeSingle();
 if(found.error)throw found.error;
 if(!found.data?.id)throw Error('M44_PDF_ISSUANCE_NOT_AVAILABLE');
 const row=await callRpc<Access>(user,'iberfit_m44_authorize_evolution_report_pdf_v1',{
  p_issuance_id:found.data.id,
 });
 if(!row?.ok||row.withdrawn||row.artifactBucket!==BUCKET)
  throw Error('M44_PDF_ISSUANCE_NOT_AVAILABLE');
 return {kind:'latest-issued',issuanceId:found.data.id,version:row.version,
  artifactSha256:row.artifactSha256,
  delivery:'authenticated-pdf'};
}
async function downloadVerified({user,service,body}:{
 user:BrokerClient;service:BrokerClient;body:{issuanceId?:unknown}
}){
 const id=uuid(body.issuanceId,'M44_PDF_ISSUANCE_INVALID');
 // This authorization runs for EVERY byte request, after any withdrawal.
 const row=await callRpc<Access>(user,'iberfit_m44_authorize_evolution_report_pdf_v1',{
  p_issuance_id:id,
 });
 if(!row?.ok||row.withdrawn||row.artifactBucket!==BUCKET||
    !SHA.test(String(row.artifactSha256||'')))
  throw Error('M44_PDF_ISSUANCE_NOT_AVAILABLE');
 const downloaded=await service.storage.from(BUCKET).download(row.artifactPath);
 if(downloaded.error||!downloaded.data)throw Error('M44_PDF_STORAGE_READBACK_FAILED');
 const bytes=new Uint8Array(await downloaded.data.arrayBuffer());
 if(bytes.length<1024||bytes.length>20*1024*1024)
  throw Error('M44_PDF_STORAGE_BYTES_INVALID');
 if(await digest(bytes)!==row.artifactSha256)
  throw Error('M44_PDF_STORAGE_CHECKSUM_MISMATCH');
 return {bytes,version:row.version,sha256:row.artifactSha256};
}
Deno.serve(async(req)=>{
 const origin=String(req.headers.get('origin')||'').trim().toLowerCase();
 if(!appOrigin||!allowed.has(origin))return result(403,{ok:false,code:'M44_PDF_ORIGIN_FORBIDDEN'},origin);
 if(req.method==='OPTIONS')return result(204,{},origin);
 if(req.method!=='POST')return result(405,{ok:false,code:'M44_PDF_METHOD_NOT_ALLOWED'},origin);
 const bearer=String(req.headers.get('authorization')||'');
 if(!bearer.startsWith('Bearer ')||bearer.length>20000)
  return result(401,{ok:false,code:'M44_PDF_AUTH_REQUIRED'},origin);
 let phase='request';
 try{
  const raw=await req.text();
  if(!raw||raw.length>2400)throw Error('M44_PDF_BODY_INVALID');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('M44_PDF_BODY_INVALID');
  const action=String(body.action||'');
  if(!['issue','open','latest','history','withdraw','download'].includes(action))throw Error('M44_PDF_ACTION_INVALID');
  phase='clients';
  const {user,service}=clients(bearer,origin);
  phase='getUser';
  const auth=await user.auth.getUser(bearer.slice(7).trim());
  if(auth.error||!UUID.test(auth.data?.user?.id||''))throw Error('M44_PDF_AUTH_REQUIRED');
  const actor=auth.data.user.id;
  phase='domain';
  let data;
  if(action==='download'){
   const file=await downloadVerified({user,service,body});
   return new Response(Uint8Array.from(file.bytes).buffer,{
    status:200,headers:{...headers(origin),
     'Content-Type':'application/pdf',
     'Content-Disposition':`inline; filename="IBERFIT-Evolucion-v${file.version}.pdf"`,
     'X-IBERFIT-SHA256':file.sha256,
     'X-Content-Type-Options':'nosniff',
    },
   });
  }
  if(action==='issue')data=await issue({user,service,actor,body});
  else if(action==='open')data=await open({user,service,body});
  else if(action==='latest')data=await latest({user,service,body});
  else if(action==='history'){
   const reportId=uuid(body.reportId,'M44_PDF_REPORT_ID_INVALID');
   data=await callRpc<{ok:boolean;reportId:string;manager:boolean;items:unknown[]}>(user,'iberfit_m44_report_issued_pdf_history_v1',{p_report_id:reportId});
  }
  else{
   const id=uuid(body.issuanceId,'M44_PDF_ISSUANCE_INVALID');
   const reason=String(body.reason||'').trim();
   if(reason.length<3||reason.length>500)throw Error('M44_PDF_WITHDRAW_REASON_INVALID');
   const response=await callRpc<Withdrawn>(user,'iberfit_m44_withdraw_evolution_report_pdf_v1',{
    p_issuance_id:id,p_reason:reason,
   });
   if(!response.ok)throw Error('M44_PDF_WITHDRAW_FAILED');
   data=response;
  }
  return result(200,{ok:true,version:VERSION,...data},origin);
 }catch(e){
  const c=code(e),sqlstate=String((e as {sqlstate?:string})?.sqlstate||'');
  const status=sqlstate==='42501'?403:/AUTH_REQUIRED/.test(c)?401:
   /SCOPE|FORBIDDEN|SERVICE_ONLY|NOT_AUTHORIZED|PRIVILEGED_ASSURANCE_REQUIRED|PRIVILEGED_ROLE_REQUIRED/.test(c)?403:
   /NOT_FOUND|NOT_AVAILABLE/.test(c)?404:400;
  // Error metadata only: never log raw exception text, tokens or client data.
  console.error('[m44-pdf]',c,'sqlstate',
   /^[A-Z0-9]{5}$/u.test(sqlstate)?sqlstate:'none',
   'class',e instanceof Error?e.name:'unknown','phase',phase);
  return result(status,{ok:false,code:c,version:VERSION},origin);
 }
});
