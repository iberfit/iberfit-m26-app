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
const REPLACEMENTS=Object.freeze([["RETURNS jsonb\nLANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''\nAS $u72_pause$"," RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$"],["(p_command->'payload'-'executionId'-'executionBaseRevision')","((p_command->'payload')-'executionId'-'executionBaseRevision')"],["$u72_pause$;\nREVOKE","$function$;\nREVOKE"],[" FROM PUBLIC,anon,authenticated,service_role;\nCOMMENT ON FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb)\n IS 'QA-only U72: idempotent, owner-scoped occurrence pause/resume with CAS, private receipt and server clock. Direct EXECUTE forbidden.';\n\n","  FROM PUBLIC,anon,authenticated,service_role;\n"],["-- Replacements retain the old function OIDs, owners and ACLs.\n",""]]);
export function sha256Sql(text){
 return createHash('sha256').update(text,'utf8').digest('hex');
}
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
export function materializeU72ProductionSql(kind,{readSource=read}={}){
 if(!Object.hasOwn(U72_SOURCE,kind))throw Error('M1_U72_UNKNOWN_PROCEDURE');
 if(typeof readSource!=='function')throw Error('M1_U72_READER_REQUIRED');
 const qa=readSource(U72_SOURCE[kind]),t=readSource(U72_TEMPLATE[kind]);
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
  if(process.argv.length!==3||!Object.hasOwn(U72_SOURCE,kind))
   throw Error('M1_U72_USAGE: node scripts/release/materialize_u72_prod_sql.mjs install|rollback');
  const sql=materializeU72ProductionSql(kind);
  const dir=mkdtempSync(join(tmpdir(),'iberfit-u72-protected-'));
  // Untrusted CLI arguments never enter a filesystem path.
  const out=join(dir,'u72-reviewed-production.sql');
  writeFileSync(out,sql,{encoding:'utf8',mode:0o600,flag:'wx'});
  console.log('M1_U72_MATERIALIZED_VERIFIED '+kind+' sha256='+U72_OUTPUT_SHA[kind]+' path='+out);
 }catch(error){
  console.error(String(error?.message||'M1_U72_MATERIALIZATION_FAILED'));
  process.exitCode=1;
 }
}
