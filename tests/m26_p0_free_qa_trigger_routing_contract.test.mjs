import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';

const read=path=>readFileSync(path,'utf8');
const remote=read('.github/workflows/remote-gates.yml');
const qa=read('.github/workflows/qa-real-write-cert.yml');
const canary=read('.github/workflows/canary-exact-deploy.yml');

function pathsFor(yaml,section,next){
  const marker='\n  '+section+':';
  const from=yaml.indexOf(marker),to=yaml.indexOf('\n  '+next+':',from+marker.length);
  assert.ok(from>=0&&to>from,'P0_QA_WORKFLOW_TRIGGER_SECTION_MISSING:'+section);
  const part=yaml.slice(from,to);
  const values=[...part.matchAll(/^      - '([^']+)'$/gmu)].map(m=>m[1]);
  assert.ok(values.length>6,'P0_QA_WORKFLOW_TRIGGER_PATHS_MISSING');
  return values;
}
const remotePush=pathsFor(remote,'push','workflow_dispatch');
const qaPull=pathsFor(qa,'pull_request','push');
const qaPush=pathsFor(qa,'push','workflow_dispatch');
function covered(path,patterns){
  return patterns.some(pattern=>{
    if(pattern===path)return true;
    if(!pattern.includes('*'))return false;
    const sections=pattern.split('*');
    return path.startsWith(sections[0])&&path.endsWith(sections[sections.length-1]);
  });
}
function sourceImports(path){
  const source=read(path);
  return [...source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/gu)].map(([,specifier])=>{
    const target=posix.normalize(posix.join(posix.dirname(path),specifier));
    assert.ok(!target.startsWith('../'),'P0_QA_IMPORT_EXITS_REPO');
    return target;
  });
}
test('readonly remote QA only fires for its own runtime and modules, never unrelated writer-only QA scripts',()=>{
  assert.equal(remotePush.filter(p=>p.startsWith('scripts/remote-gates/')).length,4);
  assert.ok(!remotePush.includes('scripts/remote-gates/**'));
  const required=[
    'scripts/remote-gates/run_authenticated_readonly_gate.mjs',
    ...sourceImports('scripts/remote-gates/run_authenticated_readonly_gate.mjs')
      .filter(path=>path.startsWith('scripts/remote-gates/')),
  ];
  assert.equal(new Set(required).size,4,'Only explicitly audited direct reader deps');
  for(const path of required)
    assert.ok(remotePush.includes(path),'MISSING_REMOTE_READER_TRIGGER:'+path);
  assert.ok(remotePush.includes('src/m26/command-catalog.js'),'MISSING_REMOTE_COMMAND_CATALOG_TRIGGER');
  for(const path of [
    'scripts/remote-gates/run_qa_real_write_gate.mjs',
    'scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',
    'scripts/remote-gates/run_qa_connected360_v45_write_gate.mjs',
    'scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',
    'scripts/remote-gates/qa_m43_minimal_bootstrap_visibility.mjs',
    'scripts/remote-gates/run_qa_iri_report_emission_gate.mjs',
    'scripts/remote-gates/qa_client_identity_rpc.mjs',
    'scripts/remote-gates/m43-qa-fixture-safety.mjs',
    'scripts/remote-gates/m43-writer-handoff.mjs',
  ]){
    assert.ok(!covered(path,remotePush),'WRITER_ONLY_SCRIPT_MUST_NOT_TRIGGER_REMOTE_BROWSER:'+path);
    assert.ok(covered(path,qaPull)&&covered(path,qaPush),'WRITER_REQUIRES_REAL_WRITE_QA:'+path);
  }
  for(const critical of [
    'src/m26/app/application.js',
    'src/m26/supabase-transport.js',
    'src/m26/command-catalog.js',
    'src/m26/security/privileged.js',
    'qa/rc64/authenticated-smoke.spec.mjs',
    'supabase/qa-migrations/20261117154233_check.sql',
    '.github/workflows/remote-gates.yml',
  ])assert.ok(covered(critical,remotePush),'CRITICAL_REMOTE_GATE_NO_LONGER_TRIGGERED:'+critical);
  assert.match(remote,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(remote,/runuser -u pwuser -- npm run quality:rc64:auth-smoke/u);
  assert.match(remote,/node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/u);
  assert.match(canary,/run: node scripts\/remote-gates\/run_authenticated_readonly_gate\.mjs/u);
  assert.match(canary,/needs: qa-auth-readonly-preflight/u);
  assert.ok(!canary.slice(0,canary.indexOf('\npermissions:')).includes('    paths:'),
    'Canary exact deploy must still run on every Canary push');
});
test('QA real-write routing tracks writer helper and library dependencies for PR AND push',()=>{
  assert.deepEqual(qaPull,qaPush,'QA PR and Canary must match on exact trigger paths');
  const writerRoots=[
    'scripts/remote-gates/run_qa_real_write_gate.mjs',
    'scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',
    'scripts/remote-gates/run_qa_connected360_v45_write_gate.mjs',
    'scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',
    'scripts/remote-gates/qa_m43_minimal_bootstrap_visibility.mjs',
    'scripts/remote-gates/run_qa_iri_report_emission_gate.mjs',
    'scripts/remote-gates/m43-writer-handoff.mjs',
    'scripts/remote-gates/qa_client_delete_acl_denial.mjs',
  ];
  for(const root of writerRoots){
    assert.ok(covered(root,qaPull),'QA_WRITE_ROOT_TRIGGER_MISSING:'+root);
    for(const path of sourceImports(root)){
      if(path.startsWith('scripts/remote-gates/')||[
        'src/m26/production-state.js','src/m26/exercises/catalog.js',
        'src/m26/profile/client-avatar.js',
      ].includes(path))
        assert.ok(covered(path,qaPull),'QA_WRITE_DIRECT_DEPENDENCY_TRIGGER_MISSING:'+path);
    }
  }
  for(const dep of sourceImports('scripts/remote-gates/m43-qa-fixture-safety.mjs'))
    assert.ok(covered(dep,qaPull),'QA_WRITE_FIXTURE_JSON_TRIGGER_MISSING:'+dep);
  for(const dep of [
    'scripts/remote-gates/qa_m43_minimal_bootstrap_visibility.mjs',
    'tests/m26_p0_free_qa_m43_minimal_visibility.test.mjs',
    'src/m26/production-state.js','src/m26/exercises/catalog.js',
    'src/m26/profile/client-avatar.js',
    'scripts/remote-gates/m43-qa-fixture-safety.mjs',
    'scripts/remote-gates/m43-qa-retained-history-v3.json',
    'scripts/remote-gates/m43-writer-handoff.mjs',
  ]) assert.ok(covered(dep,qaPull),'QA_WRITE_MANDATORY_TRIGGER_MISSING:'+dep);
  assert.match(qa,/group: iberfit-qa-shared-auth-readonly/u);
  assert.match(qa,/run: node scripts\/remote-gates\/run_qa_m43_coach_client_write_gate\.mjs/u);
  assert.match(qa,/run: node scripts\/remote-gates\/run_qa_real_write_gate\.mjs/u);
  assert.match(qa,/run: node scripts\/remote-gates\/m43-writer-handoff\.mjs discover/u);
  assert.match(qa,/npx playwright test --config playwright\.m43-authenticated-browser\.config\.mjs/u);
});
test('trigger routing contract itself is CI- and source-change gated',()=>{
  const path='tests/m26_p0_free_qa_trigger_routing_contract.test.mjs';
  assert.ok(remotePush.includes(path));
  assert.ok(qaPull.includes(path)&&qaPush.includes(path));
  assert.ok(remotePush.includes('.github/workflows/remote-gates.yml'));
  assert.ok(qaPull.includes('.github/workflows/qa-real-write-cert.yml'));
});