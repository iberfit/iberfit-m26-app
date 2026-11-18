import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,chmod,rm,symlink,unlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const guard=path.resolve('scripts/ops/m44_offsite_archive_guard.py');
const source=readFileSync(guard,'utf8');
const python=[
 'import pathlib,runpy,sys',
 'tool=runpy.run_path(sys.argv[1])',
 'tool["validate_optional_platform_credentials"](pathlib.Path(sys.argv[2]))'
].join('\n');
const root=()=>({
 schema:'iberfit.m44.vault-root-key-archive.v1',
 project_ref:'pjhmrhejsoofmouedavw',
 root_key:'a'.repeat(64)
});
const hosted=()=>({
 schema:'iberfit.m44.hosted-auth-config-archive.v1',
 project_ref:'pjhmrhejsoofmouedavw',
 config:{
  site_url:'https://app.iberfit.cl/',disable_signup:true,
  external_anonymous_users_enabled:false,mailer_autoconfirm:false,
  mailer_allow_unverified_email_sign_ins:false,
  mailer_secure_email_change_enabled:true,password_min_length:10,
  smtp_host:'smtp.invalid',smtp_admin_email:'no-reply@example.invalid',
  smtp_user:'test-only',smtp_sender_name:'IBERFIT',smtp_port:587
 }
});
const run=dir=>spawnSync('python3',['-c',python,guard,dir],{
 encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}
});
async function sandbox(verify){
 const dir=await mkdtemp(path.join(tmpdir(),'iberfit-m44-platform-'));
 const vaultPath=path.join(dir,'vault-root-key.json');
 const authPath=path.join(dir,'hosted-auth-config.json');
 const persist=async(file,data)=>{
  await writeFile(file,JSON.stringify(data),{mode:0o600});
  await chmod(file,0o600);
 };
 try{
  await persist(vaultPath,root());
  await persist(authPath,hosted());
  await verify({dir,vaultPath,authPath,persist});
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('private captured Hosted Auth + Vault member pair validates only its archive shape',async()=>{
 await sandbox(async({dir})=>{
  const r=run(dir);
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.stdout,'');
 });
});
test('missing, extra, malformed or redirected Vault key fails without disclosure',async()=>{
 await sandbox(async({dir,vaultPath,persist})=>{
  for(const bad of [
   {...root(),root_key:'bad-secret'},
   {...root(),project_ref:'qa'},
   {...root(),private_note:'do-not-log'},
   {...root(),root_key:'A'.repeat(64)}
  ]){
   await persist(vaultPath,bad);
   const r=run(dir);
   assert.notEqual(r.status,0);
   assert.doesNotMatch(r.stdout+r.stderr,/bad-secret|do-not-log|a{64}|A{64}/);
  }
 });
});
test('insecure Auth, bad SMTP, disabled email checks or wrong project fails closed',async()=>{
 await sandbox(async({dir,authPath,persist})=>{
  for(const change of [
   x=>{x.project_ref='other';},
   x=>{x.config.site_url='https://wrong.invalid/';},
   x=>{x.config.disable_signup=false;},
   x=>{x.config.mailer_secure_email_change_enabled=false;},
   x=>{x.config.smtp_host='';},
   x=>{x.config.password_min_length=3;},
   x=>{x.config.smtp_port=65536;},
   x=>{x.private_note='must-not-print';}
  ]){
   const x=hosted();change(x);await persist(authPath,x);
   const r=run(dir);
   if(!('private_note' in x))assert.notEqual(r.status,0);
   else assert.notEqual(r.status,0);
   assert.doesNotMatch(r.stdout+r.stderr,/wrong.invalid|must-not-print/);
  }
 });
});
test('platform secrets reject symlinks and group-readable recovered files',async()=>{
 await sandbox(async({dir,vaultPath})=>{
  await chmod(vaultPath,0o644);
  assert.notEqual(run(dir).status,0);
  await unlink(vaultPath);
  const real=path.join(dir,'other-private');
  await writeFile(real,JSON.stringify(root()),{mode:0o600});
  await symlink(real,vaultPath);
  assert.notEqual(run(dir).status,0);
 });
});
test('TAR must include both new secrets and legacy role/census/catalog requirements',()=>{
 assert.match(source,/VAULT_ROOT_FILE = "vault-root-key\.json"/u);
 assert.match(source,/HOSTED_AUTH_FILE = "hosted-auth-config\.json"/u);
 assert.match(source,/newer == \{VAULT_ROOT_FILE, HOSTED_AUTH_FILE\}/u);
 assert.match(source,/ROLE_FILE in present and AUTH_CENSUS_FILE in present/u);
 assert.match(source,/validate_optional_platform_credentials\(base\)/u);
 assert.match(source,/PLATFORM_SECRET_FILE_NOT_PRIVATE/u);
 assert.doesNotMatch(source,/print\(.*root_key/u);
});
