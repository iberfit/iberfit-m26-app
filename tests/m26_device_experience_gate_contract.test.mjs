import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');

const authenticated=read('playwright.authenticated.config.mjs');
const genie=read('playwright.client-guided-welcome.config.mjs');
const deviceConfig=read('playwright.device-experience.config.mjs');
const deviceSpec=read('qa/device-experience/device-experience.spec.mjs');
const roleGenieSpec=read('qa/device-experience/role-guided-onboarding.spec.mjs');
const roleGenieFixture=read('qa/rc64/role-guided-onboarding.fixture.mjs');
const visualCasesGenerator=read('qa/rc13_generate_visual_cases.mjs');
const visual=read('playwright.authenticated-visual.config.mjs');
const admin=read('playwright.admin-interaction.config.mjs');
const adminVisual=read('playwright.daily-admin-visual.config.mjs');
const pwa=read('playwright.p0-pwa-upgrade.config.mjs');
const workflow=read('.github/workflows/device-experience-gate.yml');
const coachWebAuthnWorkflow=read('.github/workflows/coach-webauthn-recurring.yml');
const coachWebAuthnSpec=read('qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs');
const coachWebAuthnBroker=read('supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts');
const policy=read('docs/DEVICE_EXPERIENCE_POLICY.md');

test('Device Experience policy defines task semantics and records recurrent Coach WebAuthn evidence',()=>{
  assert.match(policy,/Desktop = analizar y construir/u);
  assert.match(policy,/Tablet = entrenar y operar/u);
  assert.match(policy,/Móvil = actuar y completar/u);
  assert.match(policy,/Coach post-WebAuthn recurrente = GREEN/u);
  assert.match(policy,/35547888935/u);
  assert.match(policy,/b079361169a22e9f019a5df02feabf0118f89f35/u);
  assert.match(policy,/Admin autenticado real quedó certificado puntualmente/u);
  assert.match(policy,/No declarar cobertura recurrente Admin autenticada GREEN/u);
});

test('Device gate cancels stale runs only within the same PR or ref',()=>{
  assert.ok(workflow.includes('group: iberfit-device-experience-${{ github.event.pull_request.number || github.ref }}'));
  assert.ok(workflow.includes('cancel-in-progress: true'));
  assert.ok(workflow.includes('group: iberfit-qa-shared-auth-readonly'));
  assert.ok(workflow.includes('queue: max'));
  assert.match(workflow,/client-real-coach-webauthn-matrix[\s\S]*?group: iberfit-qa-shared-auth-readonly[\s\S]*?cancel-in-progress: false/u);
});

test('Client authenticated matrix covers desktop tablet portrait landscape and mobile',()=>{
  for(const token of [
    'authenticated-readonly-chromium',
    'authenticated-readonly-tablet-chromium',
    'authenticated-readonly-tablet-landscape-chromium',
    'authenticated-readonly-mobile-chromium',
    'width:1440,height:1000',
    'width:1024,height:1366',
    'width:1366,height:1024',
    'width:390,height:844',
  ])assert.ok(authenticated.includes(token),`missing authenticated matrix token: ${token}`);
});

test('Client Genie journey is a permanent four-device authenticated gate',()=>{
  for(const token of [
    'client-guided-welcome.spec.mjs',
    'client-genie-desktop-chromium',
    'client-genie-tablet-chromium',
    'client-genie-tablet-landscape-chromium',
    'client-genie-mobile-chromium',
    'width:1440,height:1000',
    'width:1024,height:1366',
    'width:1366,height:1024',
    'width:390,height:844',
  ])assert.ok(genie.includes(token),`missing Genie matrix token: ${token}`);
  assert.match(workflow,/Exercise Client Genie guided welcome by device/u);
  assert.match(workflow,/playwright\.client-guided-welcome\.config\.mjs/u);
});

