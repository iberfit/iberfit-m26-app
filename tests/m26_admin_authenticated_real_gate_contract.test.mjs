import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const spec=fs.readFileSync('qa/admin-authenticated-real/admin-authenticated-real.spec.mjs','utf8');
const config=fs.readFileSync('playwright.admin-authenticated-real.config.mjs','utf8');

test('real Admin QA gate is pinned to QA current candidate and canonical Canary origin',()=>{
  assert.match(spec,/candidate:'05ade2e27fcad28feb0fe9b41bf185a37480b73a'/u);
  assert.match(spec,/const CANARY_ORIGIN='https:\/\/m26-canary\.iberfit\.cl'/u);
  assert.match(spec,/const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(spec,/https:\/\/\$\{QA_PROJECT_REF\}\.supabase\.co/u);
  assert.doesNotMatch(spec,/pjhmrhejsoofmouedavw/u);
  assert.doesNotMatch(spec,/https:\/\/app\.iberfit\.cl/u);
  assert.doesNotMatch(spec,/https:\/\/coach\.iberfit\.cl/u);
});

test('real Admin QA gate only permits read-only RPCs plus WebAuthn',()=>{
  assert.match(spec,/const READ_ONLY_RPCS=new Set\(\[/u);
  assert.match(spec,/iberfit_admin_bootstrap_v14/u);
  assert.match(spec,/url\.pathname==='\/functions\/v1\/iberfit-webauthn-v1'/u);
  assert.doesNotMatch(spec,/iberfit_admin_execute_v14/u);
  assert.doesNotMatch(spec,/iberfit_execute_command_v26/u);
  assert.doesNotMatch(spec,/iberfit-admin-client-invite-v1/u);
  assert.match(spec,/businessMutationsPerformed:false/u);
  assert.match(spec,/authMutationPerformed:true/u);
});

test('real Admin QA current-source resolver mirrors root then public fallback safely',()=>{
  assert.match(spec,/BUILD_ROOT=path\.resolve\('\.tmp\/rc64-current-surface'\)/u);
  assert.match(spec,/PUBLIC_BUILD_ROOT=path\.join\(BUILD_ROOT,'public'\)/u);
  assert.match(spec,/for\(const base of \[BUILD_ROOT,PUBLIC_BUILD_ROOT\]\)/u);
  assert.match(spec,/candidate===base\|\|candidate\.startsWith\(base\+path\.sep\)/u);
  assert.match(spec,/url\.origin===CANARY_ORIGIN/u);
  assert.match(spec,/serviceWorkers:'block'/u);
  assert.match(spec,/not\.toMatch\(\/service\[_-\]\?role\/iu\)/u);
});

test('real Admin QA gate requires native WebAuthn and covers three device classes',()=>{
  assert.match(spec,/WebAuthn\.addVirtualAuthenticator/u);
  assert.match(spec,/transport:'internal'/u);
  assert.match(spec,/hasUserVerification:true/u);
  assert.match(spec,/isUserVerified:true/u);
  assert.match(spec,/\{name:'desktop',width:1440,height:1000/u);
  assert.match(spec,/\{name:'tablet',width:1024,height:1366/u);
  assert.match(spec,/\{name:'mobile',width:390,height:844/u);
  assert.match(config,/browserName:'chromium'/u);
});

test('real Admin QA gate verifies controls without submitting business forms',()=>{
  assert.match(spec,/\[data-admin-form="client-create"\]/u);
  assert.match(spec,/\.fill\(/u);
  assert.match(spec,/selectOption\(/u);
  assert.match(spec,/toBeFocused\(\)/u);
  assert.doesNotMatch(spec,/button\[type="submit"\].*click/iu);
  assert.doesNotMatch(spec,/\.press\(['"]Enter['"]\)/u);
});

test('real Admin QA gate requires explicit authorized app choice before entering Admin',()=>{
  assert.match(spec,/\.m26-role-choice\[role="dialog"\]\[aria-modal="true"\]/u);
  assert.match(spec,/\[data-m26-switch-role="client"\]/u);
  assert.match(spec,/\[data-m26-switch-role="admin"\]/u);
  assert.match(spec,/Unauthorized Coach app must not be offered/u);
  assert.match(spec,/Primary Client app remains inert until an app is chosen/u);
  assert.match(spec,/evidence\.appChoice=\{shown:true,authorized:\['client','admin'\],selected:'admin'\}/u);
});

test('real Admin QA gate verifies mobile More settings hit targets scroll and overflow',()=>{
  assert.match(spec,/details\.m26-mobile-more:visible/u);
  assert.match(spec,/document\.elementFromPoint/u);
  assert.match(spec,/Admin More trigger must be inside viewport/u);
  assert.match(spec,/Admin More target must receive pointer/u);
  assert.match(spec,/aria-expanded','true'/u);
  assert.match(spec,/settings target receives pointer/u);
  assert.match(spec,/no horizontal overflow/u);
  assert.match(spec,/window\.scrollTo/u);
  assert.match(spec,/\[data-m26-guided-tour-close\]/u);
});
