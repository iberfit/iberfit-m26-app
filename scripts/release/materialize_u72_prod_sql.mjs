// M1 U72 canonical production SQL materializer; never connects to a database.
// Historical QA sources stay immutable; PROD templates refuse direct execution.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const U72_SOURCE=Object.freeze({install:"supabase/qa-migrations/20261113013000_m1_u72_dated_pause_resume_qa_v1.sql",rollback:"supabase/qa-rollbacks/20261113013000_m1_u72_dated_pause_resume_qa_v1.rollback.sql"});
export const U72_TEMPLATE=Object.freeze({install:"supabase/release-procedures/20261113_m1_u72_prod_guarded_install.sql",rollback:"supabase/release-procedures/20261113_m1_u72_prod_guarded_rollback.sql"});
export const U72_SOURCE_SHA=Object.freeze({install:'1f8f5fa3b82eb05933bc57dc37752f6725cb231503337a3ac6981b602a4f3158',rollback:'04ecb4d23b285a2a85a7df03fdead3b4ed5de40c103f678abc72bd8197a6db44'});
export const U72_OUTPUT_SHA=Object.freeze({install:'345f4637864c0114433e3a52c81176b30e29c619f2cb4c1d68e7c141b7cfdb25',rollback:'d66466e421abd85b2dd9b250758be7f392efcac5d1552b8f4eb6bc8d51ec2de9'});
const MARKER="DO $u72_materialization_required$ BEGIN RAISE EXCEPTION 'M1_U72_MATERIALIZATION_REQUIRED'; END $u72_materialization_required$;\n";
const TAIL=Object.freeze({install:'DO $m1_readback$',rollback:'DO $m1_rollback_readback$'});
export const U72_INSTALL_WRAPPER_SHA='1b1720a5a5b530774f89fa73af2f1e67c18f381cf1bb18a3bd902dcdbf8be86c';
export const U72_ROLLBACK_WRAPPER_SHA='2ffcdc9b5338054ab7eab39f92e13413efc23a53b8057f5002095acceb73cde8';
const U72_ROLLBACK_TEMPLATE="-- IBERFIT M1 U72 · rollback wrapper must be materialized from canonical install wrapper.\n-- M1_U72_PROD_ROLLBACK_WRAPPER_REQUIRED · source-only; not executable.\nDO $u72_materialization_required$ BEGIN RAISE EXCEPTION 'M1_U72_MATERIALIZATION_REQUIRED'; END $u72_materialization_required$;\n";
const U72_ROLLBACK_WRAPPER_DIFF=Object.freeze([{"insert":["-- IBERFIT M1 U72 production guarded reverse. ONLY after new starts","-- are frozen, all journals drained, no active/paused dated execution remains,","-- and both public U60 entrypoints have been revoked by the original","-- 20261112_m1_u60_prod_guarded_disable.sql. No deletion of training history."]},{"copy":[6,1]},{"insert":["DO $m1_production_u72_rollback_preflight$"]},{"copy":[8,14]},{"copy":[45,27]},{"insert":["END $m1_production_u72_rollback_preflight$;","DO $u72_materialization_required$ BEGIN RAISE EXCEPTION 'M1_U72_MATERIALIZATION_REQUIRED'; END $u72_materialization_required$;","DO $m1_production_u72_rollback_verify$","BEGIN","  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'PRODUCTION'","  OR to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL","  THEN RAISE EXCEPTION 'M1_U72_PROD_ROLLBACK_STATE_INVALID'; END IF;","  IF md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))<>'5914acf371015a6bbeeaf95f99e056e3'","    THEN RAISE EXCEPTION 'M1_U72_BASELINE_GATEWAY_DRIFT'; END IF;","  IF md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))<>'35862b8e4977fcf0c3d611937fe83126'","    THEN RAISE EXCEPTION 'M1_U72_BASELINE_DETAIL_DRIFT'; END IF;","  IF md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))<>'f97d7df4fdd510b63ac1249352273927'","    THEN RAISE EXCEPTION 'M1_U72_BASELINE_RECEIPT_GUARD_DRIFT'; END IF;","END $m1_production_u72_rollback_verify$;"]},{"copy":[73,2]}]);
const QA_ROLLBACK_MARKER="DO $m1_qa_rollback_unmaterialized$ BEGIN RAISE EXCEPTION 'M1_U72_QA_ROLLBACK_MATERIALIZATION_REQUIRED'; END $m1_qa_rollback_unmaterialized$;\n";
const QA_ROLLBACK_BODY_START="CREATE OR REPLACE FUNCTION public.iberfit_occurrence_api_u60_v1";
const QA_ROLLBACK_DIFF=Object.freeze([{"copy":[0,14]},{"insert":["  v_reply:=public.iberfit_occurrence_api_v1(p_action,p_payload);"]},{"copy":[46,116]},{"insert":["      OR v_execution.status IS DISTINCT FROM v_occ.status"]},{"copy":[164,2]},{"insert":["      OR (v_occ.status='en_curso'","        AND v_typed.execution_status IS DISTINCT FROM 'activa')"]},{"copy":[169,25]},{"copy":[197,48]},{"copy":[256,12]},{"insert":["DROP FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb);"]},{"copy":[269,1]}]);
const REPLACEMENTS=Object.freeze([["RETURNS jsonb\nLANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''\nAS $u72_pause$"," RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$"],["(p_command->'payload'-'executionId'-'executionBaseRevision')","((p_command->'payload')-'executionId'-'executionBaseRevision')"],["$u72_pause$;\nREVOKE","$function$;\nREVOKE"],[" FROM PUBLIC,anon,authenticated,service_role;\nCOMMENT ON FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb)\n IS 'QA-only U72: idempotent, owner-scoped occurrence pause/resume with CAS, private receipt and server clock. Direct EXECUTE forbidden.';\n\n","  FROM PUBLIC,anon,authenticated,service_role;\n"],["-- Replacements retain the old function OIDs, owners and ACLs.\n",""]]);
export function sha256Sql(text){
 return createHash('sha256').update(text,'utf8').digest('hex');
}
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
// Canonical reverse source is derived from the original QA forward migration.
// Only non-matching lines are encoded as edits; hashes protect both boundaries.
export function materializeU72QaRollback({readSource=read}={}){
 if(typeof readSource!=='function')throw Error('M1_U72_READER_REQUIRED');
 const forward=readSource(U72_SOURCE.install);
 const tmpl=readSource(U72_SOURCE.rollback);
 if(sha256Sql(forward)!==U72_SOURCE_SHA.install)
  throw Error('M1_U72_QA_CANONICAL_SOURCE_DRIFT');
 if(tmpl.split(QA_ROLLBACK_MARKER).length!==2)
  throw Error('M1_U72_QA_ROLLBACK_TEMPLATE_DRIFT');
 const begin=forward.indexOf(QA_ROLLBACK_BODY_START);
 const end=forward.indexOf(TAIL.install,begin);
 if(begin<0||end<=begin)throw Error('M1_U72_QA_ROLLBACK_SOURCE_BOUNDARY_INVALID');
 const lines=forward.slice(begin,end).split('\n');
 const generated=QA_ROLLBACK_DIFF.flatMap(operation=>{
  if(Object.hasOwn(operation,'copy')){
   const [offset,count]=operation.copy;
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(count)||count<1
      ||offset<0||offset+count>lines.length)
    throw Error('M1_U72_QA_ROLLBACK_COPY_INVALID');
   return lines.slice(offset,offset+count);
  }
  return operation.insert;
 }).join('\n');
 const sql=tmpl.replace(QA_ROLLBACK_MARKER,()=>generated);
 if(sha256Sql(sql)!==U72_SOURCE_SHA.rollback)
  throw Error('M1_U72_QA_ROLLBACK_OUTPUT_DRIFT');
 return sql;
}

