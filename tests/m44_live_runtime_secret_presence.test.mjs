import test from 'node:test';
import assert from 'node:assert/strict';
import {assessM44RuntimePresence} from '../scripts/ops/m44_live_runtime_secret_presence.mjs';

const names=['GEMINI_API_KEY','GOOGLE_API_KEY','IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY',
  'IBERFIT_WEB_PUSH_VAPID_PUBLIC_KEY','IBERFIT_WEB_PUSH_VAPID_SUBJECT'];
function fixture(){
  const sources=Array.from({length:16},(_,i)=>({slug:'fn-'+i,verify_jwt:i%2===0,
    live_bundle_sha256:'a'.repeat(64)}));
  return {
    source:{source_project_ref:'pjhmrhejsoofmouedavw',sources},
    inventory:{project_ref:'pjhmrhejsoofmouedavw',
      functions:sources.map(x=>({slug:x.slug,referenced_names:[],deployment_policy:'canonical'})),
      classes:{external_or_operator_provided:names}},
    functions:sources.map(x=>({...x,ezbr_sha256:x.live_bundle_sha256,status:'ACTIVE'})),
    secrets:names.map(name=>({name,updated_at:'2026-11-22T00:00:00Z'})),
    authConfig:{site_url:'https://app.iberfit.cl/',disable_signup:true,
      external_anonymous_users_enabled:false,mailer_autoconfirm:false,
      mailer_allow_unverified_email_sign_ins:false,mailer_secure_email_change_enabled:true,
      password_min_length:12,smtp_host:'smtp.invalid',smtp_admin_email:'admin@example.invalid',
      smtp_user:'user',smtp_sender_name:'IBERFIT',smtp_port:465}
  };
}
test('valid metadata still denies production cutover and full platform recovery',()=>{
  const p=assessM44RuntimePresence(fixture());
  assert.equal(p.deployedFunctionsVerified,16);
  assert.equal(p.runtimeNamesPresent,true);
  assert.equal(p.fullPlatformRecoveryCertified,false);
  assert.equal(p.productionActivationAuthorized,false);
  assert.equal(p.credentialValuesRecovered,false);
});
test('either AI credential name is acceptable',()=>{
  const x=fixture();x.secrets=x.secrets.filter(s=>s.name!=='GEMINI_API_KEY');
  assert.equal(assessM44RuntimePresence(x).runtimeNamesPresent,true);
});
test('missing required VAPID name is detected and never enables production',()=>{
  const x=fixture();x.secrets=x.secrets.filter(s=>s.name!=='IBERFIT_WEB_PUSH_VAPID_PRIVATE_KEY');
  const p=assessM44RuntimePresence(x);
  assert.equal(p.runtimeNamesPresent,false);
  assert.equal(p.productionActivationAuthorized,false);
});
test('deployed bundle, JWT, function or inventory drift is rejected',()=>{
  for(const change of [
    x=>{x.functions[0].ezbr_sha256='b'.repeat(64);},
    x=>{x.functions[0].verify_jwt=!x.functions[0].verify_jwt;},
    x=>{x.functions[0].status='INACTIVE';},
    x=>{x.functions.push({...x.functions[0],slug:'unexpected'});},
    x=>{x.source.sources[1].slug=x.source.sources[0].slug;},
    x=>{x.inventory.functions[0].slug='other';}
  ]){
    const x=fixture();change(x);
    assert.throws(()=>assessM44RuntimePresence(x),/M44_RUNTIME_PRESENCE_/u);
  }
});
test('metadata values, duplicate/unsafe names, bad Auth and inventory are rejected',()=>{
  for(const change of [
    x=>{x.secrets[0].value='DO_NOT_EXPORT';},
    x=>{x.secrets.push({name:x.secrets[0].name});},
    x=>{x.secrets[0].name='../bad';},
    x=>{x.authConfig.disable_signup=false;},
    x=>{x.authConfig.smtp_port=0;},
    x=>{x.inventory.classes.external_or_operator_provided=[];}
  ]){
    const x=fixture();change(x);
    assert.throws(()=>assessM44RuntimePresence(x),/M44_RUNTIME_PRESENCE_/u);
  }
});