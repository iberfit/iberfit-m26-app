import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B login boundary performs no initial verification recovery wearable telemetry or connectivity IO',()=>{
  const app=read('src/m26/app/application.js');
  const start=app.indexOf('async function setupAuthenticated()');
  const end=app.indexOf('\n  function guardSessionNavigation',start);
  assert.ok(start>=0&&end>start);
  const setup=app.slice(start,end);

  assert.match(setup,/rc64-setup-ready/u);
  assert.match(setup,/rc64-post-login-local-reconciliation-start/u);
  assert.match(setup,/rc64-post-login-local-services-armed/u);

  assert.doesNotMatch(setup,/void refreshVerificationState/u);
  assert.doesNotMatch(setup,/void restoreExecution/u);
  assert.doesNotMatch(setup,/wearables\.mount\(\);/u);
  assert.doesNotMatch(setup,/connectivityStop=sync\.start\(\);/u);
  assert.doesNotMatch(setup,/telemetrySyncStop=telemetryRemoteSync\.start\(\);/u);
  assert.doesNotMatch(setup,/rc64-post-login-verification-ready/u);
  assert.doesNotMatch(setup,/rc64-post-login-recovery-ready/u);

  assert.match(setup,/wearables\.mount\(\{syncInitial:false\}\)/u);
  assert.match(setup,/connectivityStop=sync\.start\(\{emitInitial:false\}\)/u);
  assert.match(setup,/telemetrySyncStop=telemetryRemoteSync\.start\(\{flushInitial:false\}\)/u);

  const refreshMatches=setup.match(/refreshVerificationState/g)||[];
  assert.equal(refreshMatches.length,1);
  assert.match(
    setup,
    /onResult:async\(\)=>\{\s*await refreshVerificationState\(\{repository:operationRepository,store\}\);\s*render\(\);\s*\},/u,
  );
});

test('RC64.2B zero-operation UI is conservative and manual verification remains reachable',()=>{
  const shell=read('src/m26/shell/shell-render.js');
  const route=read('src/m26/modules/route-render.js');
  const conflict=read('src/m26/engagement/conflict-center.js');
  const audit=read('src/m26/ui/interactive-audit.js');

  assert.doesNotMatch(shell,/Sin operaciones pendientes/u);
  assert.match(shell,/Sin cambios locales pendientes/u);
  assert.doesNotMatch(shell,/Todo sincronizado/u);

  assert.doesNotMatch(
    route,
    /emptyState\('Sin operaciones pendientes','No hay operaciones pendientes, conflictos ni rechazos locales\.'\)/u,
  );
  assert.match(route,/Estado local pendiente de revisión/u);
  assert.match(route,/Estado local no comprobado/u);
  assert.match(route,/data-verification-action="refresh"/u);

  assert.match(conflict,/action!=='refresh'&&!operationId/u);
  assert.match(
    conflict,
    /if\(action==='refresh'\)\{await refreshVerificationState\(\{repository,store\}\);return;\}/u,
  );
  assert.match(
    audit,
    /'refresh':\{roles:\['admin','coach','client'\],domain:'verification'\}/u,
  );
});

test('RC64.2B component defaults preserve explicit and future-event synchronization capabilities',()=>{
  const wearable=read('src/m26/wearables/controller.js');
  const telemetry=read('src/m26/telemetry/remote-sync.js');
  const pwa=read('src/m26/platform/pwa.js');

  assert.match(wearable,/globalThis\.addEventListener\?\.\(\s*'online',\s*onOnline/u);
  assert.match(wearable,/async function syncPending\(\)/u);
  assert.match(telemetry,/eventTarget\.addEventListener\('online',onOnline\)/u);
  assert.match(telemetry,/function notifyStaged\(\)/u);
  assert.match(pwa,/target\.addEventListener\?\.\('online',run\)/u);
});