// The rollback wrapper shares the exact QA/PROD environment fence and ACL
// assertions with install. Reuse the same reviewed source, not a second copy.
export function materializeU72ProductionRollbackWrapper({readSource=read}={}){
 if(typeof readSource!=='function')throw Error('M1_U72_READER_REQUIRED');
 const install=readSource(U72_TEMPLATE.install);
 if(sha256Sql(install)!==U72_INSTALL_WRAPPER_SHA)
  throw Error('M1_U72_PROD_INSTALL_TEMPLATE_DRIFT');
 if(readSource(U72_TEMPLATE.rollback)!==U72_ROLLBACK_TEMPLATE)
  throw Error('M1_U72_PROD_ROLLBACK_TEMPLATE_DRIFT');
 const lines=install.split('\n');
 const wrapper=U72_ROLLBACK_WRAPPER_DIFF.flatMap(operation=>{
  if(Object.hasOwn(operation,'copy')){
   const [start,count]=operation.copy;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)
       ||start<0||count<1||start+count>lines.length)
    throw Error('M1_U72_PROD_ROLLBACK_COPY_INVALID');
   return lines.slice(start,start+count);
  }
  return operation.insert;
 }).join('\n');
 if(sha256Sql(wrapper)!==U72_ROLLBACK_WRAPPER_SHA)
  throw Error('M1_U72_PROD_ROLLBACK_WRAPPER_DRIFT');
 return wrapper;
}

