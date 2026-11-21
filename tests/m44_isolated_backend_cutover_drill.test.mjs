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
 assert.ok(s.includes('m44_prepare_missing_local_roles.mjs'));
 assert.ok(s.includes('M44_LOCAL_ROLE_PLACEHOLDERS_NOLOGIN_ONLY'));
 assert.ok(s.includes('M44_REAL_SNAPSHOT_FULL_OWNER_ACL_RESTORED_ISOLATED_ONLY'));
 assert.ok(s.indexOf('node scripts/ops/m44_prepare_missing_local_roles.mjs')<
   s.indexOf('db pg_restore --exit-on-error'));
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
test('actual restored production ACL and RLS are exercised with restricted SQL roles before U72 install',()=>{
 const source=s.indexOf('check_sql RESTORED_RLS_SOURCE ');
 const anon=s.indexOf('role_rls_denial anon ');
 const auth=s.indexOf('role_rls_denial authenticated ');
 const install=s.indexOf('apply U72_INSTALL /release/');
 assert.ok(source>0&&anon>source&&auth>anon&&install>auth);
 for(const requirement of [
  'BEGIN READ ONLY;', 'SET LOCAL ROLE $actor;',
  '[[ "$actor" == anon || "$actor" == authenticated ]]',
  "(SELECT count(*) FROM public.client_access_v26)>0",
  "(SELECT count(*) FROM public.session_executions)>0",
  "(SELECT count(*) FROM public.iberfit_system_settings)>0",
  "(SELECT count(*) FROM public.client_access_v26)=0",
  "(SELECT count(*) FROM public.session_executions)=0",
  "(SELECT count(*) FROM public.iberfit_system_settings)=0",
  'NOT EXISTS (SELECT 1 FROM pg_policy',
  'RESTORED_RLS_ROLE_NOT_ALLOWLISTED',
  'RESTORED_RLS_${actor^^}_DENIAL_CHANGED',
  'M44_REAL_RESTORED_PROD_EFFECTIVE_RLS_UNAUTHENTICATED_DENIAL_VERIFIED_ONLY',
 ])assert.ok(s.includes(requirement),requirement);
 const roleBlock=s.slice(source,install);
 assert.doesNotMatch(roleBlock,/SELECT\s+\*|UPDATE\s+public|INSERT\s+INTO|DELETE\s+FROM/i);
 assert.ok(roleBlock.includes('2>"$out/real-rls-$actor-private.log"'));
 assert.ok(!roleBlock.includes('https://'));
 const parsed=spawnSync('bash',['-n',file],{encoding:'utf8',timeout:5000});
 assert.equal(parsed.status,0,parsed.stderr);
});

