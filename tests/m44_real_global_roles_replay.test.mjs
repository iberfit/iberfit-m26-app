import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const file='scripts/ops/m44_real_global_roles_replay.sh';
const script=readFileSync(file,'utf8');
test('replays only real encrypted archive globals in clean networkless PG17',()=>{
 for(const fragment of ['GITHUB_ACTIONS','RUNNER_OS','GITHUB_RUN_ID',
   'global-roles.sql','m44_global_roles_archive_check.mjs',
   '--network none','no-new-privileges','docker port',
   'ON_ERROR_STOP=1','POSTGRES_USER=supabase_admin','ROLE_CARDINALITY_DRIFT'])
  assert.ok(script.includes(fragment),fragment);
 assert.ok(!script.includes('supabase db push'));
 assert.ok(!script.includes('pg_restore -h db.'));
});
test('invalid inputs fail before any Docker or Supabase mutation',()=>{
 for(const env of [
  {GITHUB_ACTIONS:'false',RUNNER_OS:'Linux'},
  {GITHUB_ACTIONS:'true',RUNNER_OS:'Windows'},
  {GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',GITHUB_RUN_ID:'no',GITHUB_RUN_ATTEMPT:'1'},
  {GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',
   RUNNER_TEMP:'/tmp',IBERFIT_M44_ROLES_FILE:'/tmp/global-roles.sql'}
 ]){
  const x=spawnSync('bash',[file],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,...env}});
  assert.notEqual(x.status,0);
  assert.match(x.stderr,/M44_REAL_GLOBAL_ROLES_/u);
  assert.equal(x.stdout,'');
 }
});
test('live recovery proof is narrow: no claims about Hosted Auth, JWT, Vault or app ACL',()=>{
 const yaml=readFileSync('.github/workflows/m44-encrypted-disaster-recovery.yml','utf8');
 assert.ok(yaml.includes('m44_real_global_roles_replay.sh'));
 assert.match(yaml,/continue-on-error:\s*true/u);
 assert.ok(script.includes('M44_HOSTED_AUTH_VAULT_EDGE_AND_EFFECTIVE_RLS_NOT_CERTIFIED'));
 assert.doesNotMatch(script,/platformRecoveryVerified:\s*true/u);
});

test('private replay diagnosis exposes only SQLSTATE and a fixed command category',()=>{
 const x=spawnSync('bash',['-n',file],{encoding:'utf8',timeout:5000});
 assert.equal(x.status,0,x.stderr);
 assert.ok(script.includes('M44_REAL_ROLES_REPLAY_SQLSTATE:'));
 assert.ok(script.includes('M44_REAL_ROLES_REPLAY_KIND:'));
 assert.match(script,/CREATE_ROLE\|ALTER_ROLE\|GRANT_ROLE\|REVOKE_ROLE\|OTHER/);
 assert.ok(script.includes('global-roles[.]sql:[0-9]{1,6}:'));
 assert.equal((script.match(/echo M44_REAL_GLOBAL_ROLES_RESTORED_IN_ISOLATED_PG17_ONLY/g)||[]).length,1);
});

test('bootstrap matches source GRANTED BY and verifies archived membership grantor parity',()=>{
 for(const guard of ['BOOTSTRAP_SOURCE_DRIFT','GRANTOR_SOURCE_DRIFT',
   'MEMBERSHIP_SOURCE_DRIFT','BOOTSTRAP_FILTER_DRIFT','GRANTOR_PARITY_DRIFT',
   'POSTGRES_USER=supabase_admin','global-roles-replay.sql',
   'docker cp "$replay"',"grantor='supabase_admin'::regrole"])
  assert.ok(script.includes(guard),guard);
 assert.ok(!script.includes('m44_restore_admin'));
 assert.ok(!script.includes('GRANTED BY CURRENT_USER'));
 const expression=script.match(/sed -E '([^']+)' "\$archive" >"\$replay"/u)?.[1];
 assert.ok(expression);
 const sample=[
  'CREATE ROLE supabase_admin;',
  'ALTER ROLE supabase_admin WITH SUPERUSER;',
  'CREATE ROLE "postgres";',
  'GRANT postgres TO anon GRANTED BY supabase_admin;',
  ''
 ].join('\n');
 const x=spawnSync('sed',['-E',expression],{input:sample,encoding:'utf8'});
 assert.equal(x.status,0,x.stderr);
 assert.equal(x.stdout,sample.replace('CREATE ROLE supabase_admin;\n',''));
});

test('PG17 role cardinality excludes only literal pg_ internal prefix',()=>{
 // LIKE 'pg_%' treats underscore as a wildcard and silently skips legitimate
 // roles such as pgbouncer. The source archive includes these custom roles.
 assert.ok(script.includes("LEFT(rolname,3) <> 'pg_'"));
 assert.ok(!script.includes("rolname NOT LIKE 'pg_%'"));
 const realNames=['supabase_admin','postgres','anon','pgbouncer',
   'pg_database_owner','pg_read_all_data','service_role'];
 const intended=realNames.filter(name=>name.slice(0,3)!=='pg_');
 assert.ok(intended.includes('pgbouncer'));
 assert.ok(!intended.includes('pg_database_owner'));
 assert.equal(intended.length,5);
});
