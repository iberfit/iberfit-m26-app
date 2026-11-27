// GX350 backend activation, independent of Pages. No generic production writer.
// Exact functional source, exact release marker, exact QA gates, fresh backup,
// live pre/post catalog attestation. Never changes Hosted Auth, Vault or secrets.
// An interrupted/partially used activation is a forward-fix incident, not a blind rollback.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {composeGxBackendRelease,readGxBackendRelease,unwrapReleaseSql} from './gx_backend_release_v1.mjs';
import {renderScopedReadback,renderDeferredIri,readTemplate,readDeferredIriTemplate} from './gx350_onboarding_readback.mjs';
import {gitBlob,validateScope} from './gx350_edge_scope.mjs';
import {repositoryReader,rehearseEdgePackages} from './gx350_edge_stage_rehearsal.mjs';
import {GX350_CANDIDATE,GX350_PREVIOUS_LIVE,gx350SourceScope,CATALOG_SQL,RLS_SQL,verifyGx350Catalog,verifyGx350Edges,verifyGx350CandidateEdge,verifyGx350ProdEdges} from '../release/verify_gx350_preactivated.mjs';
import {SQL as M1_SQL,certifyAlreadyActiveBackend} from '../release/verify_backend_preactivated.mjs';
import {verifySourceQaGates} from '../release/verify_source_qa_gates.mjs';
import {evaluateM44OffsiteRecovery} from '../data-safety/check_m44_offsite_recovery_readiness.mjs';
const REPO='iberfit/iberfit-m26-app',CANARY='canary/rc74-4',PROD='pjhmrhejsoofmouedavw',QA='gjztkdwfmunnzhtvxrsu';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const manifest=validateScope(JSON.parse(readFileSync(new URL('./gx350_edge_scope.json',import.meta.url),'utf8')));
const fail=code=>{throw Error('GX350_ACTIVATION_'+code);};
const ZERO='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945';
const BEFORE=Object.freeze({functions:[6,'d409e4c193ce0e0d38b562c2c61a2b3f2fe7ef91cfbef4fb12489be46181ace8'],indexes:[0,ZERO],policies:[0,ZERO],table:[0,ZERO],triggers:[0,ZERO]});
const AFTER=Object.freeze({functions:[49,'485a332c10d7a5362b6b604170ae0cb481f993f5e2d77f375e51383d6197cd60'],indexes:[5,'76e2415cefbaee66fefc40d2d7f5a867a3022af80675708e97a3f905b8c44673'],policies:[4,'71d9584e10e0931fcadba59eb8bb59136acb64371b07a24dd04c4c20e55798f7'],table:[1,'85299e1e08e47c16a854b4c1048eafa1230b2e02f20cbfaee280c7025ee4fbf3'],triggers:[8,'c3b69c9f7f428d1fbdf6bc90bf6e25880d51203ff8c74a5db00b5441e446852c']});
const read=repositoryReader(ROOT);
function rows(x){return Array.isArray(x)?x:x?.result;}
export function verifyPriorCatalog(raw,rls){
 const a=rows(raw),b=rows(rls);
 if(!Array.isArray(a)||a.length!==5||new Set(a.map(x=>x?.category)).size!==5)fail('PRIOR_CATALOG_SHAPE');
 for(const x of a){const p=BEFORE[x?.category];if(!p||String(x.total)!==String(p[0])||x.digest!==p[1])fail('PRIOR_CATALOG_DRIFT');}
 if(!Array.isArray(b)||b.length!==1||String(b[0]?.rls_tables)!=='4'||String(b[0]?.valid_indexes)!=='0')fail('PRIOR_RLS_DRIFT');
}
export function assertCatalogSql(expected,indexes){
 return `DO $gx350_catalog$
 DECLARE actual jsonb; r jsonb;
 BEGIN
 SELECT jsonb_object_agg(category,jsonb_build_array(total,digest)) INTO actual FROM (${CATALOG_SQL}) s;
 IF actual IS DISTINCT FROM '${JSON.stringify(expected)}'::jsonb THEN RAISE EXCEPTION 'GX350_CATALOG_TRANSACTION_DRIFT'; END IF;
 SELECT to_jsonb(s) INTO r FROM (${RLS_SQL}) s;
 IF r IS DISTINCT FROM jsonb_build_object('rls_tables',4,'valid_indexes',${indexes}) THEN RAISE EXCEPTION 'GX350_RLS_TRANSACTION_DRIFT'; END IF;
 END $gx350_catalog$;`;
}
export function buildAtomicSql({dryRun=false}={}){
 const {contract,read:readSql}=readGxBackendRelease(ROOT);
 const render=mode=>[
  composeGxBackendRelease(contract,readSql,{mode}),
  renderScopedReadback(readTemplate(),{mode}),
  renderDeferredIri(readDeferredIriTemplate(),{mode})
 ].map(x=>unwrapReleaseSql(x));
 const install=render('install'),rollback=render('rollback').reverse();
 // Dry run checks both directions, in a single transaction, on actual PROD.
 // Only the final install can commit, and only if all catalog/ACL checks match.
 return ['BEGIN;',"SET LOCAL lock_timeout='3s';","SET LOCAL statement_timeout='30s';",
  assertCatalogSql(BEFORE,0),...install,assertCatalogSql(AFTER,5),
  ...(dryRun?[...rollback,assertCatalogSql(BEFORE,0),'ROLLBACK;']:['COMMIT;']),''].join('\n');
}
async function json(url,token,method='GET',body){
 const response=await fetch(url,{method,redirect:'error',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(method==='POST'?120000:30000)});
 if(!response.ok){await response.body?.cancel();fail('HTTP_'+response.status);}
 return response.json();
}
const gh=path=>json('https://api.github.com/repos/'+REPO+path,process.env.GH_ACTIONS_TOKEN);
const mg=(ref,path,method='GET',body)=>{if(![QA,PROD].includes(ref))fail('PROJECT_SCOPE');return json('https://api.supabase.com/v1/projects/'+ref+path,process.env.SUPABASE_ACCESS_TOKEN,method,body);};
const sql=(ref,query)=>mg(ref,'/database/query/read-only','POST',{query});
const list=ref=>mg(ref,'/functions');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function edgeRows(raw){const a=Array.isArray(raw)?raw:raw?.functions;if(!Array.isArray(a))fail('EDGE_SHAPE');return a;}
export function classifyEdgeState(raw,f){
 const a=edgeRows(raw).filter(x=>x.slug===f.slug);
 const e=a[0];
 if(a.length!==1||!e||e.status!=='ACTIVE'||e.verify_jwt!==f.verifyJwt||!Number.isSafeInteger(e.version)||e.version<f.prodVersion)fail('EDGE_STATE_DRIFT');
 if(e.ezbr_sha256===f.prodBundle)return 'prior';
 if(e.ezbr_sha256===f.qaBundle)return 'candidate';
 fail('EDGE_STATE_UNKNOWN');
}
async function reconcileEdgeState(raw,f){
 let state;
 try{state=classifyEdgeState(raw,f);}
 catch(e){if(e.message!=='GX350_ACTIVATION_EDGE_STATE_UNKNOWN')throw e;state='candidate';}
 if(state==='candidate'){
  const proof=await verifyGx350CandidateEdge(PROD,raw,f.slug,process.env.SUPABASE_ACCESS_TOKEN);
  console.log('GX350_ACTIVATION_EDGE_SOURCE_VERIFIED:'+f.slug+':'+proof.digest+':files='+proof.files);
 }
 return state;
}
function verifyPriorEdges(raw){
 for(const f of manifest.functions)if(classifyEdgeState(raw,f)!=='prior')fail('PRIOR_EDGE_DRIFT');
}
export function classifyCatalogState(a,b){
 try{verifyPriorCatalog(a,b);return 'prior';}catch{}
 try{verifyGx350Catalog(a,b);return 'candidate';}catch{}
 fail('SQL_STATE_UNKNOWN');
}
async function catalogState(){
 const [a,b]=await Promise.all([sql(PROD,CATALOG_SQL),sql(PROD,RLS_SQL)]);
 return classifyCatalogState(a,b);
}
async function checkLive(){
 const v=await json('https://app.iberfit.cl/m26/version.json?gx350='+Date.now());
 if(v.sourceSha!==GX350_PREVIOUS_LIVE||v.projectRef!==PROD||v.environment!=='PRODUCTION'||v.production!==true||v.qaOnly!==false)fail('LIVE_BASELINE_DRIFT');
}
export function verifyCanaryIdentity(v,source){
 if(!v||v.sourceSha!==source||v.sourceBranch!==CANARY||v.projectRef!==QA||v.environment!=='QA'||v.qaOnly!==true||v.production!==false)fail('CANARY_LIVE_DRIFT');
 return true;
}
async function checkCanary(source){
 const ref=await gh('/branches/canary%2Frc74-4');
 if(ref.commit?.sha!==source)fail('CANARY_HEAD_DRIFT');
 const v=await json('https://m26-canary.iberfit.cl/m26/version.json?gx350='+Date.now());
 verifyCanaryIdentity(v,source);
}
async function readbackPrior(){
 const [a,b,m,e]=await Promise.all([sql(PROD,CATALOG_SQL),sql(PROD,RLS_SQL),sql(PROD,M1_SQL),list(PROD)]);
 verifyPriorCatalog(a,b);verifyPriorEdges(e);certifyAlreadyActiveBackend(m,e);
}
async function readbackQA(){
 const [a,b,e]=await Promise.all([sql(QA,CATALOG_SQL),sql(QA,RLS_SQL),list(QA)]);
 verifyGx350Catalog(a,b);verifyGx350Edges(e);
 for(const f of manifest.functions)await verifyGx350CandidateEdge(QA,e,f.slug,process.env.SUPABASE_ACCESS_TOKEN);
}
async function backupProof(source){
 const raw=await gh('/actions/runs?head_sha='+source+'&per_page=100');
 const candidates=raw.workflow_runs?.filter(x=>x.name==='IBERFIT M44 Encrypted Offsite Disaster Recovery'&&x.head_sha===source&&x.head_branch===CANARY&&x.status==='completed'&&x.conclusion==='success').sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))||[];
 if(!candidates.length)fail('BACKUP_NOT_READY');
 const r=candidates[0];
 const [j,a]=await Promise.all([gh('/actions/runs/'+r.id+'/jobs?per_page=100&filter=all'),gh('/actions/runs/'+r.id+'/artifacts?per_page=100')]);
 const proof=evaluateM44OffsiteRecovery(r,j,a);
 if(!proof.ok||!proof.productionMigrationApproved||proof.platformRecoveryVerified!==false)fail('BACKUP_PROOF');
 console.log('GX350_ACTIVATION_BACKUP_VERIFIED:'+proof.runId+':artifact='+proof.artifactId);
}
async function waitExact(source){
 for(let i=0;i<140;i++){
  const inventory=await gh('/actions/runs?head_sha='+source+'&per_page=100');
  try{verifySourceQaGates(inventory,source);await checkCanary(source);await backupProof(source);return;}
  catch(error){
   const message=String(error.message||'');
   if(message.includes(':completed:failure')||message.includes(':completed:cancelled')||message.includes('CANARY_HEAD_DRIFT'))throw error;
   if(i%10===0)console.log('GX350_ACTIVATION_WAIT_EXACT_GATES');
   await wait(15000);
  }
 }
 fail('EXACT_GATES_TIMEOUT');
}
export function validateMarker(m,branch,head,parent,changed){
 if(!m||m.schema!=='iberfit.production.release.v1'||m.promote!==true||m.target!=='iberfit-m26-production'||m.domain!=='app.iberfit.cl'||m.frontendOnly!==true||m.sourceBranch!==CANARY||m.expectedPreviousLiveSha!==GX350_PREVIOUS_LIVE||m.datedTrainingMode!=='active'||m.backendActivationProof!=='verified-dated-sql-edge'||m.gx350BackendActivation!==true||m.sourceSha!==parent||branch!=='release/prod-'+parent.slice(0,12)||!/^[a-f0-9]{40}$/u.test(head)||changed.length!==1||changed[0]!=='.iberfit/production-release.json')fail('MARKER_INVALID');
 return m.sourceSha;
}
function marker(){
 const m=JSON.parse(readFileSync(new URL('../../.iberfit/production-release.json',import.meta.url),'utf8'));
 const git=args=>execFileSync('/usr/bin/git',args,{cwd:ROOT,encoding:'utf8',timeout:10000}).trim();
 const head=git(['rev-parse','HEAD']),parent=git(['rev-parse','HEAD^']);
 if(head!==process.env.GITHUB_SHA)fail('MARKER_HEAD');
 const source=validateMarker(m,process.env.GITHUB_REF_NAME,head,parent,git(['diff','--name-only',parent,head]).split(/\r?\n/u));
 if(!gx350SourceScope({sourceSha:source,expectedPreviousLiveSha:GX350_PREVIOUS_LIVE}))fail('SOURCE_SCOPE');
 return source;
}
async function deploy(f){
 // Never overwrite an unknown live bundle. A candidate already installed by
 // the same scoped rollout is probed, not redeployed.
 let state=await reconcileEdgeState(await list(PROD),f);
 if(state==='candidate'){await probeEdge(f);return;}
 const dir=mkdtempSync(join(tmpdir(),'iberfit-gx350-prod-'));
 try{
  const target=join(dir,'supabase','functions',f.slug);mkdirSync(target,{recursive:true});
  writeFileSync(join(dir,'supabase','config.toml'),'project_id = "iberfit-gx350"\n[functions.'+f.slug+']\nverify_jwt = '+f.verifyJwt+'\n',{flag:'wx'});
  for(const x of f.candidate){
   const bytes=read(x.sourceRef,x.sourcePath);if(gitBlob(bytes)!==x.blob)fail('EDGE_SOURCE_DRIFT');
   const path=join(target,x.name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx'});
  }
  for(let attempt=0;attempt<2;attempt++){
   // A transport error may have occurred after commit. Reconcile from live
   // metadata before retrying; do not turn an unknown digest into a retry.
   try{execFileSync(join(dirname(process.execPath),'npx'),['--yes','supabase@2.117.0','functions','deploy',f.slug,'--workdir',dir,'--project-ref',PROD,'--use-api','--yes',...(f.verifyJwt?[]:['--no-verify-jwt'])],{stdio:'pipe',timeout:180000,maxBuffer:1024*1024});}catch{}
   state=await reconcileEdgeState(await list(PROD),f);
   if(state==='candidate')break;
   if(attempt===0)await wait(2000);
  }
  if(state!=='candidate')fail('EDGE_DEPLOY_NOT_CONFIRMED');
  await probeEdge(f);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
async function probeEdge(f){
 const res=await fetch('https://'+PROD+'.supabase.co/functions/v1/'+f.slug,{method:'POST',redirect:'error',headers:{Origin:'https://app.iberfit.cl','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
 await res.body?.cancel();if(res.status!==401)fail('EDGE_UNAUTH_DENIAL');
 console.log('GX350_ACTIVATION_EDGE_VERIFIED:'+f.slug);
}
async function verifyHostedEvidence(){
 // Bind this independently certified QA run to the immutable functional candidate.
 const run=await gh('/actions/runs/46047844707');
 if(run.head_sha!=='f09aa6d5f22eb91e4dde10981bcb2997f24ec09b'||run.name!=='GX350 isolated QA hosted Edge rollback'||run.status!=='completed'||run.conclusion!=='success')fail('HOSTED_ROLLBACK_EVIDENCE');
}
async function preflight(){
 await checkLive();await readbackQA();await verifyHostedEvidence();
 const state=await catalogState();
 if(state==='prior')await readbackPrior();
 else{const edges=await list(PROD);for(const f of manifest.functions)await reconcileEdgeState(edges,f);console.log('GX350_ACTIVATION_READONLY_PARTIAL_STATE_VERIFIED');}
 rehearseEdgePackages(manifest,read);buildAtomicSql({dryRun:true});buildAtomicSql();
 console.log('GX350_ACTIVATION_READONLY_PREFLIGHT_OK');
}
async function activate(){
 const source=marker();await waitExact(source);
 await checkLive();await readbackQA();await verifyHostedEvidence();
 rehearseEdgePackages(manifest,read);buildAtomicSql({dryRun:true});buildAtomicSql();
 await checkCanary(source);await backupProof(source);
 const state=await catalogState();
 if(state==='prior'){
  await readbackPrior();
  // Check both directions on live schema with no committed writes. The exact
  // SQL install transaction rechecks baseline under its own DDL locks.
  await mg(PROD,'/database/query','POST',{query:buildAtomicSql({dryRun:true})});
  await readbackPrior();await checkLive();await checkCanary(source);await backupProof(source);
  console.log('GX350_ACTIVATION_DRYRUN_ROLLBACK_OK');
  let error=null;
  try{await mg(PROD,'/database/query','POST',{query:buildAtomicSql()});}catch(e){error=e;}
  // Do not blindly retry a transaction after transport failure. Read back
  // exact committed catalog, then resume only if it is the known candidate.
  if(await catalogState()!=='candidate'){if(error)throw error;fail('SQL_COMMIT_UNVERIFIED');}
  console.log('GX350_ACTIVATION_SQL_COMMITTED');
 }else{
  // Resume after an interrupted exact-marker cut, never after schema drift.
  // Every edge must still be either the pinned prior or exact candidate.
  const liveEdges=await list(PROD);
  for(const f of manifest.functions)await reconcileEdgeState(liveEdges,f);
  console.log('GX350_ACTIVATION_SQL_ALREADY_EXACT');
 }
 // From here, never auto-drop data or roll back a potentially used service.
 for(const f of manifest.functions){await checkLive();await checkCanary(source);await deploy(f);}
 const [m,e]=await Promise.all([sql(PROD,M1_SQL),list(PROD)]);
 const prodProof=await verifyGx350ProdEdges(e,process.env.SUPABASE_ACCESS_TOKEN);
 certifyAlreadyActiveBackend(m,e,{gx350:true,prodProof});await checkLive();await checkCanary(source);
 console.log('GX350_ACTIVATION_PROD_BACKEND_CERTIFIED:sql=49:edge=3:hosted_auth_writes=0');
}
async function waitPages(){
 const m=JSON.parse(readFileSync(new URL('../../.iberfit/production-release.json',import.meta.url),'utf8'));
 if(m.gx350BackendActivation!==true)return;
 const source=marker();
 for(let i=0;i<160;i++){
  const a=await gh('/actions/runs?head_sha='+process.env.GITHUB_SHA+'&per_page=100');
  const run=a.workflow_runs?.filter(x=>x.name==='IBERFIT GX350 Independent Backend Activation'&&x.event==='push'&&x.head_sha===process.env.GITHUB_SHA&&x.head_branch===process.env.GITHUB_REF_NAME).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0];
  if(run?.status==='completed'){if(run.conclusion!=='success')fail('BACKEND_RUN_'+run.conclusion);await checkCanary(source);console.log('GX350_ACTIVATION_INDEPENDENT_RUN_OK:'+run.id);return;}
  await wait(15000);
 }
 fail('BACKEND_RUN_TIMEOUT');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!==REPO||!process.env.GH_ACTIONS_TOKEN)fail('REPO_CONTEXT');
  const arg=process.argv[2];
  if(arg==='--wait-pages'){await waitPages();}
  else if(arg==='--activate'&&process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REF?.startsWith('refs/heads/release/prod-')){
   const markerData=JSON.parse(readFileSync(new URL('../../.iberfit/production-release.json',import.meta.url),'utf8'));
   if(markerData.gx350BackendActivation!==true)console.log('GX350_ACTIVATION_NOT_REQUESTED');
   else{if(!process.env.SUPABASE_ACCESS_TOKEN)fail('MANAGEMENT_TOKEN');await activate();}
  }else if(arg==='--preflight'&&process.env.GITHUB_REF==='refs/heads/ops/gx350-m44-managed-recovery-preflight'){
   if(!process.env.SUPABASE_ACCESS_TOKEN)fail('MANAGEMENT_TOKEN');await preflight();
  }else fail('OPERATION_CONTEXT');
 }catch(e){const msg=String(e?.message||'');console.error(/^(GX350_|M44_|CUTOVER_|SIGNATURE_)/u.test(msg)?msg:'GX350_ACTIVATION_FAILED');process.exitCode=1;}
}
