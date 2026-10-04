import {mkdir,writeFile} from 'node:fs/promises';

const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN=`https://${QA_REF}.supabase.co`;
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const EDGE_PATH='/functions/v1/iberfit-admin-media-review-v1';
const OUT='recovery/admin-media-review-live-cert.json';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256=/^[0-9a-f]{64}$/u;

function fail(code,detail=''){
  const suffix=detail?`:${String(detail).slice(0,180)}`:'';
  throw new Error(`${code}${suffix}`);
}
function assert(condition,code,detail=''){if(!condition)fail(code,detail);}
async function jsonResponse(response,label){
  let body=null;
  try{body=await response.json();}catch{fail(`${label}_INVALID_JSON`,response.status);}
  return body;
}

const missing=REQUIRED.filter((name)=>!process.env[name]);
assert(missing.length===0,'MEDIA_REVIEW_QA_ENV_MISSING',missing.join(','));
assert(process.env.M26_PROJECT_REF===QA_REF,'MEDIA_REVIEW_QA_REF_INVALID');
assert(String(process.env.M26_QA_ONLY).toLowerCase()==='true','MEDIA_REVIEW_QA_ONLY_REQUIRED');
assert(new URL(process.env.M26_SUPABASE_URL).origin===QA_ORIGIN,'MEDIA_REVIEW_QA_URL_INVALID');
const publishable=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'').trim();
assert(publishable.length>20,'MEDIA_REVIEW_PUBLISHABLE_KEY_MISSING');
assert(!/service[_-]?role/iu.test(publishable),'MEDIA_REVIEW_SERVICE_ROLE_FORBIDDEN');
assert(String(process.env.M26_QA_CLIENT_A_EMAIL||'').toLowerCase()==='qa.rc74.client-a@iberfit.cl','MEDIA_REVIEW_FIXTURE_EMAIL_INVALID');

const evidence={
  schema:'iberfit.qa-admin-media-review-live-cert.v1',
  projectRef:QA_REF,
  origin:CANARY_ORIGIN,
  edgePath:EDGE_PATH,
  authenticated:true,
  serviceRoleUsed:false,
  mutationPerformed:false,
  allowedOriginStatus:null,
  forbiddenOriginStatus:null,
  candidateCount:null,
  version:null,
  passed:false,
};

let accessToken='';
try{
  const authResponse=await fetch(`${QA_ORIGIN}/auth/v1/token?grant_type=password`,{
    method:'POST',
    headers:{apikey:publishable,'content-type':'application/json'},
    body:JSON.stringify({email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD}),
  });
  const auth=await jsonResponse(authResponse,'MEDIA_REVIEW_AUTH');
  assert(authResponse.ok,'MEDIA_REVIEW_AUTH_FAILED',`${authResponse.status}:${auth?.error_code||auth?.msg||''}`);
  accessToken=String(auth?.access_token||'');
  assert(accessToken.length>100,'MEDIA_REVIEW_ACCESS_TOKEN_INVALID');

  const headers={
    apikey:publishable,
    authorization:`Bearer ${accessToken}`,
    origin:CANARY_ORIGIN,
    'content-type':'application/json',
  };
  const allowed=await fetch(`${QA_ORIGIN}${EDGE_PATH}`,{method:'POST',headers,body:JSON.stringify({action:'list'})});
  evidence.allowedOriginStatus=allowed.status;
  const payload=await jsonResponse(allowed,'MEDIA_REVIEW_LIST');
  assert(allowed.status===200&&payload?.ok===true,'MEDIA_REVIEW_LIST_FAILED',`${allowed.status}:${payload?.code||''}`);
  assert(payload?.version==='admin-media-review-v1.2','MEDIA_REVIEW_VERSION_MISMATCH',payload?.version);
  assert(Array.isArray(payload?.candidates),'MEDIA_REVIEW_CANDIDATES_INVALID');
  for(const candidate of payload.candidates){
    assert(UUID.test(String(candidate?.jobId||'')),'MEDIA_REVIEW_JOB_ID_INVALID');
    assert(SHA256.test(String(candidate?.sha256||'')),'MEDIA_REVIEW_SHA_INVALID');
    assert(String(candidate?.status||'')==='qa','MEDIA_REVIEW_STATUS_INVALID',candidate?.status);
  }
  evidence.candidateCount=payload.candidates.length;
  evidence.version=payload.version;

  const forbidden=await fetch(`${QA_ORIGIN}${EDGE_PATH}`,{
    method:'POST',
    headers:{...headers,origin:'https://example.invalid'},
    body:JSON.stringify({action:'list'}),
  });
  evidence.forbiddenOriginStatus=forbidden.status;
  assert(forbidden.status===403,'MEDIA_REVIEW_FORBIDDEN_ORIGIN_NOT_BLOCKED',forbidden.status);

  evidence.passed=true;
}finally{
  if(accessToken){
    await fetch(`${QA_ORIGIN}/auth/v1/logout?scope=local`,{
      method:'POST',
      headers:{apikey:publishable,authorization:`Bearer ${accessToken}`},
    }).catch(()=>{});
  }
  await mkdir('recovery',{recursive:true});
  await writeFile(OUT,JSON.stringify(evidence,null,2)+'\n','utf8');
}

console.log(`IBERFIT_ADMIN_MEDIA_REVIEW_LIVE_CERT=${JSON.stringify({passed:evidence.passed,status:evidence.allowedOriginStatus,forbiddenOriginStatus:evidence.forbiddenOriginStatus,candidateCount:evidence.candidateCount,version:evidence.version})}`);
