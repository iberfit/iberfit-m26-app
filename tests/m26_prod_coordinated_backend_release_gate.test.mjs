import test from 'node:test';
import assert from 'node:assert/strict';
import {HASHES,SQL,EDGE_DIGEST,certifyAlreadyActiveBackend}
 from '../scripts/release/verify_backend_preactivated.mjs';
const rows=()=>[{report:{
 environment:'PRODUCTION',realData:'true',productionBlocked:'false',
 coachGuard:true,rls:true,directAuth:false,directAnon:false,fences:2,
 legacyAuth:false,legacyAnon:false,
 functions:Object.keys(HASHES).map(name=>({name,present:true,hash_ok:true,
   security_definer:true,owner_ok:true,safe_path:true,auth_acl_ok:true,anon_denied:true}))
}}];
const edge=()=>[{slug:'iberfit-admin-client-invite-v1',status:'ACTIVE',
 verify_jwt:false,ezbr_sha256:EDGE_DIGEST,version:10}];
test('backend certificate checks exact SQL/RLS/auth and live Edge with zero writes',()=>{
 const result=certifyAlreadyActiveBackend(rows(),edge());
 assert.equal(result.functionsVerified,10);
 assert.match(SQL,/private\.iberfit_u31_occurrence_transition_v1/u);
 assert.match(SQL,/private\.iberfit_u33_occurrence_calendar_v1/u);
 assert.equal(result.edgeVerified,true);
 assert.equal(result.backendWrites,0);
 assert.equal(result.hostedAuthWrites,0);
 assert.equal(result.fullPlatformRecoveryCertified,false);
 for(const value of ['pg_get_functiondef','relrowsecurity','auth_acl_ok',
   'anon_denied','u60_dated_execution_update_receipt','iberfit_coach_invite_source_guard_v1'])
  assert.ok(SQL.includes(value),value);
});
test('backend certificate fails closed on schema, grant, RLS, role, Edge drift',()=>{
 for(const change of [
  r=>{r[0].report.rls=false;},
  r=>{r[0].report.directAuth=true;},
  r=>{r[0].report.functions[0].hash_ok=false;},
  r=>{r[0].report.functions[2].anon_denied=false;},
  r=>{r[0].report.coachGuard=false;},
  r=>{r[0].report.fences=1;},
  r=>{r[0].report.functions.pop();},
 ]){
  const report=rows();change(report);
  assert.throws(()=>certifyAlreadyActiveBackend(report,edge()));
 }
 for(const change of [
  e=>{e[0].verify_jwt=true;},
  e=>{e[0].version=9;},
  e=>{e[0].ezbr_sha256='unknown';},
  e=>{e[0].status='INACTIVE';},
 ]){
  const functions=edge();change(functions);
  assert.throws(()=>certifyAlreadyActiveBackend(rows(),functions));
 }
});
