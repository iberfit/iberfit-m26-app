import {
  M26_PRODUCTION_PROJECT_REF,
  M26_PRODUCTION_SUPABASE_ORIGIN,
  M26_QA_PROJECT_REF,
  M26_QA_SUPABASE_ORIGIN,
} from '../supabase-transport.js';

export const IRI_REPORT_EMISSION_FUNCTION='/functions/v1/iberfit-iri-report-emission-v1';
export const IRI_REPORT_GOVERNANCE_VERSION='iri-document-governance-2026.10-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function clean(value,max=2000){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max);
}
function validateRuntime(runtime={}){
  if(!runtime.enabled)throw new Error('M26_IRI_REPORT_GOVERNANCE_BACKEND_DISABLED');
  const expected=runtime.qaOnly===true
    ?{projectRef:M26_QA_PROJECT_REF,origin:M26_QA_SUPABASE_ORIGIN}
    :{projectRef:M26_PRODUCTION_PROJECT_REF,origin:M26_PRODUCTION_SUPABASE_ORIGIN};
  if(runtime.projectRef!==expected.projectRef)throw new Error('M26_IRI_REPORT_GOVERNANCE_PROJECT_MISMATCH');
  let origin;try{origin=new URL(String(runtime.url||'')).origin;}catch{throw new Error('M26_IRI_REPORT_GOVERNANCE_URL_INVALID');}
  if(origin!==expected.origin)throw new Error('M26_IRI_REPORT_GOVERNANCE_ORIGIN_MISMATCH');
  const publishableKey=clean(runtime.publishableKey,20_000);
  if(!publishableKey)throw new Error('M26_IRI_REPORT_GOVERNANCE_KEY_REQUIRED');
  return Object.freeze({
    origin,publishableKey,
    version:clean(runtime.version||'26.0.0',80),
    timeoutMs:Math.max(5_000,Math.min(Number(runtime.iriReportEmissionTimeoutMs||120_000),180_000)),
  });
}
function uuid(value,code){const id=clean(value,80);if(!UUID.test(id))throw new Error(code);return id;}
function audience(value){
  const v=clean(value,20).toLowerCase();
  if(v==='client'||v==='cliente')return 'cliente';
  if(v==='coach')return 'coach';
  throw new Error('M26_IRI_REPORT_AUDIENCE_INVALID');
}
function responseMessage(payload,status){
  return clean(payload?.code||payload?.message||payload?.error_description||payload?.error,600)||`M26_IRI_REPORT_HTTP_${status}`;
}
function safeSignedUrl(value,origin){
  const raw=clean(value,4000);if(!raw)return null;
  let url;try{url=new URL(raw);}catch{throw new Error('M26_IRI_REPORT_SIGNED_URL_INVALID');}
  const expectedHost=new URL(origin).hostname;
  if(url.protocol!=='https:'||url.hostname!==expectedHost||!url.pathname.includes('/storage/v1/object/sign/')){
    throw new Error('M26_IRI_REPORT_SIGNED_URL_INVALID');
  }
  return url.href;
}
function normalizeHistory(payload={}){
  const rows=Array.isArray(payload.items)?payload.items:[];
  return Object.freeze({
    assessmentId:clean(payload.assessmentId,80),
    manager:payload.manager===true,
    items:Object.freeze(rows.flatMap((item)=>{
      const issuanceId=clean(item?.issuanceId,80);
      if(!UUID.test(issuanceId))return [];
      return [Object.freeze({
        issuanceId,
        documentId:clean(item?.documentId,80)||null,
        assessmentId:clean(item?.assessmentId,80),
        audience:clean(item?.audience,20),
        version:Number(item?.version||0),
        templateVersion:clean(item?.templateVersion,100),
        engineVersion:clean(item?.engineVersion,100),
        sourceRevision:Number(item?.sourceRevision||0),
        artifactSha256:clean(item?.artifactSha256,64)||null,
        artifactSizeBytes:Number(item?.artifactSizeBytes||0),
        issuedBy:clean(item?.issuedBy,80)||null,
        issuedAt:item?.issuedAt||null,
        withdrawn:item?.withdrawn===true,
        withdrawnAt:item?.withdrawnAt||null,
        withdrawnReason:clean(item?.withdrawnReason,1200)||null,
      })];
    })),
  });
}
export function createIriReportGovernanceService({runtime,fetchImpl=globalThis.fetch}={}){
  const config=validateRuntime(runtime);
  if(typeof fetchImpl!=='function')throw new Error('M26_IRI_REPORT_GOVERNANCE_FETCH_UNAVAILABLE');

  async function request(token,payload,{timeoutMs=config.timeoutMs}={}){
    const accessToken=clean(token,20_000);
    if(!accessToken)throw new Error('M26_IRI_REPORT_AUTH_REQUIRED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(`${config.origin}${IRI_REPORT_EMISSION_FUNCTION}`,{
        method:'POST',signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
        headers:{
          authorization:`Bearer ${accessToken}`,apikey:config.publishableKey,
          'content-type':'application/json','x-client-info':`iberfit-m26-web/${config.version}`,
        },
        body:JSON.stringify(payload),
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        const error=new Error(responseMessage(body,response.status));error.status=response.status;error.body=body;throw error;
      }
      if(!body||body.ok!==true)throw new Error('M26_IRI_REPORT_GOVERNANCE_INVALID_RESPONSE');
      return body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('M26_IRI_REPORT_GOVERNANCE_TIMEOUT');
      throw error;
    }finally{clearTimeout(timer);}
  }
  async function issue(token,{assessmentId,audience:target}={}){
    const assessment=uuid(assessmentId,'M26_IRI_REPORT_ASSESSMENT_INVALID');
    const body=await request(token,{action:'issue',assessmentId:assessment,audience:audience(target)},{timeoutMs:180_000});
    const issuanceId=uuid(body.issuanceId,'M26_IRI_REPORT_ISSUANCE_INVALID_RESPONSE');
    return Object.freeze({
      issuanceId,documentId:clean(body.documentId,80),assessmentId:assessment,
      audience:clean(body.audience,20),version:Number(body.version||0),
      artifactSha256:clean(body.artifactSha256,64),sourceSha256:clean(body.sourceSha256,64),
      signedUrl:safeSignedUrl(body.signedUrl,config.origin),expiresIn:Number(body.expiresIn||0),
    });
  }
  async function history(token,{assessmentId}={}){
    const assessment=uuid(assessmentId,'M26_IRI_REPORT_ASSESSMENT_INVALID');
    return normalizeHistory(await request(token,{action:'history',assessmentId:assessment},{timeoutMs:30_000}));
  }
  async function open(token,{issuanceId}={}){
    const id=uuid(issuanceId,'M26_IRI_REPORT_ISSUANCE_INVALID');
    const body=await request(token,{action:'open',issuanceId:id},{timeoutMs:30_000});
    return Object.freeze({
      issuanceId:id,assessmentId:clean(body.assessmentId,80),audience:clean(body.audience,20),
      version:Number(body.version||0),withdrawn:body.withdrawn===true,
      artifactSha256:clean(body.artifactSha256,64),artifactSizeBytes:Number(body.artifactSizeBytes||0),
      signedUrl:safeSignedUrl(body.signedUrl,config.origin),expiresIn:Number(body.expiresIn||0),
    });
  }
  async function withdraw(token,{issuanceId,reason}={}){
    const id=uuid(issuanceId,'M26_IRI_REPORT_ISSUANCE_INVALID');
    const why=clean(reason,1200);if(why.length<3)throw new Error('M26_IRI_REPORT_WITHDRAW_REASON_INVALID');
    const body=await request(token,{action:'withdraw',issuanceId:id,reason:why},{timeoutMs:30_000});
    return Object.freeze({issuanceId:id,withdrawn:body.withdrawn===true});
  }
  return Object.freeze({issue,history,open,withdraw});
}
