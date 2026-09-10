import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Signature UX V2 is loaded after adaptive layout and cached by the PWA',()=>{
  const app=read('public/m26/app.js');
  const sw=read('public/m26/sw.js');
  const adaptive=app.indexOf('ensureAdaptiveLayoutStyle();');
  const signature=app.indexOf('ensureSignatureUxV2Style();');
  const activation=app.indexOf('await activateFullStyles();');
  assert.ok(adaptive>=0&&signature>adaptive&&activation>signature,'signature layer must be registered after adaptive layout and before activation');
  assert.ok(app.includes("link.href='/src/m26/design/signature-ux-v2.css';"));
  assert.ok(sw.includes('"/src/m26/design/signature-ux-v2.css"'));
});

test('Signature UX V2 improves all roles and device classes without hiding product capabilities',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  for(const role of ['client','coach','admin']){
    assert.ok(css.includes('data-m26-role="'+role+'"'),'missing role refinement for '+role);
  }
  for(const query of [
    '@media (max-width:1100px)',
    '@media (max-width:900px)',
    '@media (max-width:580px)',
    '@media (max-width:390px)',
    '@media (max-height:640px) and (orientation:landscape)',
    '@media (min-width:1600px)',
    '@media (pointer:coarse)',
    '@media (prefers-reduced-motion:reduce)',
    '@media (prefers-contrast:more)'
  ]){
    assert.ok(css.includes(query),'missing responsive/accessibility query '+query);
  }
  const compact=css.replace(/\s+/g,'').toLowerCase();
  for(const forbidden of ['display:none','visibility:hidden','pointer-events:none']){
    assert.equal(compact.includes(forbidden),false,'presentation layer must not remove or disable capabilities: '+forbidden);
  }
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

function ordered(source,...parts){
  let cursor=-1;
  for(const part of parts){
    const next=source.indexOf(part,cursor+1);
    assert.ok(next>cursor,'missing or out-of-order fragment: '+part);
    cursor=next;
  }
}

test('access surface gives mobile keyboards explicit next actions in dynamic and first-paint markup',()=>{
  const dynamic=read('src/m26/app/access-ui.js');
  const firstPaint=read('public/m26/index.html');
  ordered(dynamic,'autocomplete="username"','inputmode="email"','enterkeyhint="next"','autocorrect="off"');
  ordered(dynamic,'id="m26-login-password"','autocomplete="current-password"','enterkeyhint="go"');
  assert.ok(dynamic.includes('data-auth-form="request-recovery" aria-label="Recuperar acceso a IBERFIT"'));
  ordered(dynamic,'autocomplete="email"','inputmode="email"','enterkeyhint="send"','autocorrect="off"');
  ordered(dynamic,'name="passwordConfirmation"','autocomplete="new-password"','enterkeyhint="done"');
  assert.ok(firstPaint.includes('data-auth-form="login" aria-label="Acceso a IBERFIT"'));
  ordered(firstPaint,'autocomplete="username"','inputmode="email"','enterkeyhint="next"','autocorrect="off"');
  ordered(firstPaint,'id="m26-login-password"','autocomplete="current-password"','enterkeyhint="go"');
});

test('touch ergonomics keep comfortable targets and iOS-safe field sizing',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const coarse=css.slice(css.indexOf('@media (pointer:coarse)'));
  const mobile=css.slice(css.indexOf('@media (max-width:580px)'));
  assert.ok(coarse.includes('min-height:max(48px'));
  assert.ok(coarse.includes('.m26-auth-card :is(button,input)'));
  assert.ok(coarse.includes('min-height:54px'));
  assert.ok(mobile.includes('font-size:16px'));
});
