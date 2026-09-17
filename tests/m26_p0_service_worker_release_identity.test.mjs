import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  productionServiceWorkerVersion,
  stampServiceWorkerSource,
  stampCanonicalWorkerWrapper,
  validateServiceWorkerReleaseIdentity,
} from '../scripts/service_worker_release_identity.mjs';

const SHA_N1='1111111111111111111111111111111111111111';
const SHA_N='2222222222222222222222222222222222222222';

function sourceFixtures(){
  return {
    sw:fs.readFileSync(new URL('../public/m26/sw.js',import.meta.url),'utf8'),
    wrapper:fs.readFileSync(new URL('../public/m26/iberfit-sw.js',import.meta.url),'utf8'),
  };
}

test('production service worker identity is derived deterministically from exact source SHA',()=>{
  assert.equal(productionServiceWorkerVersion(SHA_N1),'m26-prod-111111111111');
  assert.equal(productionServiceWorkerVersion(SHA_N),'m26-prod-222222222222');
  assert.notEqual(productionServiceWorkerVersion(SHA_N1),productionServiceWorkerVersion(SHA_N));
});

test('a runtime release change necessarily changes the registered canonical worker bytes',()=>{
  const {sw,wrapper}=sourceFixtures();
  const n1Version=productionServiceWorkerVersion(SHA_N1);
  const nVersion=productionServiceWorkerVersion(SHA_N);
  const n1Sw=stampServiceWorkerSource(sw,{version:n1Version,previousVersion:'m26-prod-000000000000'});
  const n1Wrapper=stampCanonicalWorkerWrapper(wrapper,{version:n1Version});
  const nSw=stampServiceWorkerSource(sw,{version:nVersion,previousVersion:n1Version});
  const nWrapper=stampCanonicalWorkerWrapper(wrapper,{version:nVersion});

  assert.notEqual(n1Wrapper,nWrapper,'registered /m26/iberfit-sw.js must change between releases');
  assert.notEqual(n1Sw,nSw,'imported /m26/sw.js must change between releases');
  assert.deepEqual(
    validateServiceWorkerReleaseIdentity({swSource:nSw,wrapperSource:nWrapper,expectedVersion:nVersion}),
    {version:nVersion,previousVersion:n1Version},
  );
});

test('release validation fails closed when runtime advances but canonical worker identity stays stale',()=>{
  const {sw,wrapper}=sourceFixtures();
  const n1Version=productionServiceWorkerVersion(SHA_N1);
  const nVersion=productionServiceWorkerVersion(SHA_N);
  const nSw=stampServiceWorkerSource(sw,{version:nVersion,previousVersion:n1Version});
  const staleWrapper=stampCanonicalWorkerWrapper(wrapper,{version:n1Version});

  assert.throws(
    ()=>validateServiceWorkerReleaseIdentity({swSource:nSw,wrapperSource:staleWrapper,expectedVersion:nVersion}),
    /SERVICE_WORKER_WRAPPER_VERSION_MISMATCH/,
  );
});

test('release stamping rejects collapsed current/previous cache identity',()=>{
  const {sw}=sourceFixtures();
  const version=productionServiceWorkerVersion(SHA_N);

  assert.throws(
    ()=>stampServiceWorkerSource(sw,{version,previousVersion:version}),
    /SERVICE_WORKER_LINEAGE_COLLAPSED/,
  );
});
