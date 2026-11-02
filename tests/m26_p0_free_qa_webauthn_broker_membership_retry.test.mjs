import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts','utf8');
const membership=source.slice(source.indexOf('async function validateTarget('),source.indexOf('async function setAdminRole('));
const entry=source.slice(source.indexOf('Deno.serve('));

test('QA OIDC broker remains strict and fail-closed before any membership read or mutation',()=>{
 for(const guard of [
  'EXPECTED_REPOSITORY_ID','EXPECTED_WORKFLOW_REF','ADMIN_EXPECTED_WORKFLOW_REF',
  'payload.workflow_ref!==body.target.workflowRef',
  'payload.sha||""','payload.run_id||""',
  'if(projectRef(supabaseUrl)!==QA_REF',
  'await authenticate(req,body)','await validateTarget(db,body.target)',
  'auth:{persistSession:false,autoRefreshToken:false}',
 ])assert.ok(source.includes(guard),guard);
 assert.ok(entry.indexOf('await authenticate(req,body)')<entry.indexOf('await validateTarget(db,body.target)'));
 assert.ok(entry.indexOf('await validateTarget(db,body.target)')<entry.indexOf('clearAuthState(db,'));
 assert.doesNotMatch(source,/serviceRoleKeyFromRequest|BYPASSRLS|GRANT ALL|skipMembershipCheck/iu);
});
test('only the failed read-only membership query can be retried once on exact HTTP 401',()=>{
 const initial=membership.indexOf('const [initialProfile,initialMembership]=await Promise.all([');
 const retry=membership.indexOf('if(membershipError&&initialMembership.status===401)');
 const second=membership.indexOf('({data:membership,error:membershipError}=await db.from("iberfit_organization_memberships")',retry);
 const failure=membership.indexOf('if(membershipError)fail("IBERFIT_QA_CERT_TARGET_MEMBERSHIP_READ_FAILED",502)',second);
 const role=membership.indexOf('if(String(membership?.status||"")!=="active")fail("IBERFIT_QA_CERT_TARGET_MEMBERSHIP_INVALID",409)',failure);
 assert.ok(initial>=0&&retry>initial&&second>retry&&failure>second&&role>failure);
 const retryBlock=membership.slice(retry,failure);
 assert.match(retryBlock,/setTimeout\(resolve,150\)/u);
 assert.match(retryBlock,/\.select\("status"\)\.eq\("organization_id",ORG_ID\)\.eq\("user_id",target\.userId\)\.maybeSingle\(\)/u);
 assert.equal(retryBlock.split('db.from("iberfit_organization_memberships")').length-1,1);
 assert.doesNotMatch(retryBlock,/\.(?:insert|update|delete|upsert|rpc)\(/u);
});
test('transient profile retry from deployed v16 is retained, membership is mandatory, mutations occur only after proof',()=>{
 assert.match(membership,/if\(profileError&&initialProfile\.status===401\)/u);
 assert.match(membership,/if\(profileError\)fail\("IBERFIT_QA_CERT_TARGET_PROFILE_READ_FAILED",502\)/u);
 assert.match(membership,/if\(String\(profile\?\.role\|\|""\)\.toLowerCase\(\)!==target\.profileRole\)fail/u);
 assert.match(membership,/if\(String\(membership\?\.status\|\|""\)!=="active"\)fail/u);
 assert.match(membership,/if\(Number\(assignments\|\|0\)!==0\)fail/u);
 assert.match(source,/if\(state\.activeCredentials!==0\|\|state\.activeChallenges!==0/u);
 assert.match(entry,/const db=createClient\(supabaseUrl,serviceRole/u);
});
