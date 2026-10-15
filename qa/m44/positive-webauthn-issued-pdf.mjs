/**
 * M44 positive QA certification, restricted to the official Canary/OIDC Coach
 * WebAuthn runner and the named synthetic QA client. Never touch PROD.
 * No keys, bearer tokens, personal data or PDF bytes are logged.
 */
import {createHash,randomUUID} from 'node:crypto';
import {buildApproveReportDraftCommand} from '../../src/m26/workflows/report-workflow.js';
import {buildPublicationCommand} from '../../src/m26/workflows/publication-workflow.js';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA='https://'+QA_REF+'.supabase.co';
const CANARY='https://m26-canary.iberfit.cl';
const SYNTHETIC_CLIENT='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const PDF_PATH='/functions/v1/iberfit-evolution-report-emission-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu;
const SHA=/^[a-f0-9]{64}$/u;
function guard(){
 const e=process.env;
 if(e.M26_QA_ONLY!=='true'||e.M26_PROJECT_REF!==QA_REF||
    new URL(e.M26_SUPABASE_URL||'https://invalid.example').origin!==QA||
    e.GITHUB_REF_NAME!=='canary/rc74-4'||
    e.GITHUB_EVENT_NAME!=='push'||
    e.M26_QA_M44_POSITIVE_CERT!=='true')
  throw Error('M44_QA_POSITIVE_TRUSTED_CANARY_ONLY');
}
function ensure(value,code){if(!value)throw Error(code);}
function sourceDate(row){
 const s=row?.summary||{};
 const raw=s.completedAt||s.completed_at||row?.remote_confirmed_at||
  row?.local_closed_at||'';
 const candidate=String(raw).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(candidate))
  throw Error('M44_QA_CONFIRMED_DATE_MISSING');
 return candidate;
}
function headers(jwt,key){return {apikey:key,authorization:'Bearer '+jwt,
 origin:CANARY,'content-type':'application/json'};}
function errorCode(body){const raw=String(body?.code||body?.message||'');
 return raw.match(/\b(?:M44|M26|IBERFIT)_[A-Z0-9_]{4,100}\b/u)?.[0]||'HTTP_UNEXPECTED';}
