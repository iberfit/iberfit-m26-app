import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureHostedAuthConfig,verifyRestoredHostedAuthConfig,
 validateAuthConfigRecord,SCHEMA,PROD_REF} from '../scripts/ops/m44_hosted_auth_config_archive.mjs';

const TOKEN='synthetic-management-token-only-never-real';
const config=()=>({
 site_url:'https://app.iberfit.cl/',disable_signup:true,
 external_anonymous_users_enabled:false,mailer_autoconfirm:false,
 mailer_allow_unverified_email_sign_ins:false,
 mailer_secure_email_change_enabled:true,password_min_length:8,
 smtp_host:'smtp.example.invalid',smtp_admin_email:'test@example.invalid',
 smtp_user:'test',smtp_sender_name:'IBERFIT',smtp_port:'465',
 mailer_subjects_confirmation:'Synthetic example only',
 smtp_pass:'DO_NOT_EXPOSE_SYNTHETIC_PASSWORD'
});
const record=()=>({schema:SCHEMA,project_ref:PROD_REF,config:config()});
const mock=(body,code=200,contentType='application/json')=>async (url,options)=>{
 assert.equal(url,`https://api.supabase.com/v1/projects/${PROD_REF}/config/auth`);
 assert.equal(options.method,'GET');
 assert.equal(options.redirect,'error');
 assert.equal(options.headers.Authorization,`Bearer ${TOKEN}`);
 assert.ok(options.signal);
 return {status:code,headers:{get:()=>contentType},text:async()=>JSON.stringify(body)};
};
async function temp(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-m44-auth-'));
 try{await fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('read-only Hosted Auth capture keeps private source settings and refuses overwrites',async()=>{
 await temp(async dir=>{
  const dest=path.join(dir,'hosted-auth-config.json');
  const r=await captureHostedAuthConfig({token:TOKEN,outputPath:dest,fetchImpl:mock(config())});
  assert.deepEqual(r,{privateSnapshotStaged:true,hostedAuthRecoveryVerified:false,platformRecoveryVerified:false});
  assert.equal(fs.statSync(dest).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(dest,'utf8')),record());
  assert.deepEqual(await verifyRestoredHostedAuthConfig(dest),{
   configArchived:true,remoteCredentialsRecoverable:false,hostedAuthRestored:false,
   hostedAuthRecoveryVerified:false,platformRecoveryVerified:false});
  await assert.rejects(captureHostedAuthConfig({token:TOKEN,outputPath:dest,
   fetchImpl:mock(config())}),/PRIVATE_WRITE_FAILED/);
 });
});

test('source endpoint rejects foreign project, bad token, redirections and malformed data',async()=>{
 await temp(async dir=>{
  const dest=path.join(dir,'auth.json');
  const run=(body,opt={})=>captureHostedAuthConfig({token:TOKEN,outputPath:dest,
   fetchImpl:mock(body),...opt});
  await assert.rejects(run(config(),{projectRef:'gjztkdwfmunnzhtvxrsu'}),/TARGET_DENIED/);
  await assert.rejects(run(config(),{token:'short'}),/TOKEN_REQUIRED/);
  await assert.rejects(run({...config(),disable_signup:false}),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run({...config(),mailer_secure_email_change_enabled:false}),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run({...config(),smtp_host:null}),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run(config(),{fetchImpl:mock(config(),401)}),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run(config(),{fetchImpl:mock(config(),302,'text/html')}),/MANAGEMENT_READ_FAILED/);
  await assert.rejects(run(config(),{fetchImpl:async()=>{throw Error('NEVER_LEAK_PRIVATE_DATA');}}),/MANAGEMENT_READ_FAILED/);
  assert.equal(fs.existsSync(dest),false);
 });
});

test('private restored archive rejects symlink, public mode, wrong project and unsafe baseline',async()=>{
 await temp(async dir=>{
  const file=path.join(dir,'config.json');
  fs.writeFileSync(file,JSON.stringify(record()),{mode:0o600});
  const link=path.join(dir,'link.json');fs.symlinkSync(file,link);
  await assert.rejects(verifyRestoredHostedAuthConfig(link),/RESTORE_INPUT_INVALID/);
  fs.chmodSync(file,0o644);
  await assert.rejects(verifyRestoredHostedAuthConfig(file),/RESTORE_INPUT_INVALID/);
  fs.chmodSync(file,0o600);
  assert.throws(()=>validateAuthConfigRecord({...record(),project_ref:'gjztkdwfmunnzhtvxrsu'}),/RECORD_INVALID/);
  assert.throws(()=>validateAuthConfigRecord({...record(),config:{...config(),disable_signup:false}}),/PRODUCTION_AUTH_BASELINE_DRIFT/);
 });
});

test('M44 encrypted-only workflow captures settings before encrypting and checks after decrypting',()=>{
 const code=fs.readFileSync('scripts/ops/m44_hosted_auth_config_archive.mjs','utf8');
 assert.match(code,/method:'GET'/);
 assert.match(code,/redirect:'error'/);
 assert.doesNotMatch(code,/\b(?:POST|PUT|PATCH|DELETE)\b/);
 assert.doesNotMatch(code,/console\.log\s*\(/);
 const workflow=fs.readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const job=workflow.slice(workflow.indexOf('name: m44-prod-db-storage-encrypted-backup-and-restore'));
 const capture=job.indexOf('m44_hosted_auth_config_archive.mjs capture');
 const tar=job.indexOf('tar -C "$WORK/plain"');
 const encrypt=job.indexOf('m44_encrypted_backup_archive.mjs encrypt');
 const decrypt=job.indexOf('m44_encrypted_backup_archive.mjs decrypt');
 const verify=job.indexOf('m44_hosted_auth_config_archive.mjs verify');
 const publish=job.indexOf('Publish verified encrypted archive');
 assert.ok(capture>0&&capture<tar&&tar<encrypt&&encrypt<decrypt&&decrypt<verify);
 assert.ok(publish>verify);
 assert.match(job,/hosted-auth-config\.json/);
 assert.match(workflow,/tests\/m44_hosted_auth_config_archive\.test\.mjs/);
});
