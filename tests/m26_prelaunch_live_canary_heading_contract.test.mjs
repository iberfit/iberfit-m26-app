import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const gatePath=new URL('../scripts/prelaunch/check_live_canary_gate.mjs',import.meta.url);
const shellPath=new URL('../public/m26/index.html',import.meta.url);
const visionPath=new URL('../src/m26/design/brand-vision.css',import.meta.url);

const [gate,shell,vision]=await Promise.all([
  readFile(gatePath,'utf8'),
  readFile(shellPath,'utf8'),
  readFile(visionPath,'utf8'),
]);

test('live Canary gate follows state-first auth presentation without weakening fail-closed safety',()=>{
  assert.match(shell,/<p class="m26-auth-intro-kicker">Entrenamiento personal con criterio<\/p>/u);
  assert.match(shell,/<h2>Todo tu proceso de entrenamiento, en un solo lugar\.<\/h2>/u);

  assert.match(vision,/\.m26-auth-page\[data-auth-mode='login'\] \.m26-auth-intro,/u);
  assert.match(vision,/\.m26-auth-page\[data-auth-mode='checking-session'\] \.m26-auth-intro,/u);
  assert.match(vision,/\.m26-auth-page\[data-auth-mode='recoverable-session'\] \.m26-auth-intro\{display:none!important\}/u);

  assert.match(gate,/\.m26-auth-intro-kicker/u);
  assert.match(gate,/kicker\.count\(\)===1/u);
  assert.match(gate,/kicker\.textContent\(\)/u);
  assert.doesNotMatch(gate,/kicker\.isVisible\(\)/u);
  assert.match(gate,/PRELAUNCH_LIVE_KICKER_MISSING/u);
  assert.match(gate,/PRELAUNCH_LIVE_KICKER_COPY_MISMATCH/u);
  assert.match(gate,/Entrenamiento personal con criterio/u);

  assert.match(gate,/\.m26-auth-intro h2/u);
  assert.match(gate,/heading\.count\(\)===1/u);
  assert.match(gate,/heading\.textContent\(\)/u);
  assert.doesNotMatch(gate,/heading\.isVisible\(\)/u);
  assert.match(gate,/PRELAUNCH_LIVE_HEADING_MISSING/u);
  assert.match(gate,/PRELAUNCH_LIVE_HEADING_COPY_MISMATCH/u);
  assert.match(gate,/Todo tu proceso de entrenamiento, en un solo lugar\./u);

  assert.match(gate,/login\.isVisible\(\)/u);
  assert.match(gate,/enter\.isVisible\(\)/u);
  assert.match(gate,/enter\.isEnabled\(\)/u);
  assert.match(gate,/!\['GET','HEAD','OPTIONS'\]\.includes\(method\)/u);
  assert.match(gate,/PRELAUNCH_LIVE_UNEXPECTED_MUTATION_REQUEST/u);
  assert.match(gate,/PRELAUNCH_LIVE_FORBIDDEN_SUPABASE_ORIGIN/u);
  assert.match(gate,/PRELAUNCH_LIVE_RUNTIME_NOT_QA/u);
  assert.match(gate,/PRELAUNCH_LIVE_PROJECT_REF_MISMATCH/u);
  assert.match(gate,/PRELAUNCH_LIVE_QA_ORIGIN_MISMATCH/u);
  assert.match(gate,/PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH/u);
  assert.match(gate,/productionTouched:false/u);
  assert.match(gate,/mutationsPerformed:false/u);
});
