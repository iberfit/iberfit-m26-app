import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const file='scripts/ops/m44_isolated_backend_cutover_drill.sh';
const s=fs.readFileSync(file,'utf8');
const sql={
 u72:'supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql',
 u72Rollback:'supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql',
 enable:'supabase/release-procedures/20261112_m1_u60_prod_guarded_enable.sql',
 disable:'supabase/release-procedures/20261112_m1_u60_prod_guarded_disable.sql',
 coach:'supabase/migrations/20261117235000_coach_scoped_hosted_invitation_v1.sql',
 coachRollback:'supabase/rollbacks/20261117235000_coach_scoped_hosted_invitation_v1.rollback.sql',
};
test('all source SQL and rollback files are exact repository assets',()=>{
 for(const [key,path] of Object.entries(sql)){
  assert.ok(fs.existsSync(path),key);
  assert.ok(s.includes(path.split('/').at(-1)),key);
 }
 assert.ok(s.includes('M44_REAL_PROD_BACKEND_SQL_INSTALL_AND_ROLLBACK_ISOLATED_ONLY'));
 assert.ok(s.includes('M44_HOSTED_AUTH_VAULT_EDGE_RUNTIME_NOT_CERTIFIED'));
});
test('only localhost PG17+isolated database, no Prod/QA or plaintext artifact exports',()=>{
 for(const part of [
  'GITHUB_ACTIONS','RUNNER_OS','M44_SQL_DRILL_ENABLED',
  'PGHOST:-','PGPORT:-','PGUSER:-','PGDATABASE:-',
  '127.0.0.1','iberfit_recovery_acl_test',
  '/iberfit-recovery/isolated','! -L "$work/database.pgcustom"',
  '--network host','pg_restore --exit-on-error','ON_ERROR_STOP=1',
  'FULL_OWNER_ACL_RESTORE_FAILED','CUSTOMER_OR_AUTH_TABLE_COUNT_DRIFT'
 ])assert.ok(s.includes(part),part);
 assert.ok(!s.includes('supabase db push'));
 assert.ok(!s.includes('supabase migration up'));
 assert.ok(!s.includes('https://pjhmrhejsoofmouedavw.supabase.co'));
 assert.ok(!s.includes('db.pjhmrhejsoofmouedavw.supabase.co'));
 assert.ok(!s.includes('IBERFIT_BACKUP_PASSPHRASE'));
 assert.ok(!s.includes('productionReleaseAuthorized:true'));
});
test('malformed or external runner targets fail before any database operations',()=>{
 for(const change of [
  x=>{x.GITHUB_ACTIONS='false';},
  x=>{x.RUNNER_OS='Windows';},
  x=>{x.PGHOST='db.example.invalid';},
  x=>{x.PGDATABASE='postgres';},
  x=>{x.PGPORT='6543';},
  x=>{x.M44_SQL_DRILL_ENABLED='false';},
  x=>{x.IBERFIT_PROD_DATABASE_URL='postgresql://example.invalid/db';},
  x=>{x.SUPABASE_ACCESS_TOKEN='not-permitted';},
  x=>{x.PGPASSWORD='';},
 ]){
  const env={
   PATH:process.env.PATH,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',
   M44_SQL_DRILL_ENABLED:'true',PGHOST:'127.0.0.1',PGPORT:'5432',
   PGUSER:'supabase_admin',PGDATABASE:'iberfit_recovery_acl_test',
   PGPASSWORD:'test',RUNNER_TEMP:'/tmp/not-valid',
   IBERFIT_PROD_DATABASE_URL:'',SUPABASE_ACCESS_TOKEN:'',
   IBERFIT_PROD_STORAGE_SERVICE_KEY:'',
  };
  change(env);
  const r=spawnSync('bash',[file,'/tmp/not-valid/iberfit-recovery/isolated'],{
   encoding:'utf8',timeout:3500,env,
  });
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/M44_ISOLATED_BACKEND_DRILL_/u);
  assert.equal(r.stdout,'');
 }
});
test('installer sequence is guarded, reversible and checks data counts',()=>{
 const ordered=[
  'check_sql BASELINE ','apply U72_INSTALL ','check_sql U72_INSTALLED ',
  'apply U60_ENABLE ','check_sql U60_OPEN ','apply U60_DISABLE ',
  'check_sql U60_CLOSED ','apply U72_ROLLBACK ',
  'check_sql U72_RESTORED ','apply COACH_INSTALL ',
  'check_sql COACH_INSTALLED ','apply COACH_ROLLBACK ','check_sql COACH_RESTORED ',
 ];
 // Only executable stage lines count. Comments and file inventory occur earlier.
 const loc=ordered.map(k=>s.indexOf('\n'+k));
 assert.ok(loc.every(n=>n>=0));
 assert.ok(loc.every((n,i)=>i===0||n>loc[i-1]));
 assert.ok(s.includes('CUSTOMER_OR_AUTH_TABLE_COUNT_DRIFT'));
 assert.ok(s.includes("SELECT count(*) FROM auth.users"));
 assert.ok(s.includes("SELECT count(*) FROM public.training_session_occurrences_v1"));
 assert.ok(s.includes("SELECT count(*) FROM vault.secrets"));
 assert.ok(s.includes("NOT has_function_privilege('anon'"));
 assert.ok(s.includes("to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL"));
});
test('M44 workflow executes drill only inside isolated restore step',()=>{
 const yaml=fs.readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 const at=yaml.indexOf('bash scripts/ops/m44_isolated_backend_cutover_drill.sh');
 assert.ok(at>0);
 const within=yaml.indexOf('Reopen ciphertext and verify restored Storage bytes in isolated workspace');
 const after=yaml.indexOf('Rehearse genuine global roles on fresh networkless PG17');
 assert.ok(within>0&&after>within);
 assert.ok(at>within&&at<after);
 assert.ok(yaml.includes('M44_ISOLATED_BACKEND_SQL_ROLLBACK_NOT_CERTIFIED'));
 assert.ok(yaml.includes('M44_FULL_PLATFORM_RECOVERY_NOT_CERTIFIED'));
 assert.ok(!s.includes('platformRecoveryVerified:true'));
});
