import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\\r\\n/g,'\\n');

test('Signature UX V2 is loaded after adaptive layout and cached by the PWA',()=>{
  const app=read('public/m26/app.js');
  const sw=read('public/m26/sw.js');
  const adaptive=app.indexOf("ensureAdaptiveLayoutStyle();");
  const signature=app.indexOf("ensureSignatureUxV2Style();");
  const activation=app.indexOf("await activateFullStyles();");
  assert.ok(adaptive>=0&&signature>adaptive&&activation>signature,'signature layer must be registered after adaptive layout and before activation');
  assert.match(app,/href='\\/src\\/m26\\/design\\/signature-ux-v2\\.css'/u);
  assert.match(sw,/"\\/src\\/m26\\/design\\/signature-ux-v2\\.css"/u);
});

test('Signature UX V2 improves all roles and device classes without hiding product capabilities',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  for(const role of ['client','coach','admin']){
    assert.ok(css.includes('data-m26-role="'+role+'"'),'missing role refinement for '+role);
  }
  assert.match(css,/@media \\(max-width:1100px\\)/u);
  assert.match(css,/@media \\(max-width:900px\\)/u);
  assert.match(css,/@media \\(max-width:580px\\)/u);
  assert.match(css,/@media \\(max-width:390px\\)/u);
  assert.match(css,/@media \\(max-height:640px\\) and \\(orientation:landscape\\)/u);
  assert.match(css,/@media \\(min-width:1600px\\)/u);
  assert.match(css,/@media \\(pointer:coarse\\)/u);
  assert.match(css,/@media \\(prefers-reduced-motion:reduce\\)/u);
  assert.match(css,/@media \\(prefers-contrast:more\\)/u);
  assert.doesNotMatch(css,/display\\s*:\\s*none|visibility\\s*:\\s*hidden|pointer-events\\s*:\\s*none/iu,'presentation layer must not remove or disable capabilities');
});

test('global polish covers navigation content forms cards tables and training surfaces',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  for(const selector of [
    '.m26-sidebar','.m26-nav-item','.m26-topbar','.m26-main','.m26-route',
    '.m26-panel','.m26-client-card','.m26-library-card','.m26-rc39-session-card',
    '.m26-stat','.m26-admin-table','.m26-profile-hero-premium','.m26-mobile-nav',
    '.m26-auth-page','.m26-auth-card'
  ]){
    assert.ok(css.includes(selector),'missing Signature UX coverage: '+selector);
  }
});

test('access surface gives mobile keyboards explicit next actions in dynamic and first-paint markup',()=>{
  const dynamic=read('src/m26/app/access-ui.js');
  const firstPaint=read('public/m26/index.html');
  assert.match(dynamic,/autocomplete="username"[\\s\\S]{0,100}enterkeyhint="next"/u);
  assert.match(dynamic,/id="m26-login-password"[\\s\\S]{0,150}enterkeyhint="go"/u);
  assert.match(dynamic,/data-auth-form="request-recovery" aria-label="Recuperar acceso a IBERFIT"/u);
  assert.match(dynamic,/autocomplete="email"[\\s\\S]{0,100}enterkeyhint="send"/u);
  assert.match(dynamic,/name="passwordConfirmation"[\\s\\S]{0,150}enterkeyhint="done"/u);
  assert.match(firstPaint,/data-auth-form="login" aria-label="Acceso a IBERFIT"/u);
  assert.match(firstPaint,/autocomplete="username"[\\s\\S]{0,100}enterkeyhint="next"/u);
  assert.match(firstPaint,/id="m26-login-password"[\\s\\S]{0,150}enterkeyhint="go"/u);
});

test('touch ergonomics keep comfortable targets and iOS-safe field sizing',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  assert.match(css,/@media \\(pointer:coarse\\)[\\s\\S]*min-height:max\\(48px/u);
  assert.match(css,/@media \\(max-width:580px\\)[\\s\\S]*font-size:16px/u);
  assert.match(css,/\\.m26-auth-card :is\\(button,input\\)[\\s\\S]*min-height:54px/u);
});
