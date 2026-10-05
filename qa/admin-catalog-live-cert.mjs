import {mkdir,writeFile} from 'node:fs/promises';

const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN=`https://${QA_REF}.supabase.co`;
const CANARY_ORIGIN='https://m26-canary.iberfit.cl';
const EDGE_PATH='/functions/v1/iberfit-catalog-admin';
const OUT='recovery/admin-catalog-live-cert.json';
const REQUIRED=[
  'M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY',
  'M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD',
];

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
assert(missing.length===0,'ADMIN_CATALOG_QA_ENV_MISSING',missing.join(','));
assert(process.env.M26_PROJECT_REF===QA_REF,'ADMIN_CATALOG_QA_REF_INVALID');
assert(String(process.env.M26_QA_ONLY).toLowerCase()==='true','ADMIN_CATALOG_QA_ONLY_REQUIRED');
assert(new URL(process.env.M26_SUPABASE_URL).origin===QA_ORIGIN,'ADMIN_CATALOG_QA_URL_INVALID');
const publishable=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'').trim();
assert(publishable.length>20,'ADMIN_CATALOG_PUBLISHABLE_KEY_MISSING');
assert(!/service[_-]?role/iu.test(publishable),'ADMIN_CATALOG_SERVICE_ROLE_FORBIDDEN');
assert(String(process.env.M26_QA_CLIENT_A_EMAIL||'').toLowerCase()==='qa.rc74.client-a@iberfit.cl','ADMIN_CATALOG_FIXTURE_EMAIL_INVALID');

const evidence={
  schema:'iberfit.qa-admin-catalog-live-cert.v1',
  projectRef:QA_REF,
  origin:CANARY_ORIGIN,
  edgePath:EDGE_PATH,
  authenticated:true,
  serviceRoleUsed:false,
  mutationPerformed:false,
  allowedOriginStatus:null,
  allowedOriginHeader:null,
  forbiddenOriginStatus:null,
  total:null,
  canonical:null,
  external:null,
  globalNameGovernance:null,
  geminiConfigured:null,
  passed:false,
};

let accessToken='';
try{
  const authResponse=await fetch(`${QA_ORIGIN}/auth/v1/token?grant_type=password`,{
    method:'POST',
    headers:{apikey:publishable,'content-type':'application/json'},
    body:JSON.stringify({email:process.env.M26_QA_CLIENT_A_EMAIL,password:process.env.M26_QA_CLIENT_A_PASSWORD}),
  });
  const auth=await jsonResponse(authResponse,'ADMIN_CATALOG_AUTH');
  assert(authResponse.ok,'ADMIN_CATALOG_AUTH_FAILED',`${authResponse.status}:${auth?.error_code||auth?.msg||''}`);
  accessToken=String(auth?.access_token||'');
  assert(accessToken.length>100,'ADMIN_CATALOG_ACCESS_TOKEN_INVALID');

  const headers={
    apikey:publishable,
    authorization:`Bearer ${accessToken}`,
    origin:CANARY_ORIGIN,
    'content-type':'application/json',
  };
  const allowed=await fetch(`${QA_ORIGIN}${EDGE_PATH}`,{
    method:'POST',
    headers,
    body:JSON.stringify({action:'status'}),
  });
  evidence.allowedOriginStatus=allowed.status;
  evidence.allowedOriginHeader=allowed.headers.get('access-control-allow-origin');
  const payload=await jsonResponse(allowed,'ADMIN_CATALOG_STATUS');
  assert(allowed.status===200,'ADMIN_CATALOG_STATUS_FAILED',`${allowed.status}:${payload?.code||payload?.error||''}`);
  assert(evidence.allowedOriginHeader===CANARY_ORIGIN,'ADMIN_CATALOG_CORS_HEADER_INVALID',evidence.allowedOriginHeader||'missing');
  assert(Number.isInteger(payload?.total)&&payload.total>0,'ADMIN_CATALOG_TOTAL_INVALID',payload?.total);
  assert(Number.isInteger(payload?.canonical)&&payload.canonical>=0,'ADMIN_CATALOG_CANONICAL_INVALID',payload?.canonical);
  assert(Number.isInteger(payload?.external)&&payload.external>=0,'ADMIN_CATALOG_EXTERNAL_INVALID',payload?.external);
  assert(payload.canonical+payload.external===payload.total,'ADMIN_CATALOG_COUNTS_INCONSISTENT');
  assert(Array.isArray(payload?.patterns)&&Array.isArray(payload?.equipment)&&Array.isArray(payload?.intents)&&Array.isArray(payload?.difficulties),'ADMIN_CATALOG_FACETS_INVALID');
  assert(payload?.globalNameGovernance===true,'ADMIN_CATALOG_NAME_GOVERNANCE_INVALID');
  assert(typeof payload?.geminiConfigured==='boolean','ADMIN_CATALOG_GEMINI_STATE_INVALID');

  evidence.total=payload.total;
  evidence.canonical=payload.canonical;
  evidence.external=payload.external;
  evidence.globalNameGovernance=payload.globalNameGovernance;
  evidence.geminiConfigured=payload.geminiConfigured;

  const forbidden=await fetch(`${QA_ORIGIN}${EDGE_PATH}`,{
    method:'POST',
    headers:{...headers,origin:'https://example.invalid'},
    body:JSON.stringify({action:'status'}),
  });
  evidence.forbiddenOriginStatus=forbidden.status;
  assert(forbidden.status===403,'ADMIN_CATALOG_FORBIDDEN_ORIGIN_NOT_BLOCKED',forbidden.status);
  assert(!forbidden.headers.get('access-control-allow-origin'),'ADMIN_CATALOG_FORBIDDEN_ORIGIN_CORS_LEAK');

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

console.log(`IBERFIT_ADMIN_CATALOG_LIVE_CERT=${JSON.stringify({passed:evidence.passed,status:evidence.allowedOriginStatus,forbiddenOriginStatus:evidence.forbiddenOriginStatus,total:evidence.total,canonical:evidence.canonical,external:evidence.external,geminiConfigured:evidence.geminiConfigured})}`);
