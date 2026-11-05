/**
 * IBERFIT QA-only official migration-history correction.
 * Attempt 1 is read-only. Attempt 2 requires an explicit re-run of the same
 * successful GitHub job (same SHA/runId) with <=2h immutable evidence.
 * No DDL, user-data mutations, PROD access or public RPC grants.
 */
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const QA='gjztkdwfmunnzhtvxrsu';
export const REPO='iberfit/iberfit-m26-app';
export const BRANCH='feat/u60-training360-r50-reconciled-20261104';
export const VERSIONS=Object.freeze([
  '20261025182000','20261025194000','20261025203500',
  '20261025210500','20261025223000','20261025231500','20261025235500',
]);
const AUDIT_FILE='scripts/u60/qa_readonly_reconciliation.sql';
const OUT='.tmp/u60-qa-ledger';
const PROOF=OUT+'/qa-evidence.json';

export function buildProbeSql(source,rows){
  if(rows!==0&&rows!==7)throw Error('QA_INVALID_LEDGER_EXPECTATION');
  const marker='SELECT jsonb_build_object(';
  const index=source.lastIndexOf(marker);
  if(index<0||source.indexOf(marker)!==index||!source.includes('AS report FROM flags;'))
    throw Error('QA_AUDIT_SQL_CONTRACT_CHANGED');
  const predicates=[
    'ledger_rows='+rows,'verified_functions=8','drifted_functions=0',
    'signature_count_ok','table_private','same_client_fk','execution_fk',
    'source_triggers_count','unique_index_guards','legacy_write_chain_fingerprints',
    'receipt_schema_ready','legacy_lock_shared',
  ];
  return source.slice(0,index)
    +"SELECT CASE WHEN coalesce(("+predicates.join(' AND ')+"),false)"
    +" THEN 'U60_QA_PROBE_GO' ELSE 'U60_QA_PROBE_BLOCKED' END"
    +" AS verification, ledger_rows, verified_functions, drifted_functions FROM flags;\n";
}
export function extractRow(root){
  function find(v,depth=0){
    if(depth>12||v==null)return null;
    if(typeof v==='string'){
      const s=v.trim();
      if(s[0]==='{'||s[0]==='['){
        try{return find(JSON.parse(s),depth+1);}catch{return null;}
      }
      return null;
    }
    if(Array.isArray(v)){
      for(const item of v){const hit=find(item,depth+1);if(hit)return hit;}
    }else if(typeof v==='object'){
      if(Object.hasOwn(v,'verification')&&Object.hasOwn(v,'ledger_rows'))return v;
      for(const item of Object.values(v)){const hit=find(item,depth+1);if(hit)return hit;}
    }
    return null;
  }
  return find(root);
}
const hash=s=>createHash('sha256').update(s).digest('hex');
export function migrationFilesDigest(items){
  return hash(items.map(v=>v.version+':'+hash(v.content)).join('\n'));
}
function run(bin,args){
  try{
    return execFileSync(bin,args,{encoding:'utf8',timeout:120000,maxBuffer:3000000,stdio:['ignore','pipe','pipe']}).trim();
  }catch(err){
    const detail=String(err?.stderr||'').toLowerCase();
    const category=/hostedmutationconsentrequired|consent required/.test(detail)?'CONSENT_REQUIRED'
      :/unknown flag|flag provided but not defined|invalid option/.test(detail)?'CLI_FLAG_UNSUPPORTED'
      :/failed to connect|could not connect|connection refused|dial tcp|timeout/.test(detail)?'DB_CONNECT_FAILED'
      :/permission denied|403|unauthorized|401|forbidden/.test(detail)?'AUTHZ_REJECTED'
      :/parse|config|deprecated|unsupported|invalid/.test(detail)?'CONFIG_REJECTED'
      :'REMOTE_CLI_UNKNOWN';
    throw Error('QA_OFFICIAL_COMMAND_FAILED_'+String(args[0]).toUpperCase().replace(/[^A-Z]/g,'')+'_'+category);
  }
}
function digestLocal(){
  const items=VERSIONS.map(version=>{
    const paths=run('git',['ls-files','supabase/migrations/'+version+'_*.sql']).split('\n').filter(Boolean);
    if(paths.length!==1||!paths[0].startsWith('supabase/migrations/'+version+'_'))
      throw Error('QA_LOCAL_MIGRATION_AMBIGUOUS_'+version);
    return {version,content:readFileSync(paths[0],'utf8')};
  });
  return migrationFilesDigest(items);
}
function checkContext(stage){
  const e=process.env;
  if(e.GITHUB_REPOSITORY!==REPO||e.GITHUB_REF!=='refs/heads/'+BRANCH
    ||!/^[0-9a-f]{40}$/.test(e.GITHUB_SHA||'')||!e.GITHUB_RUN_ID
    ||!e.SUPABASE_ACCESS_TOKEN||!e.GH_TOKEN
    ||(stage==='preflight'&&e.GITHUB_RUN_ATTEMPT!=='1')
    ||(stage==='apply'&&e.GITHUB_RUN_ATTEMPT!=='2'))
    throw Error('QA_RUNNER_CONTEXT_REFUSED');
  if(run('git',['rev-parse','HEAD'])!==e.GITHUB_SHA)throw Error('QA_SOURCE_SHA_MISMATCH');
  const cli=run('supabase',['--version']);
  if(!/^3\.0\.0(?:\s|$)/.test(cli))throw Error('QA_CLI_VERSION_NOT_PINNED');
  return {e,cli,filesHash:digestLocal(),sqlHash:hash(readFileSync(AUDIT_FILE,'utf8'))};
}
async function checkCurrentHead(e){
  const res=await fetch('https://api.github.com/repos/'+REPO+'/git/ref/heads/'+BRANCH,{
    headers:{Authorization:'Bearer '+e.GH_TOKEN,Accept:'application/vnd.github+json'},
    signal:AbortSignal.timeout(12000),
  });
  if(!res.ok)throw Error('QA_HEAD_CONFIRMATION_UNAVAILABLE');
  const info=await res.json();
  if(info?.object?.sha!==e.GITHUB_SHA)throw Error('QA_BRANCH_MOVED');
}
function verifyRemote(rows){
  const dir=mkdtempSync(join(tmpdir(),'iberfit-u60-qa-'));
  try{
    const sql=join(dir,'probe.sql');
    writeFileSync(sql,buildProbeSql(readFileSync(AUDIT_FILE,'utf8'),rows),{mode:0o600});
    const raw=run('supabase',['db','query','--read-only','--file',sql,'--remote='+QA,'--output','json']);
    let data;
    try{data=JSON.parse(raw);}catch{throw Error('QA_CLI_QUERY_OUTPUT_INVALID_JSON');}
    const record=extractRow(data);
    if(record?.verification!=='U60_QA_PROBE_GO'||Number(record.ledger_rows)!==rows
      ||Number(record.verified_functions)!==8||Number(record.drifted_functions)!==0)
      throw Error('QA_FULL_PARITY_FAILED_EXPECTED_'+rows);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
function save(v){
  mkdirSync(OUT,{recursive:true,mode:0o700});
  writeFileSync(PROOF,JSON.stringify(v,null,2)+'\n',{mode:0o600});
}

export const U60_CANONICAL='20261104150000';
export const U60_INSTALLED_ALIAS='20261105003645';
const U60_MIGRATION_FILE='supabase/migrations/20261104150000_u60_closed_private_read_legacy_writer_fences.sql';

export function buildCanonicalProbeSql(stage){
  if(!['before','after','installed'].includes(stage))throw Error('QA_CANONICAL_PROBE_STAGE_INVALID');
  const canonical=stage==='before'?0:1;
  const alias=stage==='before'?1:0;
  const installed=stage==='installed';
  const fn=[
    'public.iberfit_occurrence_api_u60_v1(text,jsonb)',
    'public.iberfit_occurrence_detail_v1(uuid,uuid)',
    'private.iberfit_u60_occurrence_detail_v1(uuid,uuid)',
    'private.iberfit_u60_typed_execution_fence_v1()',
    'private.iberfit_u60_active_lock_fence_v1()',
    'private.iberfit_u60_dated_execution_identity_guard_v1()',
    'private.iberfit_u60_dated_mirror_receipt_guard_v1()',
    'private.iberfit_u60_occurrence_insert_fence_v1()',
  ];
  const oo=fn.map(x=>"to_regprocedure('"+x+"')").join(',');
  const triggers=[
    'u60_typed_execution_fence','u60_active_lock_fence',
    'u60_dated_execution_update_identity','u60_dated_execution_update_receipt',
    'u60_occurrence_insert_fence',
  ];
  const expectedAuthenticated=[
    'public.iberfit_occurrence_api_u60_v1(text,jsonb)',
    'public.iberfit_occurrence_detail_v1(uuid,uuid)',
  ];
  const authorized=expectedAuthenticated.map(x=>"to_regprocedure('"+x+"')").join(',');
  const old=VERSIONS.map(x=>"'"+x+"'").join(',');
  const triggerList=triggers.map(x=>"'"+x+"'").join(',');
  return "WITH facts AS (SELECT"
    +" (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ("+old+")) AS ledger_rows,"
    +" (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+U60_CANONICAL+"') AS canonical,"
    +" (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='"+U60_INSTALLED_ALIAS+"' AND name='u60_closed_private_read_legacy_writer_fences_20261104150000') AS alias,"
    +" (SELECT count(*) FROM pg_proc WHERE oid IN ("+oo+") AND prosecdef"
    +" AND pg_get_userbyid(proowner)='postgres'"
    +" AND proconfig @> ARRAY['search_path=\"\"']::text[]"
    +" AND NOT has_function_privilege('anon',oid,'EXECUTE')"
    +(installed
      ?" AND has_function_privilege('authenticated',oid,'EXECUTE') = (oid IN ("+authorized+"))"
      :" AND NOT has_function_privilege('authenticated',oid,'EXECUTE')")
    +" AND NOT has_function_privilege('service_role',oid,'EXECUTE')) AS functions,"
    +" (SELECT count(*) FROM pg_trigger WHERE tgname IN ("+triggerList+") AND NOT tgisinternal) AS triggers,"
    +" (SELECT relrowsecurity AND NOT has_table_privilege('anon',oid,'SELECT')"
    +" AND NOT has_table_privilege('authenticated',oid,'SELECT')"
    +" FROM pg_class WHERE oid=to_regclass('public.training_session_occurrences_v1')) AS table_private)"
    +" SELECT CASE WHEN ledger_rows=7 AND canonical="+canonical+" AND alias="+alias+" AND functions=8 AND triggers=5"
    +" AND table_private"
    +" THEN 'U60_QA_PROBE_GO' ELSE 'U60_QA_PROBE_BLOCKED' END AS verification,"
    +" ledger_rows,functions AS verified_functions,(8-functions) AS drifted_functions FROM facts;";
}
function verifyCanonical(stage){
  const dir=mkdtempSync(join(tmpdir(),'iberfit-u60-version-'));
  try{
    const sql=join(dir,'probe.sql');
    writeFileSync(sql,buildCanonicalProbeSql(stage),{mode:0o600});
    const raw=run('supabase',['db','query','--read-only','--file',sql,'--remote='+QA,'--output','json']);
    let data;
    try{data=JSON.parse(raw);}catch{throw Error('QA_VERSION_PROBE_NOT_JSON');}
    const row=extractRow(data);
    if(row?.verification!=='U60_QA_PROBE_GO'||Number(row.ledger_rows)!==7
       ||Number(row.verified_functions)!==8||Number(row.drifted_functions)!==0)
       throw Error('QA_U60_VERSION_ALIAS_PARITY_FAILED_'+stage);
  }finally{rmSync(dir,{recursive:true,force:true});}
}

async function main(){
  const stage=process.argv[2];
  const canonical=stage==='canonical-preflight'||stage==='canonical-apply';
  if(!['preflight','apply','canonical-preflight','canonical-apply'].includes(stage))
    throw Error('QA_STAGE_REQUIRED');
  // Map each allowed logical mode onto the original exact GitHub job attempt.
  const attemptStage=stage.endsWith('preflight')?'preflight':'apply';
  const ctx=checkContext(attemptStage);
  await checkCurrentHead(ctx.e);
  const evidence={
    schema:'iberfit.u60.qa-ledger-proof.v2',stage,project:QA,branch:BRANCH,
    sha:ctx.e.GITHUB_SHA,runId:ctx.e.GITHUB_RUN_ID,
    createdAt:new Date().toISOString(),versions:VERSIONS,
    filesHash:ctx.filesHash,sqlHash:ctx.sqlHash,cli:ctx.cli,
    u60SourceHash:hash(readFileSync(U60_MIGRATION_FILE,'utf8')),
    verified:false,repaired:false,
  };
  verifyRemote(canonical?7:0);
  // Once the official version was reconciled and U67 narrowly authorized two
  // public RPCs, any future source-audit change must be READ-ONLY no-op.
  // It must never try the old alias repair against an already applied version.
  if(canonical&&attemptStage==='preflight'){
    let installed=false;
    try{verifyCanonical('installed');installed=true;}
    catch(err){
      if(!String(err?.message||'').includes('QA_U60_VERSION_ALIAS_PARITY_FAILED_installed'))
        throw err;
    }
    if(installed){
      evidence.verified=true;
      evidence.repaired=false;
      evidence.status='QA_ALREADY_CANONICAL_AND_AUTHORIZED_READONLY';
      save(evidence);
      process.stdout.write('IBERFIT_QA_U60_INSTALLED_LEDGER_READ_ONLY_VERIFIED\n');
      return;
    }
  }
  if(canonical)verifyCanonical('before');
  evidence.verified=true;
  if(attemptStage==='preflight'){
    evidence.status='APPROVED_FOR_EXPLICIT_RERUN';
    save(evidence);
    process.stdout.write('IBERFIT_QA_U60_CANONICAL_READ_ONLY_PREFLIGHT_VERIFIED\n');
    return;
  }
  const original=JSON.parse(readFileSync('.tmp/u60-original/qa-evidence.json','utf8'));
  const age=Date.now()-Date.parse(original.createdAt);
  if(original.schema!==evidence.schema
    ||original.stage!==(canonical?'canonical-preflight':'preflight')
    ||original.status!=='APPROVED_FOR_EXPLICIT_RERUN'
    ||original.sha!==evidence.sha||original.runId!==evidence.runId
    ||original.project!==QA||original.filesHash!==evidence.filesHash
    ||original.sqlHash!==evidence.sqlHash||original.cli!==evidence.cli
    ||original.u60SourceHash!==evidence.u60SourceHash
    ||original.verified!==true||!Number.isFinite(age)||age<0||age>7200000)
    throw Error('QA_ORIGINAL_PREFLIGHT_INVALID_OR_STALE');
  evidence.status='OFFICIAL_REPAIR_REQUESTED';
  save(evidence);
  if(canonical){
    // Two official metadata-only commands; never duplicate DDL.
    run('supabase',['migration','repair',U60_CANONICAL,'--status','applied','--remote='+QA,'--yes']);
    run('supabase',['migration','repair',U60_INSTALLED_ALIAS,'--status','reverted','--remote='+QA,'--yes']);
    verifyRemote(7);
    verifyCanonical('after');
  }else{
    run('supabase',['migration','repair',...VERSIONS,'--status','applied','--remote='+QA,'--yes']);
    verifyRemote(7);
  }
  evidence.repaired=true;
  evidence.status=canonical?'QA_U60_CANONICAL_VERSION_CONFIRMED':'QA_LEDGER_SEVEN_OF_SEVEN_VERIFIED';
  save(evidence);
  process.stdout.write('IBERFIT_QA_U60_OFFICIAL_VERSION_METADATA_VERIFIED\n');
}

if(process.argv[1]?.endsWith('/qa-ledger-repair.mjs')){
  main().catch(error=>{
    process.stderr.write('IBERFIT_QA_LEDGER_FAIL_CLOSED: '+String(error?.message||'UNKNOWN').slice(0,140)+'\n');
    process.exitCode=1;
  });
}
