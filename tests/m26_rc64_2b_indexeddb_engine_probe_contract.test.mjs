import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B IndexedDB engine probe is isolated synthetic and Node-bounded',()=>{
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');

  for(const mode of [
    'raw-open',
    'raw-cursor',
    'module-custom',
    'canonical-single',
    'canonical-concurrent',
  ]){
    assert.ok(smoke.includes(`'${mode}'`),`missing probe mode ${mode}`);
  }

  assert.match(smoke,/RC64_2B_IDB_ENGINE_PROBE_FAILED/u);
  assert.match(smoke,/RC64_2B_IDB_ENGINE_PROBE=PASS/u);
  assert.match(smoke,/3_000/u);
  assert.match(smoke,/Promise\.race/u);
  assert.match(smoke,/serviceWorkers:'block'/u);

  // Probe uses only local same-origin resources and synthetic database names.
  assert.match(smoke,/iberfit-rc64-idb-probe-open/u);
  assert.match(smoke,/iberfit-rc64-idb-probe-cursor/u);
  assert.match(smoke,/iberfit-rc64-idb-probe-custom/u);
  assert.match(smoke,/import\('\/src\/m26\/platform\/key-value-store\.js'\)/u);

  // No production identifiers, remote mutations, user values or credentials enter the probe body.
  const start=smoke.indexOf('const idbProbeModes=[');
  const end=smoke.indexOf('for(const account of accounts){',start);
  assert.ok(start>=0&&end>start);
  const probe=smoke.slice(start,end);

  assert.doesNotMatch(
    probe,
    /M26_QA_|SUPABASE|email|password|access_token|authorization|apikey|fetch\(/iu,
  );
  assert.doesNotMatch(
    probe,
    /transport\.|rpc\(|POST|PATCH|DELETE|PUT/iu,
  );

  // It cannot silently weaken the existing authenticated gate.
  // The smoke source itself does not contain the builder metadata field
  // `backendMutationAllowed`; enforce the real runtime protections instead.
  assert.match(smoke,/RC64_2B_AUTH_TIMEOUT/u);
  assert.match(smoke,/const READ_ONLY_RPCS=new Set/u);
  assert.match(smoke,/function allowedExternalRequest\(request\)/u);
  assert.match(smoke,/if\(url\.origin!==SUPABASE_ORIGIN\)return false/u);
  assert.match(smoke,/await route\.abort\('blockedbyclient'\)/u);
  assert.match(smoke,/service\[_-\]\?role/u);
});
