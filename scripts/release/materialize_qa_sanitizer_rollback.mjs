// IBERFIT M1 QA-only reversible bootstrap sanitizer, original SQL exact.
// A single immutable QA migration owns SQL; rollback is derived from it.
// No database connection is made by this module.
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
export const SOURCE_PATH="supabase/qa-migrations/20261112225518_m1_qa_empty_execution_sanitizer_fast_path.sql";
export const ROLLBACK_TEMPLATE_PATH="supabase/qa-rollbacks/20261112225518_m1_qa_empty_execution_sanitizer_fast_path.rollback.sql";
export const SOURCE_SHA256='b109545cc1dd571a309357b88d48f5836768a7702584a606ffdebe56bd687a4f';
export const ROLLBACK_SHA256='65b09efe21d0e121db6b3c3499d586c144842b62ecaae056bf2b33335df484ff';
const TEMPLATE="DO $m1_qa_sanitizer_rollback_required$ BEGIN RAISE EXCEPTION 'M1_QA_SANITIZER_ROLLBACK_MATERIALIZATION_REQUIRED'; END $m1_qa_sanitizer_rollback_required$;\n";
const EDITS=Object.freeze([{"copy":[0,19]},{"insert":["  IF md5(v_changed)<>'5d3e13ffc4f00c1e5f29d61fb81cd6e3' THEN","    RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_ROLLBACK_HEAD_DRIFT';"]},{"copy":[21,1]},{"insert":["  v_needle := $m1_needle0$select jsonb_agg(","        case","          when v_m1_qa_fast_empty","            and (item->'results' is null or item->'results' in","              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))","            and (item->'feedback' is null or item->'feedback' in","              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))","            and (item->'sourceSnapshot' is null or item->'sourceSnapshot' in","              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))","            and (item->'planSnapshot' is null or item->'planSnapshot' in","              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))","          then","            public.iberfit_m43_client_scalar_fields_v1(item,","              ARRAY['id','clientId','sessionId','appointmentId','status',","                'revision','title','startedAt','completedAt',","                'remoteConfirmedAt','localClosedAt','updatedAt',","                'executionStatus','currentBlockIndex','currentSetIndex']::text[])","            ||jsonb_build_object('feedback','{}'::jsonb,","              'results','[]'::jsonb,'sourceSnapshot','{}'::jsonb,","              'planSnapshot','{}'::jsonb)","          else public.iberfit_m43_client_safe_execution_v1(item)","        end)$m1_needle0$;","  v_replacement := $m1_replacement0$select jsonb_agg(public.iberfit_m43_client_safe_execution_v1(item))$m1_replacement0$;"]},{"copy":[27,5]},{"insert":["  v_needle := $m1_needle1$    -- M1_QA_FAST_EMPTY_EXECUTION_V1: only QA's synthetic A/B identities."]},{"copy":[34,12]},{"insert":["    -- Canonical and legacy completed executions must share the same HTTP$m1_needle1$;","  v_replacement := $m1_replacement1$    -- Canonical and legacy completed executions must share the same HTTP$m1_replacement1$;"]},{"copy":[47,5]},{"insert":["  v_needle := $m1_needle2$  v_clients jsonb;","  v_m1_qa_fast_empty boolean := false; -- M1_QA_FAST_EMPTY_EXECUTION_V1","begin$m1_needle2$;","  v_replacement := $m1_replacement2$  v_clients jsonb;","begin$m1_replacement2$;"]},{"copy":[75,5]},{"insert":["  IF md5(v_changed)<>'5b9547e2230994fa96cb6cb629f8fb2d' THEN","    RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_ROLLBACK_SOURCE_DRIFT';"]},{"copy":[83,6]},{"insert":["  IF md5(pg_get_functiondef(v_oid))<>'5b9547e2230994fa96cb6cb629f8fb2d' THEN","    RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_ROLLBACK_READBACK_FAILED';"]},{"copy":[91,4]}]);
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const digest=source=>createHash('sha256').update(source,'utf8').digest('hex');
export function materializeQaSanitizerRollback({readSource=read}={}){
 if(typeof readSource!=='function')throw Error('M1_QA_SANITIZER_READER_REQUIRED');
 const source=readSource(SOURCE_PATH);
 if(digest(source)!==SOURCE_SHA256)throw Error('M1_QA_SANITIZER_SOURCE_DRIFT');
 const template=readSource(ROLLBACK_TEMPLATE_PATH);
 if(template!==TEMPLATE)throw Error('M1_QA_SANITIZER_TEMPLATE_DRIFT');
 const lines=source.split('\n');
 const sql=EDITS.flatMap(step=>{
  if(Object.hasOwn(step,'copy')){
   const [start,count]=step.copy;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||
      count<1||start<0||start+count>lines.length)
    throw Error('M1_QA_SANITIZER_COPY_INVALID');
   return lines.slice(start,start+count);
  }
  return step.insert;
 }).join('\n');
 if(digest(sql)!==ROLLBACK_SHA256)throw Error('M1_QA_SANITIZER_OUTPUT_DRIFT');
 return sql;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==2)throw Error('M1_QA_SANITIZER_NO_ARGUMENTS');
  const sql=materializeQaSanitizerRollback();
  const dir=mkdtempSync(join(tmpdir(),'iberfit-m1-qa-rollback-'));
  const output=join(dir,'verified-synthetic-qa-rollback.sql');
  writeFileSync(output,sql,{encoding:'utf8',flag:'wx',mode:0o600});
  console.log('M1_QA_SANITIZER_ROLLBACK_VERIFIED sha256='+ROLLBACK_SHA256+' path='+output);
 }catch(e){console.error(String(e?.message||'M1_QA_SANITIZER_ROLLBACK_FAILED'));process.exitCode=1;}
}
