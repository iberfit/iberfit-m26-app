import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderAccessUi} from '../src/m26/app/access-ui.js';
import {
  sessionFailureRequiresFreshLogin,
  __applicationInternals,
} from '../src/m26/app/application.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('resume refreshes a persisted session before privileged assurance checks',()=>{
  const app=read('src/m26/app/application.js');
  const start=app.indexOf('async function continueAfterFirstFactor()');
  const end=app.indexOf('async function continueMfaWithWebAuthn()',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  const refreshIndex=block.indexOf('await refreshSessionIfNeeded()');
  const assuranceIndex=block.indexOf('transport.authAssuranceContext(session.token)');
  assert.ok(refreshIndex>=0);
  assert.ok(assuranceIndex>refreshIndex);
});

test('only invalid identity/session failures force a fresh login',()=>{
  assert.equal(sessionFailureRequiresFreshLogin(Object.assign(new Error('expired'),{status:401})),true);
  assert.equal(sessionFailureRequiresFreshLogin(new Error('M26_SESSION_EXPIRED')),true);
  assert.equal(sessionFailureRequiresFreshLogin(new Error('M26_REFRESH_IDENTITY_MISMATCH')),true);
  assert.equal(sessionFailureRequiresFreshLogin(Object.assign(new Error('forbidden'),{status:403})),false);
  assert.equal(sessionFailureRequiresFreshLogin(new Error('M26_TIMEOUT')),false);
  assert.equal(sessionFailureRequiresFreshLogin(new Error('Failed to fetch')),false);
});

test('retryable failures keep a password-free resume action while preserving normal login',()=>{
  const html=renderAccessUi({
    backendReady:true,
    qaOnly:false,
    host:'app.iberfit.cl',
    sessionRetryAvailable:true,
    message:'No fue posible conectar.',
    noticeKind:'error',
  });
  assert.match(html,/Tu sesión sigue guardada/u);
  assert.match(html,/data-auth-action="retry-session"/u);
  assert.match(html,/Reintentar acceso/u);
  assert.match(html,/data-auth-form="login"/u);
  assert.match(html,/autocomplete="current-password"/u);
});

test('login feedback distinguishes credentials from transient access failures',()=>{
  assert.equal(
    __applicationInternals.loginFailureMessage(new Error('M26_AUTH_EMAIL_INVALID')),
    'Revisa el correo de acceso.',
  );
  assert.equal(
    __applicationInternals.loginFailureMessage(Object.assign(new Error('invalid login credentials'),{status:400})),
    'El correo o la contraseña no coinciden.',
  );
  assert.match(
    __applicationInternals.loginFailureMessage(new Error('M26_TIMEOUT')),
    /Comprueba tu conexión/u,
  );
});

test('authenticated startup prioritizes a visible secure workspace before catalog loading',()=>{
  const app=read('src/m26/app/application.js');
  const start=app.indexOf('async function setupAuthenticated()');
  const end=app.indexOf('\n  function guardSessionNavigation',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  const hydrate=block.indexOf("const hydrationResult=await hydrate({reason:'login'})");
  const shell=block.indexOf('shell.mount({progressive:true})');
  const paint=block.indexOf('await yieldWorkspacePaint()');
  const catalog=block.indexOf('()=>fetchCatalog()');
  assert.ok(hydrate>=0);
  assert.ok(shell>hydrate);
  assert.ok(paint>shell);
  assert.ok(catalog>paint);
  assert.match(block,/withAuthOperationTimeout\(\s*\(\)=>fetchCatalog\(\),\s*\{timeoutMs:AUTH_CATALOG_TIMEOUT_MS,code:'M26_AUTH_CATALOG_TIMEOUT'\},\s*\)/u);
  assert.doesNotMatch(block,/const \[hydrationResult\]=await Promise\.all\(\[/u);
});

test('settings expose account identity and safe password recovery without hiding logout',()=>{
  const shellVm=read('src/m26/shell/shell-view-model.js');
  const routeVm=read('src/m26/modules/route-view-model.js');
  const route=read('src/m26/modules/route-render.js');
  const controller=read('src/m26/shell/shell-controller.js');
  const audit=read('src/m26/ui/interactive-audit.js');

  assert.match(shellVm,/email:\s*state\.identity\.email \|\| ''/u);
  assert.match(routeVm,/email:String\(shellVm\.identity\?\.email\|\|state\?\.identity\?\.email\|\|''\)/u);
  assert.match(route,/Correo de acceso/u);
  assert.match(route,/data-m26-action="account-password-recovery"/u);
  assert.match(route,/data-m26-action="logout"/u);
  assert.match(controller,/m26:account-password-recovery/u);
  assert.match(audit,/'account-password-recovery':\{roles:\['admin','coach','client'\],domain:'account'\}/u);
});

test('admin user update surface is compact and preserves the current status selection',()=>{
  const admin=read('src/m26/admin/route-render.js');
  assert.match(admin,/class="m26-admin-user-management"/u);
  assert.match(admin,/>Actualizar usuario<\/summary>/u);
  assert.match(admin,/currentStatus==='active'\?' selected':''/u);
  assert.match(admin,/currentStatus==='suspended'\?' selected':''/u);
  assert.match(admin,/currentStatus==='inactive'\?' selected':''/u);
  assert.match(admin,/form\(\s*'user-status'/u);
  assert.match(admin,/form\(\s*'role-change'/u);
  assert.match(admin,/data-admin-form="\$\{kind\}"/u);
});
