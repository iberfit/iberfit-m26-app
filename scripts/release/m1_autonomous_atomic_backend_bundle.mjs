// M1 one-shot PostgreSQL cutover source builder. PURE: never contacts PROD.
// The protected operator lane MUST verify full M44 Hosted Auth/Vault/Edge restore,
// fresh recoverable DB+Storage, exact Canary SHA, JWT/role boundaries, and QA
// Coach -> Client A -> Coach acceptance BEFORE executing a generated bundle.
// SQL is one transaction: U72 -> autonomous U31/U33/U60 -> public U60 grants.
// On error PostgreSQL aborts the whole transaction. Never install partially.
import {readFileSync} from 'node:fs';

const paths=Object.freeze({
 u72:'supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql',
 autonomous:'supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.sql',
 enable:'supabase/release-procedures/20261112_m1_u60_prod_guarded_enable.sql',
 disable:'supabase/release-procedures/20261112_m1_u60_prod_guarded_disable.sql',
 autonomousRollback:'supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.rollback.sql',
 u72Rollback:'supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql',
});
export const M1_AUTONOMOUS_FUNCTION_MD5=Object.freeze({
 u31:'6e63f97899c94d94192c23e669cfd347',
 u33:'3eb919f3032f7ffed566a203b43ff453',
 privateDetail:'a022c4e11a7431775a5a76b710f17f0d',
});
const signatures=Object.freeze({
 u31:'private.iberfit_u31_occurrence_transition_v1(jsonb)',
 u33:'private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)',
 privateDetail:'private.iberfit_u60_occurrence_detail_v1(uuid,uuid)',
});
const requireText=(x,label)=>{
 if(typeof x!=='string'||x.length<500||x.includes('\\0'))
  throw Error('M1_BUNDLE_'+label+'_INVALID');
 return x.replace(/\r\n/gu,'\n').trim()+'\n';
};
const unwrapTransaction=(raw,label)=>{
 let s=requireText(raw,label);
 if((s.match(/^BEGIN;\s*$/gmu)||[]).length!==1||
    (s.match(/^COMMIT;\s*$/gmu)||[]).length!==1)
   throw Error('M1_BUNDLE_'+label+'_TRANSACTION_CONTRACT');
 s=s.replace(/^BEGIN;\s*$/mu,'').replace(/^COMMIT;\s*$/mu,'').trim()+'\n';
 if(/^COMMIT;\s*$/mu.test(s)||/^ROLLBACK;\s*$/mu.test(s))
   throw Error('M1_BUNDLE_'+label+'_UNEXPECTED_BOUNDARY');
 return s;
};
function readonlyFences(){
 const list=Object.entries(M1_AUTONOMOUS_FUNCTION_MD5).map(([key,hash])=>
  " IF md5(pg_get_functiondef('"+signatures[key]+
  "'::regprocedure)) IS DISTINCT FROM '"+hash+
  "' THEN RAISE EXCEPTION 'M1_AUTONOMOUS_RELEASE_"+key.toUpperCase()+
  "_HASH_DRIFT'; END IF;").join('\n');
 return "DO $m1_autonomous_bundle_verified$\nBEGIN\n"+
 list+"\nEND $m1_autonomous_bundle_verified$;\n";
}
function validateInputs(src){
 const u72=requireText(src.u72,'U72');
 const autonomous=requireText(src.autonomous,'AUTONOMOUS');
 const enable=unwrapTransaction(src.enable,'ENABLE');
 const disable=unwrapTransaction(src.disable,'DISABLE');
 const autonomousRollback=requireText(src.autonomousRollback,'AUTONOMOUS_ROLLBACK');
 const u72Rollback=unwrapTransaction(src.u72Rollback,'U72_ROLLBACK');
 for(const [data,marker,label] of [
  [u72,"M1_U72_PROD_ENVIRONMENT_DENIED",'U72'],
  [u72,"M1_U72_PROD_MUST_BE_CLOSED_AND_DRAINED",'U72'],
  [autonomous,"M1_AUTONOMOUS_U72_PREREQUISITE_MISSING",'AUTONOMOUS'],
  [autonomous,"M1_AUTONOMOUS_PROD_MUST_BE_CLOSED",'AUTONOMOUS'],
  [autonomous,"M1_AUTONOMOUS_PRIVATE_ACL_DRIFT",'AUTONOMOUS'],
  [enable,"U60_PROD_SOURCE_ACL_DRIFT",'ENABLE'],
  [enable,"U60_PROD_RLS_EXECUTION_FENCE_DRIFT",'ENABLE'],
  [disable,"U60_ROLLBACK_ACTIVE_TRAINING_FORBIDDEN",'DISABLE'],
  [autonomousRollback,"M1_AUTONOMOUS_ROLLBACK_FIRST_CLOSE_U60",'AUTONOMOUS_ROLLBACK'],
  [u72Rollback,"M1_U72_PROD_ROLLBACK_UNSAFE_OR_DRIFT",'U72_ROLLBACK'],
 ]){
  if(!data.includes(marker))throw Error('M1_BUNDLE_'+label+'_GUARD_MISSING');
 }
 for(const [key,signature] of Object.entries(signatures)){
  if(!autonomous.includes('CREATE OR REPLACE FUNCTION '+signature.split('(')[0])||
     !autonomousRollback.includes('CREATE OR REPLACE FUNCTION '+signature.split('(')[0]))
   throw Error('M1_BUNDLE_'+key.toUpperCase()+'_RESTORE_MISSING');
 }
 return {u72,autonomous,enable,disable,autonomousRollback,u72Rollback};
}
export function composeM1AutonomousBackendCutover(input){
 const s=validateInputs(input);
 // NO network, SQL execution, or user data. All grants occur at the END.
 return Object.freeze({
  schema:'iberfit.m1.autonomous.atomic-cutover.v1',
  install:"-- PROTECTED M1: M44 full-platform evidence prerequisite OUTSIDE SQL.\n"+
    "BEGIN;\nSET LOCAL lock_timeout='3s';\n"+
    s.u72+'\n'+s.autonomous+'\n'+readonlyFences()+'\n'+s.enable+"\nCOMMIT;\n",
  rollback:"-- PROTECTED M1: freeze admission, drain executions, then reverse.\n"+
    "BEGIN;\nSET LOCAL lock_timeout='3s';\n"+
    s.disable+'\n'+s.autonomousRollback+'\n'+s.u72Rollback+"\nCOMMIT;\n",
  databaseWrites:0, // this compiler does not execute the generated SQL
  fullPlatformRecoveryCertified:false,
  productionAuthorized:false,
 });
}
export function loadM1AutonomousBundleSources(){
 return Object.fromEntries(Object.entries(paths).map(([key,path])=>
   [key,readFileSync(new URL('../../'+path,import.meta.url),'utf8')]));
}
// Deliberately no CLI runner: this library NEVER writes or exports a runnable
// production SQL file automatically, even when imported by GitHub Actions.
