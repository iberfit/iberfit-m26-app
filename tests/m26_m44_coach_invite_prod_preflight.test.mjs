import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCHEMA,QUERY,FUNCTIONS,TABLES,evaluateCoachInvitationReadOnlyPreflight}
 from '../scripts/release/m44_coach_invite_prod_readonly_preflight.mjs';
const good=()=>({
 schema:SCHEMA,
 environment:{environment:'PRODUCTION',real_data_allowed:'true',production_blocked:'false'},
 functions:Object.fromEntries(Object.keys(FUNCTIONS).map(k=>[k,{
  present:true,hashOK:true,securityDefiner:true,postgresOwner:true,
  emptySearchPath:true,anonCanExecute:false,authenticatedCanExecute:true}])),
 tables:Object.fromEntries(Object.keys(TABLES).map(k=>[k,{present:true,rlsEnabled:true}])),
 coachGuardAlreadyInstalled:false
});
test('compatible baseline never permits production mutations',()=>{
 const a=evaluateCoachInvitationReadOnlyPreflight([{report:good()}]);
 assert.equal(a.compatible,true);assert.equal(a.databaseWrites,0);
 assert.equal(a.productionReleaseAuthorized,false);
 assert.equal(a.platformRecoveryVerified,false);
 assert.equal(a.hostedAuthRecoveryVerified,false);
});
test('fail closed for unknown environment, grants, hashes and RLS',()=>{
 const muts=[
  x=>{x.schema='invalid';},x=>{x.environment.environment='QA';},
  x=>{x.environment.real_data_allowed='false';},
  x=>{x.environment.production_blocked='true';},
  x=>{x.coachGuardAlreadyInstalled=true;},
  x=>{x.functions.prepare.hashOK=false;},
  x=>{x.functions.bind.anonCanExecute=true;},
  x=>{x.functions.finalize.authenticatedCanExecute=false;},
  x=>{x.functions.finalize.postgresOwner=false;},
  x=>{x.functions.bind.securityDefiner=false;},
  x=>{x.functions.prepare.emptySearchPath=false;},
  x=>{delete x.functions.prepare;},
  x=>{x.tables.memberships.rlsEnabled=false;},
  x=>{x.tables.client_access.present=false;},
  x=>{delete x.tables.coach_assignments;},
  x=>{x.tables.client_assignments.extra=true;}
 ];
 for(const mutate of muts){const x=good();mutate(x);
  assert.throws(()=>evaluateCoachInvitationReadOnlyPreflight({report:x}));}
});
test('ambiguous or malformed response never passes',()=>{
 for(const r of [null,{},[],[{report:good()},{report:good()}],
  {result:[]},{result:[{report:good()},{report:good()}]},
  {report:{...good(),functions:null}}])
   assert.throws(()=>evaluateCoachInvitationReadOnlyPreflight(r));
});
test('metadata SQL mirrors exact guarded migration hashes and never writes',()=>{
 const migration=readFileSync(
  'supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql','utf8');
 assert.match(QUERY,/^WITH expected_functions/u);
 assert.doesNotMatch(QUERY,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE|DO|PERFORM)\s+(?:ON|TABLE|FUNCTION|FROM|INTO|SET)\b/iu);
 for(const f of Object.values(FUNCTIONS)){
  assert.ok(QUERY.includes(f.signature));
  for(const h of f.hashes){assert.ok(migration.includes(h));assert.ok(QUERY.includes(h));}
 }
 for(const name of Object.values(TABLES))assert.ok(QUERY.includes(name));
 assert.ok(!QUERY.includes('auth.users'));
});