export function materializeU72ProductionSql(kind,{readSource=read}={}){
 if(!Object.hasOwn(U72_SOURCE,kind))throw Error('M1_U72_UNKNOWN_PROCEDURE');
 if(typeof readSource!=='function')throw Error('M1_U72_READER_REQUIRED');
 const qa=kind==='rollback'?materializeU72QaRollback({readSource}):readSource(U72_SOURCE.install);
 const t=kind==='rollback'?materializeU72ProductionRollbackWrapper({readSource}):readSource(U72_TEMPLATE.install);
 if(sha256Sql(qa)!==U72_SOURCE_SHA[kind])throw Error('M1_U72_QA_CANONICAL_SOURCE_DRIFT');
 if(t.split(MARKER).length!==2)throw Error('M1_U72_TEMPLATE_MARKER_INVALID');
 const a=qa.indexOf('CREATE OR REPLACE FUNCTION'),b=qa.indexOf(TAIL[kind]);
 if(a<0||b<=a)throw Error('M1_U72_QA_SOURCE_BOUNDARY_INVALID');
 let body=qa.slice(a,b);
 if(kind==='install')for(const [from,to] of REPLACEMENTS){
  if(body.split(from).length!==2)throw Error('M1_U72_PROD_ADAPTATION_ANCHOR_INVALID');
  body=body.replace(from,()=>to);
 }
 // Callback is mandatory: SQL can include the JS replacement meta-sequence $'.
 const sql=t.replace(MARKER,()=>body);
 // Byte-for-byte identity with original independently reviewed PROD install/rollback.
 if(sha256Sql(sql)!==U72_OUTPUT_SHA[kind])throw Error('M1_U72_PROD_SQL_OUTPUT_DRIFT');
 if(!sql.includes('BEGIN;')||!sql.includes('COMMIT;')||sql.includes('M1_U72_MATERIALIZATION_REQUIRED'))
  throw Error('M1_U72_PROD_SQL_INCOMPLETE');
 return sql;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const kind=process.argv[2];
  if(process.argv.length!==3||!(Object.hasOwn(U72_SOURCE,kind)||kind==='qa-rollback'))
   throw Error('M1_U72_USAGE: node scripts/release/materialize_u72_prod_sql.mjs install|rollback');
  const sql=kind==='qa-rollback'?materializeU72QaRollback():materializeU72ProductionSql(kind);
  const dir=mkdtempSync(join(tmpdir(),'iberfit-u72-protected-'));
  // Untrusted CLI arguments never enter a filesystem path.
  const out=join(dir,'u72-reviewed-production.sql');
  writeFileSync(out,sql,{encoding:'utf8',mode:0o600,flag:'wx'});
  const digest=kind==='qa-rollback'?U72_SOURCE_SHA.rollback:U72_OUTPUT_SHA[kind];
  console.log('M1_U72_MATERIALIZED_VERIFIED '+kind+' sha256='+digest+' path='+out);
 }catch(error){
  console.error(String(error?.message||'M1_U72_MATERIALIZATION_FAILED'));
  process.exitCode=1;
 }
}
