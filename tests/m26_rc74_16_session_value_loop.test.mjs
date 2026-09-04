import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const appUrl=new URL('../public/m26/app.js',import.meta.url);
const swUrl=new URL('../public/m26/sw.js',import.meta.url);

async function sources(){
  const [app,sw]=await Promise.all([
    readFile(appUrl,'utf8'),
    readFile(swUrl,'utf8'),
  ]);
  return {app,sw};
}

test('RC74.16 mantiene el bootstrap sintácticamente válido',()=>{
  const result=spawnSync(process.execPath,['--check',appUrl.pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('RC74.16 enriquece Entrenamiento de hoy sin duplicar la política adaptativa',async()=>{
  const {app}=await sources();
  assert.match(app,/\[data-m27-client-home\] \[data-home-kind="train-now"\]/);
  assert.match(app,/data-workflow-action="start-published-session"/);
  assert.match(app,/data-session-entry-level/);
  assert.match(app,/Duración prevista/);
  assert.match(app,/Objetivo ·/);
  assert.match(app,/Contexto de hoy: listo para empezar/);
  assert.match(app,/Contexto de hoy: revisar antes de empezar/);
  assert.doesNotMatch(app,/(?:pain|sleep|energy|stress)\s*(?:>=|<=|>|<)\s*\d/iu);
});

test('RC74.16 cierra feedback y continuidad sólo sobre datos confirmados',async()=>{
  const {app}=await sources();
  assert.match(app,/data-session-live-state="feedback"/);
  assert.match(app,/data-session-feedback-pain-notes/);
  assert.match(app,/painNotes\.required=required/);
  assert.match(app,/aria-required/);
  assert.match(app,/data-m27-session-continuity/);
  assert.match(app,/Constancia confirmada · 28 días/);
  assert.match(app,/Esta sesión no se suma al progreso confirmado hasta que la sincronización termine/);
  assert.match(app,/buildAdherenceWindows/);
  assert.match(app,/appointment\.status==='confirmada'/);
  assert.match(app,/isClientVisibleAppointment/);
  assert.match(app,/Siguiente paso/);
});

test('RC74.16 reutiliza módulos canónicos ya precacheados y no amplía superficie PWA',async()=>{
  const {app,sw}=await sources();
  const imports=[
    '/src/m26/engagement/progress-continuity.js',
    '/src/m26/domain/appointment.js',
    '/src/m26/domain/civil-date.js',
    '/src/m26/modules/domain-selectors.js',
  ];
  for(const path of imports){
    assert.ok(app.includes(`import('${path}')`),path);
    assert.ok(sw.includes(`"${path}"`),`${path} no está en APP_SHELL`);
  }
  assert.doesNotMatch(app,/\/src\/m26\/experience\/session-value-loop\.js/);
});

test('RC74.16 usa ciclo de render explícito, es idempotente y no introduce atajos inseguros',async()=>{
  const {app}=await sources();
  assert.match(app,/addEventListener\('m26:shell-rendered',onShellRendered\)/);
  assert.match(app,/removeEventListener\('m26:shell-rendered',onShellRendered\)/);
  assert.match(app,/__IBERFIT_M26_SESSION_VALUE_LOOP__\?\.destroy\?\.\(\)/);
  assert.ok(app.includes("card.querySelector?.('[data-m28-training-value]')?.remove?.();"));
  assert.ok(app.includes("completed.querySelector?.('[data-m28-post-session-value]')?.remove?.();"));
  assert.doesNotMatch(app,/MutationObserver/);
  assert.doesNotMatch(app,/\.click\(\)/);
  assert.doesNotMatch(app,/innerHTML/);
  assert.doesNotMatch(app,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE|service[_-]?role/i);
  assert.doesNotMatch(app,/commandBus|EJECUCION_COMPLETAR|SESION_INICIAR/);
});
