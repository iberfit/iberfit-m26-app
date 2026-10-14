import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('M43 real Coach WebAuthn checks the actual workspace, not visibility of collapsed Más item',()=>{
  const spec=read('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
  assert.match(spec,/\[data-m26-area="\$\{area\}"\]\[aria-current="page"\]/u);
  assert.match(spec,/\.toHaveCount\(1,\{timeout:12_000\}\)/u);
  assert.match(spec,/getByRole\('main',\{name:area==='sesion'\?'Sesiones':'Planificación'\}\)/u);
  assert.match(spec,/\[data-m26-guided-tour\]/u);
  assert.match(spec,/mobile-320/u);
  assert.match(spec,/m43CoachWorkspaceCertified/u);
  assert.doesNotMatch(spec,/\[data-m26-area="\$\{area\}"\]\[aria-current="page"\]:visible/u);
});

test('M43 Coach first-use guide defers to an explicit area and preserves manual access',()=>{
  const tour=read('src/m26/onboarding/guided-tour.js');
  assert.match(tour,/tourOriginArea=activeArea\(\)\|\|contextValue\.tour\.home/u);
  assert.match(tour,/if\(tourOriginArea&&area!==tourOriginArea\)/u);
  assert.match(tour,/if\(!suppressed&&area===contextValue\.tour\.home&&shouldAutoOpenGuidedOnboarding\(state\)\)/u);
  assert.match(tour,/if\(event\.target\?\.closest\?\.\('\[data-m26-area\]'\)\)/u);
});

test('M43 Canary smoke only retries bounded static Cloudflare errors, never suppresses integrity/identity errors',()=>{
  const smoke=read('scripts/prelaunch/check_live_canary_gate.mjs');
  assert.match(smoke,/MAX_CANARY_EDGE_ATTEMPTS/u);
  assert.match(smoke,/isRetryableCanaryStaticFailure/u);
  assert.match(smoke,/PRELAUNCH_CANARY_EDGE_5XX_PERSISTENT/u);
  assert.match(smoke,/certifyViewport\(browser,\{name:'desktop'/u);
  assert.match(smoke,/certifyViewport\(browser,\{name:'mobile'/u);
  for(const invariant of ['PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH','PRELAUNCH_LIVE_PROJECT_REF_MISMATCH',
    'PRELAUNCH_LIVE_UNEXPECTED_MUTATION_REQUEST','PRELAUNCH_LIVE_PAGE_ERROR','PRELAUNCH_LIVE_CONSOLE_ERROR'])
    assert.ok(smoke.includes(invariant),invariant+' must remain fail-closed');
});