test('Coach and Admin Genie journey reuses the permanent device matrix and current-source controller',()=>{
  assert.ok(deviceConfig.includes('role-guided-onboarding.spec.mjs'));
  assert.match(roleGenieSpec,/const ROLES=\['coach','admin'\]/u);
  assert.match(roleGenieSpec,/data-m26-guided-tour-genie/u);
  assert.match(roleGenieSpec,/data-m26-client-genie/u);
  assert.match(roleGenieSpec,/onboardingCompletedVersion/u);
  assert.match(roleGenieSpec,/data-progressive-onboarding-launcher/u);
  assert.match(roleGenieSpec,/reducedMotion:'reduce'|emulateMedia\(\{reducedMotion:'reduce'\}\)/u);
  assert.match(roleGenieSpec,/recovery\/device-experience\/role-genie-onboarding/u);
  assert.match(roleGenieFixture,/createGuidedTourController/u);
  assert.match(roleGenieFixture,/guidedOnboardingScopeKey/u);
  assert.match(roleGenieFixture,/guidedOnboardingTrack/u);
  assert.doesNotMatch(roleGenieFixture,/fetch\(|supabase|service_role|commandBus/iu);
});

test('Authenticated visual matrix mirrors all four primary device classes',()=>{
  for(const token of [
    'authenticated-visual-desktop-chromium',
    'authenticated-visual-tablet-chromium',
    'authenticated-visual-tablet-landscape-chromium',
    'authenticated-visual-mobile-chromium',
  ])assert.ok(visual.includes(token),`missing visual matrix token: ${token}`);
});

test('Admin interaction and visual evidence include tablet landscape explicitly',()=>{
  assert.match(admin,/admin-tablet-landscape-chromium/u);
  assert.match(admin,/width:1366,height:1024/u);
  assert.match(adminVisual,/admin-visual-tablet-landscape/u);
  assert.match(adminVisual,/width:1366,height:1024/u);
});

test('Installed PWA continuity keeps desktop tablet and mobile device classes',()=>{
  for(const token of [
    'p0-installed-pwa-desktop-chromium',
    'p0-installed-pwa-tablet-chromium',
    'p0-installed-pwa-mobile-chromium',
  ])assert.ok(pwa.includes(token),`missing PWA matrix token: ${token}`);
});

test('Recurring Coach WebAuthn gate is trusted Canary-only and proves registration plus assertion',()=>{
  assert.match(coachWebAuthnWorkflow,/push:[\s\S]*branches: \[canary\/rc74-4\]/u);
  assert.match(coachWebAuthnWorkflow,/id-token: write/u);
  assert.match(coachWebAuthnWorkflow,/OIDC_AUDIENCE: iberfit-webauthn-qa-cert/u);
  assert.match(coachWebAuthnWorkflow,/Reset Coach QA WebAuthn fixture/u);
  assert.match(coachWebAuthnWorkflow,/Cleanup Coach QA WebAuthn fixture[\s\S]*if: always\(\)/u);
  assert.match(coachWebAuthnWorkflow,/KNOWN_GAP_COACH_POST_WEBAUTHN=GREEN/u);
  assert.doesNotMatch(coachWebAuthnWorkflow,/SUPABASE_SERVICE_ROLE_KEY/u);
  for(const token of ['registration-options','registration-verify','authentication-options','authentication-verify','tablet-portrait','tablet-landscape','mobile']){
    assert.ok(coachWebAuthnSpec.includes(token),`missing recurrent Coach WebAuthn token: ${token}`);
  }
  assert.match(coachWebAuthnBroker,/TARGET_USER_ID="d381eb97-6c53-40e0-b0dc-916dd06bcd35"/u);
  assert.match(coachWebAuthnBroker,/TARGET_EMAIL="qa\.rc74\.coach@iberfit\.cl"/u);
  assert.match(coachWebAuthnBroker,/IBERFIT_QA_CERT_TARGET_ASSIGNMENTS_PRESENT/u);
  assert.doesNotMatch(coachWebAuthnBroker,/pjhmrhejsoofmouedavw/u);
});

test('Phase A gate is explicit about real and synthetic coverage',()=>{
  assert.match(workflow,/workflow-matrix/u);
  assert.match(workflow,/playwright\.device-experience\.config\.mjs/u);
  assert.match(workflow,/client-real-coach-webauthn-matrix/u);
  assert.match(workflow,/admin-synthetic-task-matrix/u);
  assert.match(workflow,/pwa-installed-device-matrix/u);
  assert.match(workflow,/device-experience-gate-phase-a/u);
  assert.match(workflow,/DEVICE_WORKFLOW_MATRIX_V1=GREEN/u);
  assert.match(workflow,/KNOWN_GAP_COACH_POST_WEBAUTHN=GREEN/u);
  assert.match(workflow,/COACH_POST_WEBAUTHN_RECURRING_GATE=GREEN/u);
  assert.doesNotMatch(workflow,/KNOWN_GAP_COACH_POST_WEBAUTHN=YELLOW/u);
  assert.match(workflow,/ADMIN_AUTHENTICATED_POINT_IN_TIME=GREEN/u);
  assert.match(workflow,/KNOWN_GAP_ADMIN_AUTHENTICATED_RECURRING=YELLOW/u);
  assert.doesNotMatch(workflow,/KNOWN_GAP_ADMIN_AUTHENTICATED=YELLOW/u);
});

test('Device workflow matrix covers current-source Client Coach and Admin tasks on all four surfaces',()=>{
  for(const token of [
    'client-hoy','client-progreso','client-session-live','client-feedback',
    'coach-hoy','coach-clientes','coach-expediente','coach-iri','coach-planificacion','coach-programar',
    'admin-users','admin-client-create',
  ])assert.ok(deviceSpec.includes(token),`missing task token: ${token}`);

  for(const token of [
    'device-desktop-chromium',
    'device-tablet-portrait-chromium',
    'device-tablet-landscape-chromium',
    'device-mobile-chromium',
    'width:1440,height:1000',
    'width:1024,height:1366',
    'width:1366,height:1024',
    'width:390,height:844',
  ])assert.ok(deviceConfig.includes(token),`missing device task matrix token: ${token}`);

  assert.match(deviceSpec,/CURRENT_SOURCE_STYLES/u);
  assert.match(deviceSpec,/\/src\/m26\/design\/tokens\.css/u);
  assert.match(deviceSpec,/\/src\/m26\/design\/primitives\.css/u);
  assert.match(deviceSpec,/horizontalOverflow/u);
  assert.match(deviceSpec,/assertFocusPath/u);
  assert.match(deviceSpec,/materiallySmall/u);
  assert.match(deviceSpec,/synthetic-post-assurance-ui/u);
  assert.match(deviceSpec,/synthetic-authorized-ui/u);
  assert.doesNotMatch(deviceSpec,/authCertified:true/u);
});

test('contextual help preserves the canonical touch target inside data-trust labels',()=>{
  const primitives=read('src/m26/design/primitives.css');
  assert.match(
    primitives,
    /\.m26-data-trust-label \.m26-guidance-trigger\{[\s\S]*?min-width:var\(--iberfit-size-touch-target\);[\s\S]*?min-height:var\(--iberfit-size-touch-target\);/u,
  );
});

test('Device IRI fixture uses current domain evidence and never revives the obsolete global score model',()=>{
  assert.match(visualCasesGenerator,/firstSessionCompletedAt/u);
  assert.match(visualCasesGenerator,/bodyComposition:\{weightKg:/u);
  assert.match(visualCasesGenerator,/strengthPatterns:\{/u);
  assert.match(visualCasesGenerator,/diagnosis:\{strengths:/u);
  assert.doesNotMatch(visualCasesGenerator,/score:72|score:67|Buen nivel funcional|Nivel funcional medio/u);
});
