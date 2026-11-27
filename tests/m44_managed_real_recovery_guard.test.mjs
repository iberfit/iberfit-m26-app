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
  "!['1','2','3'].includes(process.env.GITHUB_RUN_ATTEMPT||'')",
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
  '46009568949','15204490077',
  'cc454d92065cd88bb51df5742bdc70e1f2431dabd3ab433d0b3cd97b72d07faf',
  'ARCHIVE_RUN_INVALID','BACKUP_SHA_NOT_ANCESTOR','CIPHER_DIGEST_MISMATCH',
  'CIPHER_DECRYPT_FAILED'
 ])assert.ok(code.includes(part),part);
 assert.doesNotMatch(workflow,/upload-artifact/);
 assert.match(code,/rmSync\(directory,\{force:true,recursive:true/);
});
test('Public Data API, Auth email/phone and signup are isolated before any real restore',()=>{
 const main=code.slice(code.indexOf('async function historicalManagedReplay()'),code.indexOf('async function main()'));
 assert.ok(main.indexOf('await isolate()')<main.indexOf('await seal()'));
 assert.ok(main.indexOf('await seal()')<main.indexOf('await restoreData(conn)'));
 for(const item of [
  "db_schema:'m44_recovery_closed'",
  "external_email_enabled:false","external_phone_enabled:false",
  "external_anonymous_users_enabled:false","disable_signup:true",
  "PUBLIC_API_NEGATIVE_CONTROL_UNVERIFIED","PUBLIC_API_CONTROL_PLANE_REOPENED","ISOLATION_SCHEMA_GRANTS_UNSAFE",
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
test('Historical Free-slot recovery job is retained but disabled in preflight-only mode',()=>{
 assert.match(workflow,/restore-free-slots:/);
 assert.match(workflow,/needs: \[wait-exact-canary, managed-recovery\]/);
 assert.match(workflow,/if: \$\{\{ always\(\)/);
 assert.match(workflow,/await req\(clone,'\/pause','POST'\)/);
 assert.match(workflow,/await req\(qa,'\/restore','POST'\)/);
 assert.match(workflow,/M44_MANAGED_FREE_SLOTS_RESTORED/);
});

test('A public-schema positive control must be observed BEFORE an HTTP negative control permits real data import',()=>{
 const seal=code.slice(code.indexOf('async function seal(){'),code.indexOf('async function databaseConnection(){'));
 assert.match(seal,/CREATE OR REPLACE VIEW public\.m44_recovery_exposure_probe WITH \(security_invoker=true\)/);
 assert.match(seal,/GRANT SELECT ON public\.m44_recovery_exposure_probe TO anon/);
 assert.match(seal,/PUBLIC_SCHEMA_POSITIVE_CONTROL_NOT_PROVEN/);
 assert.match(seal,/PUBLIC_API_NEGATIVE_CONTROL_UNVERIFIED/);
 const positive=seal.indexOf("if(!positiveControl)fail");
 const restricted=seal.indexOf("db_schema:'m44_recovery_closed'");
 const negative=seal.indexOf("if(!negativeControl)fail");
 assert.ok(positive>0&&restricted>positive&&negative>restricted);
 assert.ok(seal.indexOf('sealed=true;')>negative);
});

test('Management mutating 204/empty responses are treated as accepted only after state readback',()=>{
 assert.match(code,/const content=await response\.text\(\)/);
 assert.match(code,/if\(!content\.trim\(\)\)/);
 assert.match(code,/if\(!\['POST','PATCH'\]\.includes\(method\)\)fail\('MANAGEMENT_EMPTY_READONLY_RESPONSE'\)/);
 assert.match(code,/return Object\.freeze\(\{accepted:true,empty:true\}\)/);
 assert.match(code,/await waitState\(QA,'INACTIVE'\)/);
 assert.match(code,/await waitState\(TARGET,'ACTIVE_HEALTHY'\)/);
 assert.match(workflow,/const body=await res\.text\(\)/);
 assert.match(workflow,/if\(method==='GET'\)throw Error\('M44_SLOTS_EMPTY_GET'\)/);
 assert.match(workflow,/return \{accepted:true\};/);
 assert.match(workflow,/M44_SLOTS_INVALID_GET_JSON/);
 assert.match(code,/return Object\.freeze\(\{accepted:true,opaque:true\}\)/);
});

test('Every managed 400 from real recovery emits a bounded safe phase, never raw bodies or SQL',()=>{
 assert.match(code,/MANAGEMENT_HTTP_'\+response\.status\+'_PHASE_'\+allowed/);
 assert.match(code,/const allowed=\/\^\[A-Z0-9_\]\{3,48\}\$\/\.test\(m44Phase\)/);
 const ordered=['SEAL_PROJECT_IDENTITY','SEAL_EMPTY_SQL_READ','SEAL_KEYS_READ',
  'SEAL_CREATE_SYNTHETIC_PROBE_SQL','SEAL_CREATE_CLOSED_SCHEMAS_SQL',
  'SEAL_SWITCH_POSTGREST_SCHEMA','SEAL_VERIFY_POSTGREST_SCHEMA',
  'SEAL_DISABLE_AUTH_SIGNUPS','SEAL_VERIFY_AUTH_DISABLED',
  'SEAL_VERIFY_SCHEMA_GRANTS'];
 let index=0;
 for(const name of ordered){
  const next=code.indexOf("m44Phase='"+name+"';",index);
  assert.ok(next>=index,'Missing ordered fail-closed management stage '+name);
  index=next+name.length;
 }
 assert.match(code,/api-keys\?reveal=true/);
 assert.doesNotMatch(code,/console\.(?:log|error)\([^;]*(?:api_key|password|response\.text|Authorization|JSON\.stringify\(.*keys)/);
});

test('M44 avoids ambiguous management error output and preserves fail-closed data sequencing',()=>{
 assert.ok(code.includes("let m44Phase='BOOTSTRAP'"));
 assert.ok(code.includes("const allowed=/^[A-Z0-9_]{3,48}$/.test(m44Phase)?m44Phase:'UNCLASSIFIED'"));
 const beforeData=code.indexOf('await seal();');
 const importData=code.indexOf('await restoreData(conn);');
 assert.ok(beforeData>0 && importData>beforeData);
 assert.doesNotMatch(code,/console\.(?:log|error)\([^;\n]*response\.text/);
 assert.doesNotMatch(code,/console\.(?:log|error)\([^;\n]*JSON\.stringify\(\s*body/);
});

test('Interrupted sealed sandbox can be reused ONLY after proving it has no personal data',()=>{
 const seal=code.slice(code.indexOf('async function seal(){'),code.indexOf('async function databaseConnection(){'));
 const checks=["auth.users","auth.identities","auth.sessions","storage.objects",
  "storage.buckets","vault.secrets","schemaname IN ('public','private')",
  "viewname <> 'm44_recovery_exposure_probe'","ISOLATED_PROJECT_NOT_EMPTY",
  "SEAL_RESET_EMPTY_SANDBOX_POSTGREST",
  "UNEXPECTED_PRE_RESTORE_DATA_API_CONFIGURATION","EMPTY_SANDBOX_RESET_NOT_CONFIRMED"];
 for(const check of checks)assert.ok(seal.includes(check),'Missing safety check '+check);
 const emptyRead=seal.indexOf("fail('ISOLATED_PROJECT_NOT_EMPTY')");
 const exposed=seal.indexOf("body:{db_schema:'public'}");
 const recreated=seal.indexOf("CREATE OR REPLACE VIEW public.m44_recovery_exposure_probe");
 const sealed=seal.indexOf("body:{db_schema:'m44_recovery_closed'}");
 const importBegin=code.indexOf('await restoreData(conn);');
 assert.ok(emptyRead>=0&&exposed>emptyRead&&recreated>exposed&&sealed>recreated&&importBegin>0);
 assert.match(seal,/if\(apiBefore\.db_schema==='m44_recovery_closed'\)/);
 assert.match(seal,/if\(reopened\?\.db_schema!=='public'\)fail\('EMPTY_SANDBOX_RESET_NOT_CONFIRMED'\)/);
 assert.match(seal,/if\(!positiveControl\)fail\('PUBLIC_SCHEMA_POSITIVE_CONTROL_NOT_PROVEN'\)/);
 assert.match(seal,/if\(!negativeControl\)fail\('PUBLIC_API_NEGATIVE_CONTROL_UNVERIFIED'\)/);
});

test('Repeated synthetic sandbox recovery skips DDL when the known probe already exists',()=>{
 const seal=code.slice(code.indexOf('async function seal(){'),code.indexOf('async function databaseConnection(){'));
 const validate=seal.indexOf("fail('ISOLATED_PROJECT_NOT_EMPTY')");
 const existing=seal.indexOf("if(Number(row.synthetic_views)===0)");
 const ddl=seal.indexOf("CREATE OR REPLACE VIEW public.m44_recovery_exposure_probe");
 const reuse=seal.indexOf("SEAL_REUSE_EXISTING_SYNTHETIC_PROBE_HTTP");
 const positive=seal.indexOf("if(!positiveControl)fail('PUBLIC_SCHEMA_POSITIVE_CONTROL_NOT_PROVEN')");
 const close=seal.indexOf("db_schema:'m44_recovery_closed'");
 const negative=seal.indexOf("if(!negativeControl)fail('PUBLIC_API_NEGATIVE_CONTROL_UNVERIFIED')");
 assert.ok(validate>0&&existing>validate&&ddl>existing&&reuse>ddl&&positive>reuse&&close>positive&&negative>close);
 assert.match(seal,/if\(Number\(row\.synthetic_views\)===0\)\s*\{/);
 assert.match(seal,/'unexpected_views'/);
 assert.match(seal,/data\[0\]\?\.sentinel==='M44_ISOLATION_SENTINEL_ONLY'/);
});

test('Managed PostgREST must repeatedly deny an originally public synthetic view before ANY real data import',()=>{
 const seal=code.slice(code.indexOf('async function seal(){'),code.indexOf('async function databaseConnection(){'));
 const controlStart=seal.indexOf('let consecutiveDenied=0');
 const controlEnd=seal.indexOf("if(!negativeControl)fail('PUBLIC_API_NEGATIVE_CONTROL_UNVERIFIED')");
 const control=seal.slice(controlStart,controlEnd);
 assert.ok(controlStart>0 && controlEnd>controlStart);
 assert.match(control,/for\(let i=0;i<40;i\+\+\)/);
 assert.match(control,/consecutiveDenied\+\+/);
 assert.match(control,/consecutiveDenied=0/);
 assert.match(control,/if\(consecutiveDenied>=8\)/);
 assert.match(control,/await sleep\(3000\)/);
 assert.match(control,/cache:'no-store'/);
 assert.match(control,/finalConfig\?\.db_schema!=='m44_recovery_closed'/);
 assert.doesNotMatch(control,/if\(response\.ok\)fail/);
 assert.ok(seal.indexOf('sealed=true;')>controlEnd);
 assert.ok(code.indexOf('await restoreData(conn);')>code.indexOf('await seal();'));
});

test('Current protected workflow can only verify archive, never swap or import',()=>{
 const main=code.slice(code.indexOf('async function main()'));
 assert.match(workflow,/M44_MANAGED_EXECUTION_MODE: PREFLIGHT_ONLY/);
 assert.match(workflow,/always\(\) && false/);
 assert.ok(main.indexOf('await verifyBackup()')<main.indexOf('await downloadArchive()'));
 assert.ok(main.indexOf('await downloadArchive()')<main.indexOf("M44_MANAGED_ARCHIVE_PREFLIGHT_OK"));
 assert.doesNotMatch(main,/await (isolate|seal|restoreData|historicalManagedReplay)\(/);
 assert.match(main,/MANAGED_REPLAY_DISABLED_PENDING_ISOLATION_REVIEW/);
 assert.match(code,/evaluateM44OffsiteRecovery\(run,jobs,artifacts/);
 assert.match(code,/m44_offsite_archive_guard\.py','unpack'/);
 assert.match(code,/VAULT_NONEMPTY_REQUIRES_SEPARATE_RECOVERY_ROUTE/);
});
