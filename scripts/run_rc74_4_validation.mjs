import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const recovery=path.join(root,'recovery');
const QA_REF='gjztkdwfmunnzhtvxrsu';
const PROD_REF='pjhmrhejsoofmouedavw';
const evidence={
  schema:'iberfit.rc74.4.phase-b.local-validation.v1',
  release:'IBERFIT_M26_CANARY_RC74_4_PHASE_B',
  generatedAt:new Date().toISOString(),
  branch:process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME||process.env.CF_PAGES_BRANCH||null,
  phase:'B',
  productionModified:false,
  productionDeployed:false,
  progressConflictPolicyActivated:true,
  steps:[],
};

function run(name,command,args=[],extraEnv={}){
  const result=spawnSync(command,args,{
    cwd:root,
    encoding:'utf8',
    stdio:'inherit',
    env:{...process.env,...extraEnv},
    shell:false,
  });
  const spawnError=result.error?{
    code:result.error.code||null,
    message:String(result.error.message||result.error).slice(0,300),
  }:null;
  evidence.steps.push({name,ok:result.status===0&&!spawnError,status:result.status,spawnError});
  if(spawnError)throw new Error(`RC74_4_PROCESS_START_FAILED:${name}:${spawnError.code||'UNKNOWN'}`);
  if(result.status!==0)throw new Error(`RC74_4_VALIDATION_FAILED:${name}`);
}

function runNpm(name,args=[]){
  const npmCli=process.env.npm_execpath;
  if(npmCli&&fs.existsSync(npmCli)){
    return run(name,process.execPath,[npmCli,...args]);
  }
  if(process.platform==='win32'){
    const comspec=process.env.ComSpec||process.env.COMSPEC||'cmd.exe';
    return run(name,comspec,['/d','/s','/c',`npm ${args.join(' ')}`]);
  }
  return run(name,'npm',args);
}

function assertSourceContracts(){
  const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
  const catalog=read('src/m26/command-catalog.js');
  const transport=read('src/m26/supabase-transport.js');
  const bus=read('src/m26/command-bus.js');
  const progress="['EJECUCION_GUARDAR_PROGRESO','session_execution','GUARDAR',['coach','cliente'],false,false,false,true,false,true]";
  if(!catalog.includes(progress))throw new Error('RC74_4_PHASE_B_PROGRESS_POLICY_NOT_ACTIVE');
  for(const field of ['snapshotOnApply','conflictSensitive','bootstrapAllowed']){
    if(!catalog.includes(field))throw new Error(`RC74_4_REGISTRY_FIELD_MISSING:${field}`);
  }
  if(!transport.includes(`M26_QA_PROJECT_REF='${QA_REF}'`))throw new Error('RC74_4_QA_TRANSPORT_REF_MISSING');
  if(!transport.includes('raw?.qaOnly === true'))throw new Error('RC74_4_QA_BOOLEAN_GUARD_MISSING');
  if(!transport.includes('receiptResponse.executionRevision'))throw new Error('RC74_4_EXECUTION_REVISION_NORMALIZATION_MISSING');
  if(!transport.includes('snapshot_on_apply,conflict_sensitive,bootstrap_allowed'))throw new Error('RC74_4_REGISTRY_SELECT_INCOMPLETE');
  if(!bus.includes('M26_OPERATION_CONTRACT_STALE')||!bus.includes('alignStoredContract'))throw new Error('RC74_4_OFFLINE_REBASE_CAPABILITY_MISSING');
  for(const file of [
    '20260825005258_iberfit_rc74_4h_operation_identity_qa.sql',
    '20260825011031_iberfit_rc74_4i_server_conflict_policy_qa.sql',
    '20260825011758_iberfit_rc74_4j_internal_command_rpc_permissions_qa.sql',
    '20260825020434_iberfit_rc74_4l_qa_health_environment_truth.sql',
    '20260825022525_iberfit_rc74_4m_execution_lock_release_qa.sql',
    '20260825023803_iberfit_rc74_4n_execution_cancel_cascade_qa.sql',
    '20260825024902_iberfit_rc74_4o_active_execution_command_guard_qa.sql',
  ]){
    if(!fs.existsSync(path.join(root,'supabase','migrations',file)))throw new Error(`RC74_4_MIGRATION_LEDGER_MISSING:${file}`);
  }
  const activeK=path.join(root,'supabase','migrations','20260825132326_iberfit_rc74_4k_progress_conflict_qa.sql');
  const retiredK=path.join(root,'recovery','rc74-4-phase-b','20260825013000_iberfit_rc74_4k_progress_conflict_qa.sql');
  if(!fs.existsSync(activeK))throw new Error('RC74_4_PHASE_B_MIGRATION_NOT_ACTIVE');
  if(fs.existsSync(retiredK))throw new Error('RC74_4_PHASE_B_STAGED_COPY_NOT_RETIRED');
  const activeKSql=fs.readFileSync(activeK,'utf8');
  for(const required of ['RC74_4K_QA_ENVIRONMENT_REQUIRED','RC74_4K_ACTIVE_EXECUTION_LOCKS','RC74_4K_ACTIVE_EXECUTIONS','RC74_4K_LEGACY_PROGRESS_IDENTITIES','iberfit_finalize_execution_cancel_v26','iberfit_active_execution_command_guard_v26']){
    if(!activeKSql.includes(required))throw new Error(`RC74_4_PHASE_B_GUARD_MISSING:${required}`);
  }
  const envExample=read('.env.example');
  if(envExample.includes(PROD_REF)||!envExample.includes(QA_REF)||!envExample.includes('M26_QA_ONLY=true'))throw new Error('RC74_4_ENV_EXAMPLE_NOT_QA_ONLY');
  evidence.steps.push({name:'source-contracts',ok:true,status:0});
}

try{
  fs.mkdirSync(recovery,{recursive:true});
  assertSourceContracts();
  run('repository-hygiene',process.execPath,['scripts/remote-gates/check_repository_hygiene.mjs']);
  runNpm('full-node-regression',['test']);
  run('current-source-surface',process.execPath,['qa/rc64/build-current-surface.mjs']);
  run('rc74-runtime-generator',process.execPath,['scripts/generate_rc74_4_runtime_config.mjs'],{
    M26_SUPABASE_URL:`https://${QA_REF}.supabase.co`,
    M26_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_validation_rc74_4',
    M26_PROJECT_REF:QA_REF,
    M26_QA_ONLY:'true',
    M26_RUNTIME_VALIDATION_ONLY:'true',
    M26_BUILD_DIR:path.join(root,'.tmp','rc64-current-surface'),
    CF_PAGES_BRANCH:'canary/rc74-4',
  });
  const generated=fs.readFileSync(path.join(root,'.tmp','rc64-current-surface','m26','runtime-config.js'),'utf8');
  if(!generated.includes(QA_REF)||generated.includes(PROD_REF)||!generated.includes('"qaOnly": true'))throw new Error('RC74_4_GENERATED_RUNTIME_NOT_QA_ONLY');
  evidence.steps.push({name:'generated-runtime-contract',ok:true,status:0});
  evidence.ok=true;
}catch(error){
  evidence.ok=false;
  evidence.error=String(error?.message||error).slice(0,500);
  fs.writeFileSync(path.join(recovery,'RC74_4_PHASE_B_LOCAL_VALIDATION.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
  throw error;
}
fs.writeFileSync(path.join(recovery,'RC74_4_PHASE_B_LOCAL_VALIDATION.json'),JSON.stringify(evidence,null,2)+'\n','utf8');
console.log(JSON.stringify(evidence,null,2));
