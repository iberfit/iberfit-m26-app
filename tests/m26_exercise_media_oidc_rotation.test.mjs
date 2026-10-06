import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const workflow=readFileSync(join(root,'.github/workflows/exercise-media-auto-factory.yml'),'utf8');
const helper=readFileSync(join(root,'scripts/exercise-media/auto-factory-oidc-renew.sh'),'utf8');

function fakeJwt(audience,ttlSeconds){
  const encode=(value)=>Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
  return [encode({alg:'RS256',typ:'JWT'}),encode({aud:audience,exp:Math.floor(Date.now()/1000)+ttlSeconds}),'f'.repeat(80)].join('.');
}
function invoke(audience,ttlSeconds){
  const directory=mkdtempSync(join(tmpdir(),'iberfit-oidc-qa-'));
  const envFile=join(directory,'github-env');
  const token=fakeJwt(audience,ttlSeconds);
  const script=[
    'set -euo pipefail',
    'curl() { printf \x27{"value":"%s"}\x27 "$FAKE_GITHUB_OIDC"; }',
    'source scripts/exercise-media/auto-factory-oidc-renew.sh',
    'iberfit_refresh_auto_factory_oidc',
    'test "$IBERFIT_AUTO_FACTORY_OIDC" = "$FAKE_GITHUB_OIDC"',
  ].join('\n');
  try{
    const run=spawnSync('bash',['-c',script],{
      cwd:root,
      encoding:'utf8',
      env:{
        ...process.env,
        FAKE_GITHUB_OIDC:token,
        GITHUB_ACTIONS:'true',
        GITHUB_ENV:envFile,
        ACTIONS_ID_TOKEN_REQUEST_URL:'https://example.invalid/oidc',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN:'mock-github-runner-only',
        OIDC_AUDIENCE:'iberfit-exercise-media-auto-factory',
      },
    });
    return {
      status:run.status,
      stdout:run.stdout||'',
      stderr:run.stderr||'',
      envContent:existsSync(envFile)?readFileSync(envFile,'utf8'):'',
      token,
    };
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
}

test('OIDC is renewed in initial, staging, review and failure phases without changing broker authority',()=>{
  assert.match(workflow,/id-token:\s*write/u);
  for(const [start,end] of [
    ['Obtain GitHub OIDC token','Inspect queue before provisioning AI proxy'],
    ['Stage review pixels privately','Preserve review candidate evidence'],
    ['Register candidate awaiting human approval','Quarantine failed claimed exercise'],
    ['Quarantine failed claimed exercise','Preserve terminal failure evidence'],
  ]){
    const a=workflow.indexOf('      - name: '+start);
    const b=workflow.indexOf('      - name: '+end,a);
    assert.ok(a>=0&&b>a,start+' must retain a bounded section');
    const section=workflow.slice(a,b);
    assert.match(section,/source scripts\/exercise-media\/auto-factory-oidc-renew\.sh/u);
    assert.match(section,/iberfit_refresh_auto_factory_oidc/u);
  }
  assert.match(helper,/ACTIONS_ID_TOKEN_REQUEST_URL/u);
  assert.match(helper,/::add-mask::/u);
  assert.match(helper,/GITHUB_ENV/u);
  assert.doesNotMatch(helper,/SUPABASE_SERVICE_ROLE_KEY|service_role|issue.*long.lived|DISABLE.*JWT/i);
  assert.match(workflow,/IBERFIT_FACTORY_QUALITY_REJECTED == 'true'/u);
  assert.match(workflow,/action:"fail"/u);
  assert.doesNotMatch(workflow,/action=publish/u);
});

test('fresh GitHub OIDC can be reused in current and subsequent steps without outputting a bare JWT',()=>{
  const x=invoke('iberfit-exercise-media-auto-factory',240);
  assert.equal(x.status,0,x.stderr);
  assert.ok(x.envContent.includes('IBERFIT_AUTO_FACTORY_OIDC='+x.token));
  assert.ok(x.stdout.includes('::add-mask::'+x.token));
  assert.ok(x.stdout.includes('AUTO_FACTORY_OIDC_RENEWED'));
  assert.ok(!x.stdout.split('\n').some(line=>line.trim()===x.token));
});

test('expired or near-expired OIDC fails closed without being written to the job environment',()=>{
  for(const seconds of [-60,40]){
    const x=invoke('iberfit-exercise-media-auto-factory',seconds);
    assert.notEqual(x.status,0,'short-lived token must not authorize a stage transition');
    assert.equal(x.envContent,'');
    assert.doesNotMatch(x.stdout,/AUTO_FACTORY_OIDC_RENEWED/u);
  }
});

test('unexpected audience cannot authorize media stage/review/quarantine',()=>{
  const x=invoke('different-audience',240);
  assert.notEqual(x.status,0);
  assert.equal(x.envContent,'');
  assert.doesNotMatch(x.stdout,/AUTO_FACTORY_OIDC_RENEWED/u);
});
