import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MARK='IBERFIT_M44_LIVE_ACL_RLS_';
export const SCHEMA='iberfit.m44.live-acl-rls-preflight.v1';
export const METRICS=Object.freeze([
 'total_tables','public_tables','truncate_grants','unprotected_dml_grants',
 'public_anon_delete','public_anon_trigger','public_authenticated_delete',
 'public_authenticated_trigger','public_anon_insert','public_authenticated_insert'
]);
const fail=(reason)=>{throw Error(MARK+reason);};
const isExact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).length===keys.length&&Object.keys(o).every(k=>keys.includes(k));

export function validateSnapshot(s){
 if(!isExact(s,['schema','captured_at','metrics'])||s.schema!==SCHEMA||
    typeof s.captured_at!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(s.captured_at)||
    !Number.isFinite(Date.parse(s.captured_at))||
    !isExact(s.metrics,METRICS)) fail('SNAPSHOT_SHAPE_INVALID');
 for(const k of METRICS)if(!Number.isSafeInteger(s.metrics[k])||s.metrics[k]<0)
  fail('METRIC_INVALID');
 if(s.metrics.total_tables<100||s.metrics.public_tables<50||
    s.metrics.total_tables<s.metrics.public_tables)fail('SCOPE_TOO_SMALL');
 return s;
}
export function checkExposure(s){
 validateSnapshot(s);
 const m=s.metrics;
 const safe=m.truncate_grants===0&&m.unprotected_dml_grants===0;
 return Object.freeze({
  structuralPreflightPass:safe,
  databaseTablesInspected:m.total_tables,
  // Permission existence is NOT proof of RLS authorization or API reachability.
  elevatedLegacyWriteGrantsPresent:
   [m.public_anon_delete,m.public_anon_trigger,m.public_authenticated_delete,
    m.public_authenticated_trigger].some(x=>x>0),
  runtimeRlsAuthorizationVerified:false,
  securityDefinerSafetyVerified:false,
  restoreRolesAclVerified:false,
  authRecoveryVerified:false,
  platformRecoveryVerified:false
 });
}
export function enforceExposure(s){
 const result=checkExposure(s);
 if(!result.structuralPreflightPass)fail('UNSAFE_TRUNCATE_OR_RLS_MISSING');
 return result;
}
export function compareEnvironments(prod,qa){
 const a=checkExposure(prod),b=checkExposure(qa);
 // QA can include preproduction migrations and additional test policies.
 // Do not treat different grant counts as an error; each project must pass
 // structural integrity on its own.
 return Object.freeze({
  bothStructurallySafe:a.structuralPreflightPass&&b.structuralPreflightPass,
  sameScope:prod.metrics.total_tables===qa.metrics.total_tables&&
   prod.metrics.public_tables===qa.metrics.public_tables,
  liveSecurityParityVerified:false,
  platformRecoveryVerified:false
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{
  if(process.argv.length!==3)fail('USAGE_INVALID');
  const file=process.argv[2],st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<200||st.size>10000)
   fail('FILE_INVALID');
  const result=enforceExposure(JSON.parse(fs.readFileSync(file,'utf8')));
  process.stdout.write(MARK+'STRUCTURAL_PREFLIGHT_PASS:tables='+
   result.databaseTablesInspected+':roles=anon,authenticated\n');
  process.stdout.write(MARK+'RUNTIME_AUTHORIZATION_NOT_CERTIFIED\n');
 }catch(e){
  const reason=String(e?.message||'');
  process.stderr.write((reason.startsWith(MARK)?reason:MARK+'INPUT_INVALID')+'\n');
  process.exitCode=1;
 }
}
