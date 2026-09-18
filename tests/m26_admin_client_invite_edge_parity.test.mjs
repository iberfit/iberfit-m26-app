import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/iberfit-admin-client-invite-v1/index.ts','utf8').replace(/\r\n/g,'\n');
const config=fs.readFileSync('supabase/config.toml','utf8').replace(/\r\n/g,'\n');

test('client invite edge derives an exact origin from the deployed Supabase project',()=>{
  assert.match(edge,/FUNCTION_VERSION='admin-client-invite-v26\.4'/u);
  assert.match(edge,/QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(edge,/PROD_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(edge,/deploymentProjectRef\(Deno\.env\.get\('SUPABASE_URL'\)\|\|''\)/u);
  assert.match(edge,/DEPLOYMENT_PROJECT_REF===QA_PROJECT_REF[\s\S]{0,180}\['https:\/\/m26-canary\.iberfit\.cl'\]/u);
  assert.match(edge,/DEPLOYMENT_PROJECT_REF===PROD_PROJECT_REF[\s\S]{0,180}\['https:\/\/app\.iberfit\.cl'\]/u);
  assert.match(edge,/:[\s\n]*\[\],[\s\n]*\);/u);
  assert.doesNotMatch(edge,/'https:\/\/coach\.iberfit\.cl'/u);
});

test('client invite edge validates the bearer itself before any service-role operation',()=>{
  const authHeader=edge.indexOf("authorization.startsWith('Bearer ')");
  const userClient=edge.indexOf('const userClient=createClient');
  const getUser=edge.indexOf('await userClient.auth.getUser()');
  const authReject=edge.indexOf("code:'V26_AUTH_REQUIRED'",getUser);
  const serviceClient=edge.indexOf('const service=createClient',getUser);
  const privilegedRpc=edge.indexOf("userClient.rpc('iberfit_admin_execute_v14'",getUser);

  assert.ok(authHeader>=0);
  assert.ok(userClient>authHeader);
  assert.ok(getUser>userClient);
  assert.ok(authReject>getUser);
  assert.ok(serviceClient>authReject);
  assert.ok(privilegedRpc>serviceClient);
  assert.match(edge,/actorAuthError\|\|!UUID\.test\(actorUserId\)/u);
});

test('invite function deployment contract explicitly records custom JWT handling',()=>{
  const block=config.match(/\[functions\.iberfit-admin-client-invite-v1\][\s\S]{0,240}/u)?.[0]||'';
  assert.match(block,/verify_jwt\s*=\s*false/u);
  assert.match(config,/Custom bearer validation is performed inside the function with auth\.getUser/u);
});

test('CORS preflight is bodyless and unknown environments fail closed',()=>{
  assert.match(edge,/new Response\(status===204\?null:JSON\.stringify\(body\)/u);
  assert.match(edge,/if\(req\.method==='OPTIONS'\)return reply\(ALLOWED_ORIGINS\.has\(origin\)\?204:403/u);
  assert.match(edge,/if\(!ALLOWED_ORIGINS\.has\(origin\)\)return reply\(403/u);
});

test('service-role cleanup remains bounded to a newly-created auth user',()=>{
  assert.match(edge,/let createdAuthUserId=''/u);
  assert.match(edge,/createdAuthUserId=authUserId/u);
  assert.match(edge,/if\(createdAuthUserId&&UUID\.test\(createdAuthUserId\)\)/u);
  assert.match(edge,/service\.auth\.admin\.deleteUser\(createdAuthUserId\)/u);
});
