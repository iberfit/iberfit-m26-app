import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC75 elimina el bucle de hidratación DOM que podía bloquear la selección de cliente',()=>{
  const productivity=read('src/m26/productivity/coach-productivity.js');
  assert.doesNotMatch(productivity,/MutationObserver/u);
  assert.match(productivity,/store\.subscribe\(queueHydrate\)/u);
  assert.match(productivity,/m26:shell-rendered/u);
  assert.match(productivity,/setHtmlIfChanged/u);
});

test('RC75 centraliza la selección y evita trabajo si el cliente ya está activo',()=>{
  const shell=read('src/m26/shell/shell-controller.js');
  assert.match(shell,/function switchClient/u);
  assert.match(shell,/sameClient/u);
  assert.match(shell,/m26ClientSwitching/u);
  assert.match(shell,/m26:shell-rendered/u);
  assert.match(shell,/enhanceNativeWorkspace/u);
});

test('RC75 mantiene búsqueda y Ajustes como superficies nativas accesibles',()=>{
  const native=read('src/m26/ui/native-workspace.js');
  assert.match(native,/m26-coach-command-dialog/u);
  assert.match(native,/m26-settings-popover/u);
  assert.match(native,/clip-path:inset\(50%\)/u);
  assert.match(native,/data-m26-settings-session/u);
  assert.match(native,/Busca un cliente, sección o acción/u);
});

test('RC75 mantiene alta guiada y la evolución ADMIN exige invitación real sin fingir activación',()=>{
  const native=read('src/m26/ui/native-workspace.js');
  const admin=read('src/m26/admin/controller.js');
  const render=read('src/m26/admin/route-render.js');
  const transport=read('src/m26/admin/transport.js');
  assert.match(native,/data-admin-intake-open/u);
  assert.match(native,/Nueva alta, sin perder información/u);
  assert.match(native,/Guardar datos iniciales/u);
  assert.match(admin,/ADMIN_LEAD_CREAR/u);
  assert.match(admin,/ADMIN_CLIENTE_CREAR/u);
  assert.match(render,/Crear cliente y enviar invitación/u);
  assert.match(transport,/iberfit-admin-client-invite-v1/u);
  assert.doesNotMatch(admin,/activatedAt\s*:/u);
  assert.doesNotMatch(admin,/status\s*:\s*['\"]activo['\"]/u);
});

test('RC75 mantiene fail-closed en el backend canónico V12 sin bloquear producción',()=>{
  const transport=read('src/m26/supabase-transport.js');
  const native=read('src/m26/ui/native-workspace.js');
  assert.doesNotMatch(transport,/M26_CLIENT_CREATE_CANARY_ONLY/u);
  assert.match(transport,/iberfit_client_onboarding_preflight_v12/u);
  assert.match(transport,/iberfit_create_client_draft_v12/u);
  assert.match(transport,/M26_CLIENT_ONBOARDING_BACKEND_REQUIRED/u);
  assert.match(transport,/M26_CLIENT_ONBOARDING_BACKEND_NOT_READY/u);
  assert.match(transport,/M26_CLIENT_CREATE_INVALID_RESPONSE/u);
  assert.doesNotMatch(native,/service_role|service-role|SUPABASE_SERVICE/iu);
});
