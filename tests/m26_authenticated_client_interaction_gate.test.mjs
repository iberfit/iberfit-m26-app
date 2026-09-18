import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const workflow=read('.github/workflows/authenticated-client-interaction.yml');
const config=read('playwright.authenticated-interaction.config.mjs');
const spec=read('qa/rc64/authenticated-interaction.spec.mjs');
const networkPolicy=read('qa/rc64/secure-current-source-auth.mjs');
const currentSurfaceBuilder=read('qa/rc64/build-current-surface.mjs');
const shellController=read('src/m26/shell/shell-controller.js');
const icons=read('src/m26/design/icons.css');

test('authenticated interaction gate stays QA-only and public-key-only',()=>{
  assert.ok(workflow.includes('environment: m26-canary-readonly'));
  assert.ok(workflow.includes('M26_PROJECT_REF: gjztkdwfmunnzhtvxrsu'));
  assert.ok(workflow.includes("M26_QA_ONLY: 'true'"));
  assert.ok(!workflow.includes('SERVICE_ROLE'),'workflow must never receive a service-role secret');
  assert.ok(spec.includes('service[_-]?role'),'spec must reject service-role keys');
});

test('authenticated interaction network policy remains fail-closed for mutations',()=>{
  assert.ok(spec.includes('installCurrentSourceQaNetworkPolicy(context'),'spec must install the shared current-source QA policy');
  assert.ok(networkPolicy.includes("context.route('**/*'"),'shared policy must intercept all browser requests');
  assert.ok(spec.includes('READ_ONLY_RPCS'),'read-only RPC allow-list missing');
  assert.ok(networkPolicy.includes("route.abort('blockedbyclient')"),'unexpected network requests must be blocked');
  assert.ok(networkPolicy.includes('url.origin!==SUPABASE_ORIGIN'),'foreign origins must fail closed');
  assert.ok(networkPolicy.includes("method==='POST'&&url.pathname.startsWith(prefix)&&readOnlyRpcs.has"),'RPC access must require the explicit read-only allow-list');
  assert.ok(!networkPolicy.includes('WEBAUTHN_PATH'),'shared read-only policy must not authorize privileged WebAuthn mutations');
  assert.ok(spec.includes('Authenticated interaction attempted a business mutation or foreign request'));
  assert.ok(!spec.includes('data-engagement-action="submit-checkin"'),'test must not target submit action');
  assert.ok(!spec.includes('data-engagement-action="save-checkin-draft"'),'test must not target draft-save action');
});

test('authenticated current-source surface preserves public-root asset paths',()=>{
  assert.ok(
    currentSurfaceBuilder.includes("['public/isotipo-iberfit.png','isotipo-iberfit.png']"),
    'root public asset must be copied to the synthetic hosting root'
  );
  assert.ok(
    !currentSurfaceBuilder.includes("['public/isotipo-iberfit.png','public/isotipo-iberfit.png']"),
    'synthetic surface must not add a public/ URL segment that production hosting does not expose'
  );
});

test('authenticated interaction covers desktop tablet landscape and mobile touch',()=>{
  for(const project of [
    'auth-interaction-desktop-chromium',
    'auth-interaction-tablet-chromium',
    'auth-interaction-tablet-768-landscape-chromium',
    'auth-interaction-tablet-landscape-chromium',
    'auth-interaction-mobile-chromium',
  ])assert.ok(config.includes(`name:'${project}'`),`missing ${project}`);
  assert.ok(spec.includes("openArea(page,'actividad')"),'activity route coverage missing');
  assert.ok(spec.includes("openArea(page,'ajustes')"),'settings route coverage missing');
  assert.ok(spec.includes('data-engagement-form="checkin"'),'check-in form coverage missing');
  assert.ok(spec.includes('data-m26-ui-language'),'language select coverage missing');
  assert.ok(spec.includes('data-m26-ui-locale'),'locale select coverage missing');
  assert.ok(spec.includes('m26-client-bottom-nav-more'),'mobile More coverage missing');
  assert.ok(spec.includes('expectViewportHittable'),'settings viewport/hit-testing coverage missing');
  assert.ok(config.includes("viewport:{width:1024,height:768}"),'1024x768 regression viewport missing');
});

test('authenticated interaction runs on code and design families that can steal focus block hits or rerender the shell',()=>{
  for(const path of ['src/m26/app/**','src/m26/design/**','src/m26/modules/route-render.js','src/m26/shell/**','src/m26/ui/**']){
    assert.equal(workflow.split(path).length-1,2,`${path} must trigger on pull_request and push`);
  }
});

test('Client More cannot survive route navigation and settings geometry stays viewport-authoritative',()=>{
  assert.ok(shellController.includes("details.m26-client-bottom-nav-more"),'Client More route dismissal missing');
  assert.ok(shellController.includes("clientBottomMore.open=false"),'Client More must close before navigation');
  assert.ok(shellController.includes("clientBottomMore.removeAttribute?.('open')"),'Client More open attribute must be cleared');
  assert.ok(icons.includes('position:fixed!important'),'settings popover fixed geometry must override later visual skins');
  assert.ok(icons.includes('box-sizing:border-box'),'settings popover max-height must include padding and border');
});
