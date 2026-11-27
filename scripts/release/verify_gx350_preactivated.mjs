// GX350: narrow Pages-only source exception AFTER live backend attestation.
// Frozen functional candidate and previous LIVE baseline, observed QA 2026-11-27.
// This module is read-only, does not authorize SQL/Edge mutation or certify M44.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gitBlob,validateScope} from '../ops/gx350_edge_scope.mjs';
const GIT=process.platform==='win32'?'C:/Program Files/Git/cmd/git.exe':'/usr/bin/git';
const SHA=/^[a-f0-9]{40}$/u;
export const GX350_CANDIDATE='9076875af47d78284273e495dbd7fb227dbb5865';
export const GX350_PREVIOUS_LIVE='50ba022115091478a86900be6f0b0e4c816044ef';
const BACKEND_PATHS=Object.freeze([
  "supabase/functions/iberfit-admin-client-invite-v1/index.ts",
  "supabase/functions/iberfit-evolution-report-emission-v1/artifact-authorization.js",
  "supabase/functions/iberfit-evolution-report-emission-v1/index.ts",
  "supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js",
  "supabase/functions/iberfit-evolution-report-emission-v1/report-trend-contract.js",
  "supabase/functions/iberfit-iri-report-emission-v1/index.ts",
  "supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-photogrammetry-v2.js",
  "supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-protocol-catalog.js",
  "supabase/functions/iberfit-iri-report-emission-v1/vendor/workflows/iri-report-measurements.js",
  "supabase/release-procedures/gx_admin_create_replay_v1.rollback.sql",
  "supabase/release-procedures/gx_admin_create_replay_v1.sql",
  "supabase/release-procedures/gx_admin_deferred_iri_identity_v1.sql",
  "supabase/release-procedures/gx_backend_release_v1.json",
  "supabase/release-procedures/gx_followup_detail_v1.rollback.sql",
  "supabase/release-procedures/gx_followup_detail_v1.sql",
  "supabase/release-procedures/gx_followup_recent_v1.rollback.sql",
  "supabase/release-procedures/gx_followup_recent_v1.sql",
  "supabase/release-procedures/gx_followup_v1.rollback.sql",
  "supabase/release-procedures/gx_followup_v1.sql",
  "supabase/release-procedures/gx_goal_measurement_v1.rollback.sql",
  "supabase/release-procedures/gx_goal_measurement_v1.sql",
  "supabase/release-procedures/gx_onboarding_scoped_readback_v1.sql",
  "supabase/release-procedures/gx_publication_v1.rollback.sql",
  "supabase/release-procedures/gx_publication_v1.sql",
  "supabase/release-procedures/gx_report_evidence_v1.rollback.sql",
  "supabase/release-procedures/gx_report_evidence_v1.sql",
  "supabase/release-procedures/gx_report_guards_v1.rollback.sql",
  "supabase/release-procedures/gx_report_guards_v1.sql",
  "supabase/release-procedures/gx_report_proof_v1.rollback.sql",
  "supabase/release-procedures/gx_report_proof_v1.sql"
]);
const OPS_PATHS=new Set([
  "scripts/ops/gx350_prod_activation.mjs",
  ".github/workflows/gx350-prod-activation.yml",
  "tests/gx350_prod_activation.test.mjs",
  ".github/workflows/production-promote.yml",
  ".github/workflows/m44-encrypted-disaster-recovery.yml",
  ".github/workflows/gx350-smtp-custody-readonly.yml",
  ".github/workflows/gx350-edge-hosted-rehearsal.yml",
  "scripts/ops/gx350_edge_hosted_rehearsal.mjs",
  "docs/ops/GX350_EDGE_SCOPED_RELEASE.md",
  "docs/ops/GX350_M44_MANAGED_RECOVERY_PREFLIGHT.md",
  "scripts/ops/gx350_edge_local_runtime.mjs",
  "scripts/ops/gx350_edge_scope.json",
  "scripts/ops/gx350_edge_scope.mjs",
  "scripts/ops/gx350_edge_stage_rehearsal.mjs",
  "scripts/ops/m44_managed_recovery_preflight.mjs",
  "scripts/release/verify_backend_preactivated.mjs",
  "scripts/release/verify_frontend_only_promotion.mjs",
  "scripts/release/verify_gx350_preactivated.mjs",
  "tests/gx350_edge_local_runtime.test.mjs",
  "tests/gx350_edge_scope.test.mjs",
  "tests/gx350_edge_stage_rehearsal.test.mjs",
  "tests/gx350_preactivated_release_gate.test.mjs",
  "tests/m44_managed_recovery_preflight.test.mjs"
]);
const fail=code=>{throw Error('GX350_RELEASE_'+code);};
function git(args){return execFileSync(GIT,args,{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});}
function paths(result){return result.split(/\r?\n/u).filter(Boolean);}
export function gx350SourceScope({sourceSha,expectedPreviousLiveSha,gitRun=git}={}){
 if(!SHA.test(sourceSha||'')||!SHA.test(expectedPreviousLiveSha||''))fail('SHA_INVALID');
 if(expectedPreviousLiveSha!==GX350_PREVIOUS_LIVE)return null;
 try{gitRun(['merge-base','--is-ancestor',GX350_CANDIDATE,sourceSha]);}catch{return null;}
 const delta=paths(gitRun(['diff','--name-only',GX350_CANDIDATE,sourceSha]));
 if(delta.some(p=>!OPS_PATHS.has(p)))fail('FUNCTIONAL_SOURCE_DRIFT');
 const backend=paths(gitRun(['diff','--name-only',GX350_PREVIOUS_LIVE,sourceSha])).filter(p=>p.startsWith('supabase/')).sort();
 if(backend.length!==BACKEND_PATHS.length||backend.some((p,i)=>p!==BACKEND_PATHS[i]))fail('BACKEND_PATH_DRIFT');
 // Compare immutable Git objects, not working tree or manifest booleans.
 for(const p of BACKEND_PATHS){
  const original=gitRun(['rev-parse',GX350_CANDIDATE+':'+p]).trim();
  const actual=gitRun(['rev-parse',sourceSha+':'+p]).trim();
  if(!SHA.test(original)||actual!==original)fail('BACKEND_BLOB_DRIFT');
 }
 return Object.freeze({candidate:GX350_CANDIDATE,sourceSha,paths:BACKEND_PATHS});
}
export const CATALOG_SQL="WITH fn AS (\n SELECT n.nspname AS ns,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args,\n pg_get_functiondef(p.oid) AS def,pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS sec,p.proconfig AS cfg,\n ARRAY(SELECT concat(pg_get_userbyid(a.grantor),':',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,':',a.privilege_type,':',a.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a ORDER BY 1) AS acl,\n has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth,has_function_privilege('service_role',p.oid,'EXECUTE') AS svc\n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace\n WHERE n.nspname IN ('public','private') AND (p.proname LIKE 'iberfit_gx_%' OR p.proname IN ('iberfit_m43_client_safe_plan_v2','iberfit_m44_prepare_evolution_report_issue_v1','iberfit_m44_authorize_evolution_report_pdf_v1','iberfit_create_client_draft_v12_pre_v65e','iberfit_admin_create_client_v26_pre_privileged_assurance','iberfit_admin_create_client_v26'))\n), tr AS (\n SELECT n.nspname AS ns,c.relname AS relation,t.tgname AS name,pg_get_triggerdef(t.oid) AS def,t.tgenabled AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND (t.tgname LIKE 'iberfit_gx_%' OR t.tgname LIKE 'gx326_%')\n), po AS (\n SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND (policyname LIKE 'iberfit_gx_%' OR policyname LIKE 'gx326_%')\n), ix AS (\n SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','private') AND indexname LIKE 'iberfit_gx_%'\n), tbl AS (\n SELECT n.nspname AS ns,c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,\n ARRAY(SELECT concat(pg_get_userbyid(a.grantor),':',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,':',a.privilege_type,':',a.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a ORDER BY 1) AS acl,\n ARRAY(SELECT jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),a.attacl)::text FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) AS cols,\n ARRAY(SELECT jsonb_build_array(k.conname,pg_get_constraintdef(k.oid),k.convalidated)::text FROM pg_constraint k WHERE k.conrelid=c.oid ORDER BY k.conname) AS constraints,\n ARRAY(SELECT jsonb_build_array(i.relname,pg_get_indexdef(i.oid),x.indisvalid,x.indisready)::text FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=c.oid ORDER BY i.relname) AS indexes\n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname='iberfit_gx_publication_event_v1' AND c.relkind='r'\n), groups AS (\n SELECT 'functions' AS category,count(*) AS total,coalesce(jsonb_agg(to_jsonb(fn) ORDER BY ns,name,args),'[]'::jsonb) AS body FROM fn\n UNION ALL SELECT 'triggers',count(*),coalesce(jsonb_agg(to_jsonb(tr) ORDER BY ns,relation,name),'[]'::jsonb) FROM tr\n UNION ALL SELECT 'policies',count(*),coalesce(jsonb_agg(to_jsonb(po) ORDER BY schemaname,tablename,policyname),'[]'::jsonb) FROM po\n UNION ALL SELECT 'indexes',count(*),coalesce(jsonb_agg(to_jsonb(ix) ORDER BY schemaname,tablename,indexname),'[]'::jsonb) FROM ix\n UNION ALL SELECT 'table',count(*),coalesce(jsonb_agg(to_jsonb(tbl) ORDER BY ns,name),'[]'::jsonb) FROM tbl\n) SELECT category,total,encode(sha256(convert_to(body::text,'UTF8')),'hex') AS digest FROM groups ORDER BY category";
export const RLS_SQL="SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('domain_entities_v26','m26_client_measurements_v43','reports','iberfit_evolution_report_issuances_v1') AND c.relrowsecurity AND NOT c.relforcerowsecurity) AS rls_tables,(SELECT count(*) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=i.relnamespace WHERE n.nspname IN ('public','private') AND i.relname LIKE 'iberfit_gx_%' AND x.indisvalid AND x.indisready AND x.indislive) AS valid_indexes";
const EXPECTED={
  "functions": [
    49,
    "485a332c10d7a5362b6b604170ae0cb481f993f5e2d77f375e51383d6197cd60"
  ],
  "indexes": [
    5,
    "76e2415cefbaee66fefc40d2d7f5a867a3022af80675708e97a3f905b8c44673"
  ],
  "policies": [
    4,
    "71d9584e10e0931fcadba59eb8bb59136acb64371b07a24dd04c4c20e55798f7"
  ],
  "table": [
    1,
    "85299e1e08e47c16a854b4c1048eafa1230b2e02f20cbfaee280c7025ee4fbf3"
  ],
  "triggers": [
    8,
    "c3b69c9f7f428d1fbdf6bc90bf6e25880d51203ff8c74a5db00b5441e446852c"
  ]
};
const EDGE={
  "iberfit-admin-client-invite-v1": [
    false,
    "9a5507bea364778cbd18a63963e4c44decfa4ee370b42c5088d4098cbc88efda"
  ],
  "iberfit-evolution-report-emission-v1": [
    true,
    "5a3b2bbe5ce5203b4e6654526badd6cd17ea6a0b837e42373be1891a55ac7ae5"
  ],
  "iberfit-iri-report-emission-v1": [
    false,
    "bb639dad35e37120704f3529a2a5ac0722818c62ee124e995e310af29ef18df1"
  ]
};
export const GX350_INVITE_DIGEST=EDGE['iberfit-admin-client-invite-v1'][1];
function rows(raw){return Array.isArray(raw)?raw:raw?.result;}
export function verifyGx350Catalog(raw,rls){
 const a=rows(raw),b=rows(rls);
 if(!Array.isArray(a)||a.length!==5||new Set(a.map(x=>x?.category)).size!==5)fail('CATALOG_SHAPE');
 for(const x of a){
  if(!x||!Object.hasOwn(EXPECTED,x.category))fail('CATALOG_CATEGORY');
  const [count,digest]=EXPECTED[x.category];
  if(String(x.total)!==String(count)||x.digest!==digest)fail('CATALOG_DRIFT:'+x.category);
 }
 if(!Array.isArray(b)||b.length!==1||String(b[0]?.rls_tables)!=='4'||String(b[0]?.valid_indexes)!=='5')fail('RLS_OR_INDEX_DRIFT');
 return Object.freeze({functions:49,triggers:8,policies:4,indexes:5,table:1,rlsTables:4});
}
export function verifyGx350Edges(raw){
 const a=Array.isArray(raw)?raw:raw?.functions;
 if(!Array.isArray(a))fail('EDGE_SHAPE');
 for(const [slug,[jwt,digest]] of Object.entries(EDGE)){
  const matches=a.filter(x=>x?.slug===slug);
  const f=matches[0];
  if(matches.length!==1||f.status!=='ACTIVE'||f.verify_jwt!==jwt||f.ezbr_sha256!==digest||
    !Number.isSafeInteger(f.version)||f.version<1)fail('EDGE_DRIFT:'+slug);
 }
 return Object.freeze({functions:3});
}

 // PROD packaging may include the function directory in the provider bundle.
 // Never equate an unfamiliar bundle digest with a certified source. Attest
 // every deployed file, entrypoint, import map, JWT and stable live metadata.
 const LIVE_SCOPE=validateScope(JSON.parse(readFileSync(new URL('../ops/gx350_edge_scope.json',import.meta.url),'utf8')));
 const VERIFIED_PROD_PROOFS=new WeakSet();
 function edgeList(raw){const a=Array.isArray(raw)?raw:raw?.functions;if(!Array.isArray(a))fail('LIVE_EDGE_SHAPE');return a;}
 function pathValue(p){return typeof p==='string'?p.replace(/^file:\/\//u,''):'';}
 function exactMeta(raw,f){
  const a=edgeList(raw).filter(x=>x?.slug===f.slug),e=a[0];
  if(a.length!==1||!e||e.status!=='ACTIVE'||e.verify_jwt!==f.verifyJwt||typeof e.id!=='string'||!Number.isSafeInteger(e.version)||e.version<1||!/^[a-f0-9]{64}$/u.test(e.ezbr_sha256||''))fail('LIVE_EDGE_METADATA:'+f.slug);
  const entry=pathValue(e.entrypoint_path);
  if(!entry.endsWith('/index.ts')||!entry.startsWith('/')||entry.includes('/../')||entry.includes('/./'))fail('LIVE_EDGE_ENTRYPOINT:'+f.slug);
  const root=entry.slice(0,-'/index.ts'.length);
  if(!(root.endsWith('/'+f.slug)||root.endsWith('/source')))fail('LIVE_EDGE_ROOT:'+f.slug);
  const mapExpected=f.candidate.some(x=>x.name==='deno.json'),map=pathValue(e.import_map_path);
  if(mapExpected?(e.import_map!==true||map!==root+'/deno.json'):(e.import_map===true||Boolean(map)))fail('LIVE_EDGE_IMPORT_MAP:'+f.slug);
  return Object.freeze({slug:f.slug,id:e.id,version:e.version,digest:e.ezbr_sha256,jwt:e.verify_jwt,entry,map});
 }
 export function verifyCandidateFiles(f,files,entry=''){
  if(!Array.isArray(files)||files.length!==f.candidate.length)fail('LIVE_EDGE_FILE_COUNT:'+f.slug);
  // Only one consistent package root; never strip arbitrary suffixes.
  const root=entry.endsWith('/index.ts')?entry.slice(0,-'index.ts'.length):'';
  const segments=root.split('/').filter(Boolean);
  const relativeRoots=segments.map((_,i)=>segments.slice(i).join('/')+'/');
  const prefixes=['',f.slug+'/','supabase/functions/'+f.slug+'/',...relativeRoots,...(root?[root,'file://'+root]:[])];
  const prefix=prefixes.find(pre=>files.every(x=>typeof x.name==='string'&&x.name.startsWith(pre)&&f.candidate.some(y=>x.name===pre+y.name)));
  if(prefix===undefined){console.log('GX350_EDGE_PATH_DIAGNOSTIC:'+f.slug+':'+JSON.stringify(files.map(x=>String(x.name).slice(0,300))));fail('LIVE_EDGE_FILE_PATH:'+f.slug);}
  const names=new Set();
  for(const x of files){
   const name=x.name.slice(prefix.length),expected=f.candidate.find(y=>y.name===name);
   if(names.has(name)||!expected||gitBlob(x.bytes)!==expected.blob)fail('LIVE_EDGE_SOURCE_DRIFT:'+f.slug);
   names.add(name);
  }
  return names.size;
 }
 async function getBodyFiles(project,f,token){
  const url='https://api.supabase.com/v1/projects/'+project+'/functions/'+f.slug+'/body';
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'multipart/form-data'},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!res.ok||!/^multipart\/form-data\s*;/iu.test(res.headers.get('content-type')||'')){await res.body?.cancel();fail('LIVE_EDGE_BODY_HTTP_'+res.status);}
  const form=await res.formData(),files=[];let metadata=0;
  for(const [,value] of form){
   if(typeof value==='string'){if(++metadata>1)fail('LIVE_EDGE_BODY_METADATA');const obj=JSON.parse(value);if(!obj||typeof obj!=='object'||Array.isArray(obj))fail('LIVE_EDGE_BODY_METADATA');}
   else{if(typeof value.name!=='string'||value.size>2*1024*1024||files.length>=18)fail('LIVE_EDGE_BODY_SIZE');files.push({name:value.name,bytes:Buffer.from(await value.arrayBuffer())});}
  }
  return files;
 }
 async function listLive(project,token){
  const res=await fetch('https://api.supabase.com/v1/projects/'+project+'/functions',{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!res.ok){await res.body?.cancel();fail('LIVE_EDGE_LIST_HTTP_'+res.status);}
  return res.json();
 }
 export async function verifyGx350CandidateEdge(project,raw,slug,token){
  if(![LIVE_SCOPE.productionProject,LIVE_SCOPE.qaProject].includes(project)||typeof token!=='string'||token.length<16)fail('LIVE_EDGE_SCOPE');
  const f=LIVE_SCOPE.functions.find(x=>x.slug===slug);
  if(!f)fail('LIVE_EDGE_SLUG');
  const before=exactMeta(raw,f);
  if(project===LIVE_SCOPE.productionProject&&before.version<f.prodVersion)fail('LIVE_EDGE_VERSION');
  const count=verifyCandidateFiles(f,await getBodyFiles(project,f,token),before.entry);
  const after=exactMeta(await listLive(project,token),f);
  if(JSON.stringify(before)!==JSON.stringify(after))fail('LIVE_EDGE_CHANGED_DURING_READBACK:'+slug);
  return Object.freeze({...after,files:count});
 }
 export async function verifyGx350ProdEdges(raw,token){
  const snapshots=[];
  for(const f of LIVE_SCOPE.functions)snapshots.push(await verifyGx350CandidateEdge(LIVE_SCOPE.productionProject,raw,f.slug,token));
  const proof=Object.freeze({snapshots:Object.freeze(snapshots),functions:3});
  VERIFIED_PROD_PROOFS.add(proof);
  assertGx350ProdProof(await listLive(LIVE_SCOPE.productionProject,token),proof);
  return proof;
 }
 export function assertGx350ProdProof(raw,proof){
  if(!proof||!VERIFIED_PROD_PROOFS.has(proof))fail('LIVE_EDGE_PROOF_REQUIRED');
  for(const f of LIVE_SCOPE.functions){
   const expected=proof.snapshots.find(x=>x.slug===f.slug);
   const actual=exactMeta(raw,f);
   const {files,...snapshot}=expected;
   if(files!==f.candidate.length||JSON.stringify(actual)!==JSON.stringify(snapshot))fail('LIVE_EDGE_PROOF_DRIFT:'+f.slug);
  }
  return true;
 }
