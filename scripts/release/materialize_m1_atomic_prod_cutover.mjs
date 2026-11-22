// M1 atomic production cutover materializer. Offline only: DOES NOT connect to
// PROD or authorize SQL execution. 3 already-reviewed sources, one SQL txn.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const M1_ATOMIC_SOURCES=Object.freeze([
 Object.freeze({id:'U72_INSTALL',
  path:'supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql',
  blob:'1b96811cae4b7cfc1daa069e1ece14f264e9768c',transaction:true,
  proof:'M1_U72_PROD_AUTH_ACL_DRIFT'}),
 Object.freeze({id:'AUTONOMOUS_DATES',
  path:'supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.sql',
  blob:'97ab01d06d474fcad94d65efd751ae4b325f8f25',transaction:false,
  proof:'M1_AUTONOMOUS_U33_INSTALL_FAILED'}),
 Object.freeze({id:'U60_ENABLE',
  path:'supabase/release-procedures/20261112_m1_u60_prod_guarded_enable.sql',
  blob:'64280b198675aa8477fb65328717e991a8bc324e',transaction:true,
  proof:'U60_PROD_POST_GRANT_VERIFICATION_FAILED'})
]);
const PREFIX='M1_ATOMIC_PROD_';
const fail=message=>{throw Error(PREFIX+message);};
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
function gitBlob(content){
 const bytes=Buffer.from(content,'utf8');
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
export function stripVerifiedSqlTransaction(content,expected){
 if(typeof content!=='string'||content.length<500||content.includes('\r')||
  !content.includes(expected.proof)||!/^[a-f0-9]{40}$/.test(expected.blob)||
  gitBlob(content)!==expected.blob)fail('PINNED_SOURCE_DRIFT_'+expected.id);
 const lines=content.split('\n');
 const start=lines.flatMap((x,i)=>x.trim()==='BEGIN;'?[i]:[]);
 const end=lines.flatMap((x,i)=>x.trim()==='COMMIT;'?[i]:[]);
 if(expected.transaction){
  if(start.length!==1||end.length!==1||end[0]<=start[0]||
    lines.slice(end[0]+1).some(x=>x.trim()&&!x.trim().startsWith('--')))
    fail('TRANSACTION_BOUNDARY_DRIFT_'+expected.id);
  // Keep the entire original reviewed body, except its two standalone
  // transaction markers. Nested psql --single-transaction would commit early.
  lines.splice(end[0],1);
  lines.splice(start[0],1);
 }else if(start.length||end.length)fail('UNEXPECTED_TRANSACTION_'+expected.id);
 const body=lines.join('\n');
 if(/^(?:\\connect|\\i|\\include|\\!|\\copy)\b/m.test(body)||/\bDROP\s+(?:SCHEMA|DATABASE)\b/iu.test(body))
  fail('UNSAFE_OPERATOR_SOURCE_'+expected.id);
 return body;
}
export function materializeM1AtomicProdCutover({readSource=read}={}){
 if(typeof readSource!=='function')fail('READER_INVALID');
 const bodies=M1_ATOMIC_SOURCES.map(item=>
  stripVerifiedSqlTransaction(readSource(item.path),item));
 const sealed=[
 '-- IBERFIT M1 protected atomic cutover, offline materialized; NOT automatically authorized.',
 '-- PROD preconditions: M44 platform DR, QA signed E2E, exact SHA, rollback and fresh backup.',
 'BEGIN;',
 "SET LOCAL lock_timeout = '10s';",
 "SET LOCAL statement_timeout = '240s';"
 ];
 for(let i=0;i<bodies.length;i++){
  sealed.push('-- VERIFIED STAGE '+M1_ATOMIC_SOURCES[i].id, bodies[i]);
 }
 sealed.push(
  '-- Final checks occur within the SAME transaction, before its only COMMIT.',
  "DO $m1_atomic_final$",
  "BEGIN",
  "  IF to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL",
  "  OR NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')",
  "  OR NOT has_function_privilege('authenticated','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')",
  "  OR has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')",
  "  OR has_function_privilege('anon','public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')",
  "  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass)",
  "  THEN RAISE EXCEPTION 'M1_ATOMIC_FINAL_READBACK_FAILED' USING ERRCODE='42501'; END IF;",
  "END $m1_atomic_final$;",
  'COMMIT;','');
 const sql=sealed.join('\n');
 if(sql.split('\n').filter(x=>x.trim()==='BEGIN;').length!==1||
    sql.split('\n').filter(x=>x.trim()==='COMMIT;').length!==1||
    sql.indexOf('STAGE U72_INSTALL')>=sql.indexOf('STAGE AUTONOMOUS_DATES')||
    sql.indexOf('STAGE AUTONOMOUS_DATES')>=sql.indexOf('STAGE U60_ENABLE')||
    sql.indexOf('DO $m1_atomic_final$')>=sql.lastIndexOf('COMMIT;'))
  fail('ATOMIC_ORDER_INVALID');
 return Object.freeze({sql,digest:createHash('sha256').update(sql).digest('hex'),
  stages:Object.freeze(M1_ATOMIC_SOURCES.map(x=>x.id)),productionWrites:0,
  executableOnlyAfterIndependentAuthorization:true});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  if(process.argv.length!==2)fail('NO_EXTERNAL_ARGUMENTS');
  const built=materializeM1AtomicProdCutover();
  const dir=mkdtempSync(join(tmpdir(),'iberfit-m1-atomic-'));
  const target=join(dir,'m1-atomic-reviewed-production.sql');
  writeFileSync(target,built.sql,{encoding:'utf8',mode:0o600,flag:'wx'});
  console.log('M1_ATOMIC_SQL_MATERIALIZED_ONLY:sha256='+built.digest+':path='+target+
    ':productionWrites=0:releaseAuthorized=false');
 }catch(e){console.error(String(e?.message||'M1_ATOMIC_PROD_BLOCKED'));process.exitCode=1;}
}
