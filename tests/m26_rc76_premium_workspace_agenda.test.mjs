import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const workspace=read('src/m26/ui/native-workspace-v4.js');
const shell=read('src/m26/shell/shell-controller.js');
const agenda=read('src/m26/agenda/fullcalendar-agenda.js');
const palette=read('src/m26/vendor/fullcalendar-7.0.2/monarch.iberfit.css');
const admin=read('src/m26/admin/route-render.js');
const transport=read('src/m26/supabase-transport.js');

test('RC76 activates the premium workspace without bypassing the RC75 safety layer',()=>{
  assert.match(shell,/native-workspace-v4\.js/);
  assert.match(workspace,/enhanceNativeWorkspace as enhanceV3/);
  assert.match(workspace,/m26-native-workspace-v4/);
  assert.match(workspace,/prefers-reduced-motion/);
  assert.doesNotMatch(workspace,/service_role|serviceRole/);
});

test('RC76 covers the ten usability surfaces with IBERFIT hierarchy',()=>{
  for(const marker of ['m26-native-daily-brief','m26-native-nav-divider','m26-client-avatar','m26-native-search-context','m26-settings-map','m26-admin-task-center','m26-admin-advanced','m26-route-agenda','data-native-busy']){
    assert.match(workspace,new RegExp(marker));
  }
  for(const label of ['Cuenta','Apariencia','Notificaciones','Entrenamiento','Seguridad','Datos','Ayuda','Añadir cliente','Asignar cliente']){
    assert.match(workspace,new RegExp(label));
  }
});

test('Agenda no vuelve a la paleta morada y refresca sin observer DOM recursivo',()=>{
  assert.match(agenda,/monarch\.iberfit\.css/);
  assert.doesNotMatch(agenda,/MutationObserver/);
  assert.match(agenda,/store\.subscribe\(scheduleRefresh\)/);
  assert.match(agenda,/m26:shell-rendered/);
  assert.match(agenda,/timeGridWeek,timeGridDay/);
  assert.match(agenda,/Semana/);
  assert.match(agenda,/Día/);
  assert.match(palette,/#123d31/i);
  assert.match(palette,/#b89553/i);
  assert.doesNotMatch(palette,/#6750A4/i);
});

test('Admin remains task-oriented but canonical PROD client creation stays fail-closed',()=>{
  assert.match(workspace,/ADMIN_LEAD_CREAR/);
  assert.match(workspace,/ADMIN_USER_CREATE/);
  assert.match(workspace,/ADMIN_ASSIGNMENT_CREATE/);
  assert.match(admin,/ADMIN_LEAD_CREAR/);
  assert.match(transport,/M26_CLIENT_CREATE_CANARY_ONLY/);
});