export async function certifyM44PositiveEvolutionPdf({
 context,accessToken,publishableKey,assuranceVerified
}={}){
 guard();
 ensure(context?.request&&String(accessToken||'').startsWith('eyJ')&&
  String(publishableKey||'').length>12,'M44_QA_VERIFIED_CREDENTIALS_REQUIRED');
 ensure(assuranceVerified===true,'M44_QA_WEBAUTHN_PROOF_REQUIRED');
 const h=headers(accessToken,publishableKey);
 async function post(path,data){
  const r=await context.request.post(QA+path,{headers:h,data,timeout:90_000,failOnStatusCode:false});
  const type=String(r.headers()['content-type']||'');
  if(type.startsWith('application/pdf'))
   return {status:r.status(),mime:type,buffer:await r.body(),headers:r.headers()};
  const result=await r.json().catch(()=>({}));
  return {status:r.status(),body:result};
 }
 async function rpc(name,args){
  const r=await post('/rest/v1/rpc/'+name,args);
  if(r.status!==200||!r.body||typeof r.body!=='object')
   throw Error('M44_QA_RPC_'+name+'_'+errorCode(r.body));
  return Array.isArray(r.body)?r.body[0]:r.body;
 }
 async function edge(action,body={}){
  return post(PDF_PATH,{action,...body});
 }
 const today=await context.request.get(
  QA+'/rest/v1/session_executions?select=id,summary,remote_confirmed_at,local_closed_at'+
  '&client_id=eq.'+SYNTHETIC_CLIENT+
  '&execution_status=eq.cerrada_confirmada&limit=100',
  {headers:h,timeout:30_000,failOnStatusCode:false});
 ensure(today.status()===200,'M44_QA_CONFIRMED_EXECUTION_RLS_FAILED');
 const all=await today.json();
 ensure(Array.isArray(all)&&all.length>0,'M44_QA_NO_SYNTHETIC_CONFIRMED_EXECUTION');
 const rows=all.map(x=>({row:x,date:sourceDate(x)})).sort((a,b)=>b.date.localeCompare(a.date));
 const chosen=rows[0];ensure(UUID.test(chosen.row.id),'M44_QA_SOURCE_ID_INVALID');
 const reportId=randomUUID(),issueRequestId=randomUUID();
 const draft=buildApproveReportDraftCommand({
  id:reportId,clientId:SYNTHETIC_CLIENT,reportType:'post-session',
  sourceId:chosen.row.id,
  title:'Certificación QA · Evolución post-sesión',
  periodStart:chosen.date,periodEnd:chosen.date,
  summary:'Registro sintético de certificación. Se comprueba una sesión cerrada y confirmada en la plataforma QA.',
  conclusions:'La información procede de una ejecución confirmada; no representa a un cliente de producción.',
  recommendations:'Verificar el documento oficial, su integridad, los permisos y la retirada segura.',
  reviewAccepted:true,
  evidence:[{
   label:'Sesión verificada',
   text:'Existe una sesión confirmada para el cliente de ensayo QA; esta evidencia no representa una medición personal.',
   source:'sessionExecutions',
   quality:'confirmed',
  }],
 },1);
 ensure(draft.payload.patch.assessmentId===null,'M44_QA_IRI_IDENTITY_LEAK');
 let approved=false,published=false,withdrawn=false,issuanceId=null;
 let approvals=0,filesVerified=0,reason=null;
 const command=async(input)=>{
  const op={operationId:randomUUID(),conflictSensitive:true,
   previewAccepted:false,reason:null,...input};
  const response=await rpc('iberfit_execute_command_v26',{p_command:op});
  if(!['ack','duplicate'].includes(String(response?.kind||'')))
   throw Error('M44_QA_COMMAND_'+String(response?.reason||response?.kind||'REJECTED').slice(0,90));
  return response;
 };
 try{
  const create=await rpc('iberfit_m44_create_report_draft_v1',{
   p_client_id:SYNTHETIC_CLIENT,p_report_id:reportId,p_draft:draft.payload.patch,
  });
  ensure(create?.ok===true&&Number(create.remoteRevision)===1,'M44_QA_DRAFT_ACK_INVALID');
  const approve=await command(draft);
  ensure(Number(approve.remoteRevision)===2,'M44_QA_APPROVAL_REVISION_INVALID');
  approvals++;approved=true;
  const pub=buildPublicationCommand({entity:'report',action:'publish',
   record:{id:reportId,clientId:SYNTHETIC_CLIENT,revision:2,status:'aprobado'},
   role:'coach',previewAccepted:true,
  });
  const publish=await command(pub);
  ensure(Number(publish.remoteRevision)===3,'M44_QA_PUBLICATION_REVISION_INVALID');
  published=true;
  const issued=await edge('issue',{reportId,issueRequestId});
  ensure(issued.status===200&&issued.body?.ok&&UUID.test(issued.body.issuanceId)&&
   SHA.test(issued.body.artifactSha256),'M44_QA_PDF_ISSUE_FAILED_'+errorCode(issued.body));
  issuanceId=issued.body.issuanceId;
  const repeat=await edge('issue',{reportId,issueRequestId});
  ensure(repeat.status===200&&repeat.body?.issuanceId===issuanceId,
   'M44_QA_IDEMPOTENT_RETRY_DUPLICATED');
  const latest=await edge('latest',{reportId});
  ensure(latest.status===200&&latest.body?.issuanceId===issuanceId,'M44_QA_LATEST_NOT_READABLE');
  const file=await edge('download',{issuanceId});
  ensure(file.status===200&&file.mime.startsWith('application/pdf')&&
   file.buffer?.length>1024&&file.buffer.subarray(0,5).toString()==='%PDF-',
   'M44_QA_PDF_BYTES_INVALID');
  const actual=createHash('sha256').update(file.buffer).digest('hex');
  ensure(actual===issued.body.artifactSha256&&
   actual===file.headers['x-iberfit-sha256'],'M44_QA_PDF_SHA256_INVALID');
  filesVerified++;
  const history=await edge('history',{reportId});
  ensure(history.status===200&&history.body?.ok&&
   history.body?.items?.some(x=>x.issuanceId===issuanceId),
   'M44_QA_ISSUANCE_HISTORY_MISSING');
  const remove=await edge('withdraw',{issuanceId,
   reason:'Certificación sintética QA finalizada; retirar documento oficial.'});
  ensure(remove.status===200&&remove.body?.ok,'M44_QA_PDF_WITHDRAW_FAILED');
  withdrawn=true;
  const forbidden=await edge('download',{issuanceId});
  ensure([403,404].includes(forbidden.status)&&!forbidden.buffer,
   'M44_QA_WITHDRAWN_PDF_LEAK');
  return Object.freeze({qa:true,synthetic:true,webAuthn:true,
   draftApproved:approvals,published:true,idempotent:true,
   pdfBytesVerified:filesVerified,history:true,withdrawn:true,
   deniedAfterWithdrawal:true,prodTouched:false});
 }catch(e){
  reason=String(e?.message||'M44_QA_E2E_UNKNOWN').replace(/[^A-Z0-9_:\-]/giu,'_').slice(0,125);
  throw Error(reason);
 }finally{
  // Do not destroy issued ledger or private historic bytes.
  // A published synthetic report is withdrawn in the canonical command domain.
  if(issuanceId&&!withdrawn)await edge('withdraw',{issuanceId,
   reason:'Recuperación del ensayo sintético QA por error de certificación.'}).catch(()=>{});
  if(published){
   try{
    const withdrawal=buildPublicationCommand({entity:'report',action:'withdraw',
     record:{id:reportId,clientId:SYNTHETIC_CLIENT,revision:3,status:'publicado'},
     role:'coach',reason:'Certificación sintética QA concluida'});
    await command(withdrawal);
   }catch{
    // The caller fails closed; retain the synthetic row for QA cleanup review.
    if(!reason)throw Error('M44_QA_REPORT_WITHDRAW_CLEANUP_UNCONFIRMED');
   }
  }
 }
}