test('installer sequence and both Coach recovery directions are guarded and preserve counts',()=>{
 const ordered=[
  'check_sql BASELINE ','apply U72_INSTALL ','check_sql U72_INSTALLED ',
  'apply U60_ENABLE ','check_sql U60_OPEN ','apply U60_DISABLE ',
  'check_sql U60_CLOSED ','apply U72_ROLLBACK ','check_sql U72_RESTORED ',
 ];
 const loc=ordered.map(k=>s.indexOf('\n'+k));
 assert.ok(loc.every(n=>n>=0));
 assert.ok(loc.every((n,i)=>i===0||n>loc[i-1]));
 const active=s.indexOf('if [[ "$coach_guard_installed" == 1 ]]; then');
 const undo=s.indexOf('apply COACH_ROLLBACK ',active);
 const redo=s.indexOf('apply COACH_REINSTALL ',undo);
 const legacy=s.indexOf('apply COACH_INSTALL ',redo);
 const legacyUndo=s.indexOf('apply COACH_ROLLBACK ',legacy);
 assert.ok(active>loc.at(-1)&&undo>active&&redo>undo&&legacy>redo&&legacyUndo>legacy);
 for(const marker of [
  'COACH_PREINSTALLED_SOURCE','COACH_ROLLED_BACK','COACH_REINSTALLED',
  'COACH_PREINSTALL_SOURCE','COACH_INSTALLED','COACH_RESTORED',
  'COACH_SOURCE_CHANGED','CUSTOMER_OR_AUTH_TABLE_COUNT_DRIFT',
  'SELECT count(*) FROM auth.users',
  'SELECT count(*) FROM public.training_session_occurrences_v1',
  'SELECT count(*) FROM vault.secrets',
  "NOT has_function_privilege('anon'",
  "to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL"
 ])assert.ok(s.includes(marker),marker);
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

test('M44 real restore bash scripts parse correctly; no duplicate cutover tail',()=>{
 for(const script of [
  'scripts/ops/m44_real_global_roles_replay.sh',
  'scripts/ops/m44_isolated_backend_cutover_drill.sh',
 ]){
  const run=spawnSync('bash',['-n',script],{
   env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000,
  });
  assert.equal(run.status,0,script+' must be valid bash syntax');
  assert.equal(run.stdout,'');
  assert.equal((fs.readFileSync(script,'utf8').match(
   /echo M44_(?:REAL_GLOBAL_ROLES_RESTORED_IN_ISOLATED_PG17_ONLY|REAL_PROD_BACKEND_SQL_INSTALL_AND_ROLLBACK_ISOLATED_ONLY)/gu
  )||[]).length,1,script+' must contain its terminal success marker exactly once');
 }
 assert.equal((s.match(/M44_LOCAL_ROLE_PLACEHOLDERS_NOLOGIN_ONLY/gu)||[]).length,1);
 assert.equal((s.match(/db createdb "\$PGDATABASE"/gu)||[]).length,1);
});

test('all SQL mutations in isolated backend drill execute with source postgres ownership',()=>{
 assert.ok(s.includes("-c 'SET ROLE postgres' -f"));
 assert.ok(s.includes('VERBOSITY=verbose'));
 assert.ok(s.includes('M44_LOCAL_SQL_APPLY_SQLSTATE:'));
 assert.ok(s.includes('M44_LOCAL_SQL_POLICY_DENIAL:'));
 assert.equal((s.match(/apply U72_INSTALL /gu)||[]).length,1);
 assert.equal((s.match(/apply U72_ROLLBACK /gu)||[]).length,1);
 assert.equal((s.match(/apply COACH_ROLLBACK /gu)||[]).length,2);
  assert.equal((s.match(/apply COACH_INSTALL /gu)||[]).length,1);
  assert.equal((s.match(/apply COACH_REINSTALL /gu)||[]).length,1);
 const i=s.indexOf("apply(){");
 const j=s.indexOf("check_sql BASELINE");
 assert.ok(i>=0&&j>i);
 const procedure=s.slice(i,j);
 assert.equal((procedure.match(/-f "\$pathname"/gu)||[]).length,1);
 assert.ok(!procedure.includes('postgresql://'));
 const parsed=spawnSync('bash',['-n',file],{encoding:'utf8',timeout:5000});
 assert.equal(parsed.status,0,parsed.stderr);
});

test('isolated executor restores source-verified nine memberships without enabling login',()=>{
 const nodeIndex=s.indexOf('node scripts/ops/m44_reconcile_postgres_executor.mjs');
 const createIndex=s.indexOf('db createdb "$PGDATABASE"');
 assert.ok(nodeIndex>0&&createIndex>nodeIndex);
 assert.ok(s.includes('M44_ISOLATED_POSTGRES_EXECUTOR_PARITY_NOLOGIN_VERIFIED_ONLY'));
 assert.ok(s.includes('NOT rolcanlogin AND NOT rolsuper AND rolcreatedb'));
 assert.ok(s.includes("'pg_read_all_data'::regrole"));
 assert.ok(s.includes("admin_option=(roleid<>'supabase_privileged_role'::regrole)"));
 assert.ok(s.includes('LOCAL_OWNER_ROLE_ATTRIBUTES_DRIFT'));
 assert.ok(s.includes('M44_LOCAL_SQL_APPLY_SQLSTATE:'));
 assert.equal((s.match(/m44_reconcile_postgres_executor\.mjs/gu)||[]).length,1);
 const yaml=fs.readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 assert.ok(yaml.includes('tests/m44_reconcile_postgres_executor.test.mjs'));
 const valid=spawnSync('bash',['-n',file],{encoding:'utf8',timeout:5000});
 assert.equal(valid.status,0,valid.stderr);
});

test('isolated database owner matches REAL PROD pg_database_owner before U72 SQL',()=>{
 const ownerStatement=s.indexOf('ALTER DATABASE "iberfit_recovery_acl_test" OWNER TO "postgres";');
 const localCreate=s.indexOf('db createdb "$PGDATABASE"');
 const fullRestore=s.indexOf('db pg_restore --exit-on-error');
 const aclProbe=s.indexOf("has_schema_privilege(current_user,'public','CREATE')");
 const install=s.indexOf('apply U72_INSTALL /release/');
 assert.ok(localCreate>=0&&ownerStatement>localCreate);
 assert.ok(fullRestore>ownerStatement&&aclProbe>fullRestore&&install>aclProbe);
 assert.ok(s.includes("current_database()='iberfit_recovery_acl_test'"));
 assert.ok(s.includes("nspowner='pg_database_owner'::regrole"));
 assert.ok(s.includes("current_user='postgres'"));
 assert.ok(s.includes("has_schema_privilege(current_user,'private','CREATE')"));
 assert.ok(s.includes('LOCAL_DB_OWNER_PARITY_DENIED'));
 assert.ok(s.includes('LOCAL_EFFECTIVE_OWNER_ACL_DRIFT'));
 assert.equal((s.match(/ALTER DATABASE "iberfit_recovery_acl_test" OWNER TO "postgres";/gu)||[]).length,1);
 assert.ok(!s.includes('ALTER DATABASE "postgres" OWNER TO'));
 assert.ok(!s.includes('ALTER DATABASE "template1" OWNER TO'));
});
test('isolated release SQL failure exposes only diagnostic class and numeric source line',()=>{
 assert.ok(s.includes('M44_LOCAL_SQL_FAILURE_SOURCE_LINE:'));
 assert.ok(s.includes('M44_LOCAL_SQL_FAILURE_CLASS:'));
 for(const category of ['ROLE_SWITCH','SCHEMA_CREATE_ACL','FUNCTION_OWNERSHIP','TABLE_ACL'])
  assert.ok(s.includes(category));
 assert.ok(!s.includes('cat "$out/apply-$code.log"'));
 assert.ok(!s.includes('tail -n 20 "$out/apply-$code.log"'));
 const x=spawnSync('bash',['-n',file],{encoding:'utf8',timeout:5000});
 assert.equal(x.status,0,x.stderr);
});

test('real protected U72 rollback terminates every restored function and preserves fail-closed guards',()=>{
 const rollback=fs.readFileSync('supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql','utf8');
 const install=fs.readFileSync('supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql','utf8');
 for(const [label,source,count] of [['rollback',rollback,3],['install',install,4]]){
  const opens=source.match(/^\s*AS \$function\$\s*$/gmu)||[];
  const closes=source.match(/^\$function\$;\s*$/gmu)||[];
  assert.equal(opens.length,count,label+' must retain every original function definition');
  assert.equal(closes.length,count,label+' must terminate every SQL function statement');
  assert.doesNotMatch(source,/^\$function\$\s*$/gmu,label+' cannot leave an open SQL function');
 }
 assert.ok(rollback.trim().startsWith('-- U72 protected rollback: preserve user data.'));
 assert.ok(rollback.includes('M1_U72_PROD_ROLLBACK_UNSAFE_OR_DRIFT'));
 assert.ok(rollback.includes('M1_U72_ROLLBACK_READBACK_DRIFT'));
 assert.ok(rollback.indexOf('REVOKE ALL ON FUNCTION')<
  rollback.indexOf('CREATE OR REPLACE FUNCTION'));
 assert.ok(rollback.indexOf('DROP FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb);')>
  rollback.lastIndexOf('$function$;'));
 for(const md5 of ['5914acf371015a6bbeeaf95f99e056e3',
  '35862b8e4977fcf0c3d611937fe83126','f97d7df4fdd510b63ac1249352273927'])
  assert.ok(rollback.includes(md5),'rollback must assert original function hash');
 assert.match(rollback,/\nCOMMIT;\s*$/u);
});
