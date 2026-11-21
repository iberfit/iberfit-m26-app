import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const code=readFileSync('scripts/ops/m44_managed_real_recovery.mjs','utf8');
const workflow=readFileSync('.github/workflows/m44-managed-real-recovery.yml','utf8');

test('M44 managed real-data rehearsal requires protected current Canary and explicit exact authorization',()=>{
 for(const check of [
  "process.env.GITHUB_ACTIONS!=='true'",
  "process.env.GITHUB_REPOSITORY!==REPO",
  "process.env.GITHUB_REF!=='refs/heads/canary/rc74-4'",
  "process.env.M44_USER_AUTHORIZATION!=='REAL_DATA_CLONE_ONLY_20261121'",
  "process.env.GITHUB_EVENT_NAME!=='push'",
  "process.env.GITHUB_RUN_ATTEMPT!=='1'",
  "process.env.IBERFIT_BACKUP_PASSPHRASE"
 ]) assert.ok(code.includes(check),check);
 assert.match(workflow,/environment: m26-canary-readonly/);
 assert.match(workflow,/group: iberfit-qa-shared-auth-readonly/);
 assert.match(workflow,/needs: wait-exact-canary/);
});
test('Never touch PROD as a database mutation target and never send external app messages',()=>{
 assert.match(code,/const TARGET='zfvaouggafdbqfbpwhfx'/);
 assert.match(code,/const PROD='pjhmrhejsoofmouedavw'/);
 assert.match(code,/const QA='gjztkdwfmunnzhtvxrsu'/);
 assert.doesNotMatch(code,/sup\s*\(\s*(?:PROD|'pjhmrhejsoofmouedavw'|"pjhmrhejsoofmouedavw")\s*,/);
 assert.doesNotMatch(code,/[\s.](?:smtp|sendMail|resend|webhook|pg_notify|deploy_edge_function)\s*\(/i);
 assert.doesNotMatch(workflow,/production-promote\.yml/);
});
test('M44 real ciphertext provenance, strict digest and no plaintext artifact upload',()=>{
 for(const part of [
  '44944459633','14723146683',
  'a68a5f1289bc974c0cc7ec62adfbced4325153d4271e5de278a4988bcfc913f1',
  'ARCHIVE_RUN_INVALID','BACKUP_SHA_NOT_ANCESTOR','CIPHER_DIGEST_MISMATCH',
  'CIPHER_DECRYPT_FAILED'
 ])assert.ok(code.includes(part),part);
 assert.doesNotMatch(workflow,/upload-artifact/);
 assert.match(code,/rmSync\(directory,\{force:true,recursive:true/);
});
test('Public Data API, Auth email/phone and signup are isolated before any real restore',()=>{
 const main=code.slice(code.indexOf('async function main()'));
 assert.ok(main.indexOf('await isolate()')<main.indexOf('await seal()'));
 assert.ok(main.indexOf('await seal()')<main.indexOf('await restoreData(conn)'));
 for(const item of [
  "db_schema:'m44_recovery_closed'",
  "external_email_enabled:false","external_phone_enabled:false",
  "external_anonymous_users_enabled:false","disable_signup:true",
  "PUBLIC_DATA_API_NOT_DENIED","ISOLATION_SCHEMA_GRANTS_UNSAFE",
  "ISOLATED_PROJECT_NOT_EMPTY"
 ])assert.ok(code.includes(item),item);
});
test('Only isolated target uses database password rotation, no imported old sessions and atomic DDL/data replay',()=>{
 assert.match(code,/await sup\(TARGET,'\/database\/password'/);
 assert.doesNotMatch(code,/await sup\(QA,'\/database\/password'/);
 assert.match(code,/--single-transaction/);
 assert.match(code,/--exit-on-error/);
 assert.match(code,/TABLE DATA auth \(users\|identities\|mfa_factors\)/);
 assert.doesNotMatch(code,/TABLE DATA auth \(users\|identities\|sessions\|refresh_tokens/);
 assert.match(code,/RESTORE_SOURCE_SCOPE_INVALID/);
});
test('Both Free project slots are restored in finally even on failures',()=>{
 assert.match(code,/finally\s*\{\s*await cleanup\(\);/);
 assert.match(code,/await sup\(TARGET,'\/pause'/);
 assert.match(code,/await sup\(QA,'\/restore'/);
 assert.match(code,/await waitState\(TARGET,'INACTIVE'/);
 assert.match(code,/await waitState\(QA,'ACTIVE_HEALTHY'/);
 assert.match(code,/PROJECT_STATE_TIMEOUT/);
});
test('Unauthorized local execution rejects before any network or filesystem mutation',()=>{
 const check=spawnSync(process.execPath,['--check','scripts/ops/m44_managed_real_recovery.mjs'],{encoding:'utf8',timeout:5000});
 assert.equal(check.status,0,check.stderr);
 const exec=spawnSync(process.execPath,['scripts/ops/m44_managed_real_recovery.mjs'],{
  encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH}
 });
 assert.equal(exec.status,1);
 assert.match(exec.stderr,/M44_MANAGED_REAL_PROTECTED_ONE_TIME_CONTEXT_REQUIRED/);
});

test('Real Storage stays PRIVATE with per-object SHA-256 parity; no public restoration or email',()=>{
 const m=code.slice(code.indexOf('async function restorePrivateStorage(){'));
 assert.ok(m.includes("public:false"));
 assert.ok(m.includes("public_buckets=0"));
 assert.ok(m.includes("/object/authenticated/"));
 assert.ok(m.includes("digest.digest('hex')!==o.sha256"));
 assert.ok(m.includes("SOURCE_STORAGE_BYTES_TAMPERED"));
 assert.ok(m.includes("CLONE_PRIVATE_STORAGE_FINAL_READBACK_DRIFT"));
 assert.ok(code.indexOf('await restoreData(conn)')<code.indexOf('await restorePrivateStorage()'));
 assert.doesNotMatch(workflow,/supabase\/functions\/.*deploy|smtp_host:/i);
});
test('Failed or cancelled data-replay is followed by a separate protected Free-slot recovery job',()=>{
 assert.match(workflow,/restore-free-slots:/);
 assert.match(workflow,/needs: \[wait-exact-canary, managed-recovery\]/);
 assert.match(workflow,/if: \$\{\{ always\(\)/);
 assert.match(workflow,/await req\(clone,'\/pause','POST'\)/);
 assert.match(workflow,/await req\(qa,'\/restore','POST'\)/);
 assert.match(workflow,/M44_MANAGED_FREE_SLOTS_RESTORED/);
});
