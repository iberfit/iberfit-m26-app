import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadableStream} from 'node:stream/web';
import {assessHostedAuthConfig,probeHostedAuthConfig} from '../scripts/ops/m44_hosted_auth_config_readonly.mjs';

const secret='DO_NOT_LOG_ACTUAL_SECRET_SENTINEL';
const config=()=>({
 disable_signup:true,
 external_email_enabled:true,
 mailer_autoconfirm:false,
 mailer_secure_email_change_enabled:true,
 external_phone_enabled:false,
 external_anonymous_users_enabled:false,
 external_google_enabled:false,
 external_apple_enabled:false,
 jwt_exp:3600,
 site_url:'https://app.iberfit.cl',
 uri_allow_list:'https://app.iberfit.cl/**,https://iberfit.cl/**',
 smtp_pass:secret,
 external_google_secret:secret,
 hook_send_email_secrets:secret,
 mailer_templates_recovery_content:secret,
});
const apiUrl='https://api.supabase.com/v1/projects/pjhmrhejsoofmouedavw/config/auth';
const mock=(json,overrides={})=>async(url,options)=>{
 assert.equal(url,apiUrl);
 assert.equal(options.method,'GET');
 assert.equal(options.redirect,'error');
 assert.ok(options.headers.Authorization.startsWith('Bearer '));
 assert.ok(options.signal);
 return new Response(typeof json==='string'?json:JSON.stringify(json),{
  status:overrides.status||200,
  headers:overrides.headers||{'content-type':'application/json'},
 });
};
test('Auth read-only inspection emits metadata only: no secrets, no prod readiness claims',async()=>{
 const a=assessHostedAuthConfig(config());
 assert.equal(a.projectRef,'pjhmrhejsoofmouedavw');
 assert.equal(a.emailLoginConfigured,true);
 assert.equal(a.emailConfirmationConfigured,true);
 assert.equal(a.enabledProviderCount,0);
 assert.equal(a.configurationShapeVerified,true);
 for(const property of ['authUserRestorationVerified','jwtSigningKeyRestorationVerified',
  'oauthSecretsRestorationVerified','smtpDeliveryVerified','redirectRecoveryVerified',
  'credentialContinuityVerified','platformRecoveryVerified'])
  assert.equal(a[property],false,property);
 const result=await probeHostedAuthConfig({accessToken:'test-M44-readonly-token-value',fetchImpl:mock(config())});
 assert.deepEqual(result,a);
 assert.ok(!JSON.stringify(result).includes(secret));
 assert.ok(!JSON.stringify(result).includes('app.iberfit.cl'));
});
test('Fail closed for unsafe or missing Auth settings, user controlled values never echoed',()=>{
 const edits=[
  c=>delete c.disable_signup,
  c=>c.external_email_enabled=false,
  c=>c.jwt_exp=0,
  c=>c.jwt_exp=1e8,
  c=>c.mailer_autoconfirm='false',
  c=>c.external_google_enabled='secret-not-boolean',
  c=>c.site_url='http://app.iberfit.cl',
  c=>c.site_url='https://evil.example/'+secret,
  c=>c.uri_allow_list=4,
  c=>c.uri_allow_list=secret.repeat(5000),
 ];
 for(const edit of edits){
  const c=config();edit(c);
  assert.throws(()=>assessHostedAuthConfig(c),error=>{
   assert.match(error.message,/^M44_HOSTED_AUTH_READONLY_/);
   assert.ok(!error.message.includes(secret));
   assert.ok(!error.message.includes('evil.example'));
   return true;
  });
 }
});
test('Management endpoint must return authorized valid JSON without leaking raw response',async()=>{
 const input=config();
 for(const opts of [
  {accessToken:'short',fetchImpl:mock(input)},
  {accessToken:'test-M44-readonly-token-value',fetchImpl:mock('not-json')},
  {accessToken:'test-M44-readonly-token-value',fetchImpl:mock(input,{status:403})},
  {accessToken:'test-M44-readonly-token-value',fetchImpl:async()=>{throw Error(secret);}},
 ]){
  await assert.rejects(()=>probeHostedAuthConfig(opts),error=>{
   assert.match(error.message,/^M44_HOSTED_AUTH_READONLY_/);
   assert.ok(!error.message.includes(secret));return true;
  });
 }
});
test('Streaming rejects unexpected oversize even with missing or misleading content-length',async()=>{
 const big='x'.repeat(1024*1024+2000);
 const fetchImpl=async(url,opts)=>new Response(new ReadableStream({
  start(controller){controller.enqueue(new TextEncoder().encode(big));controller.close();}
 }),{status:200,headers:{'content-type':'application/json'}});
 await assert.rejects(
  ()=>probeHostedAuthConfig({accessToken:'test-M44-readonly-token-value',fetchImpl}),
  /M44_HOSTED_AUTH_READONLY_RESPONSE_TOO_LARGE/
 );
});
test('Provider list only reflects configuration metadata, never any provider secret or endpoint',()=>{
 const c=config();c.external_google_enabled=true;
 const a=assessHostedAuthConfig(c);
 assert.equal(a.enabledProviderCount,1);
 assert.equal(a.oauthSecretsRestorationVerified,false);
 assert.deepEqual(Object.keys(a).filter(k=>/secret|provider|smt/i.test(k)),
  ['enabledProviderCount','oauthSecretsRestorationVerified','smtpDeliveryVerified']);
});
