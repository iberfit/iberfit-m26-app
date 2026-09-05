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

function valueLoopSource(app){
  const start=app.indexOf("const SESSION_VALUE_STYLE_ID='m28-session-value-loop-styles';");
  const end=app.indexOf('async function loadFullApplication(){',start);
  assert.ok(start>=0&&end>start,'No se pudo aislar el bloque RC74.16');
  return app.slice(start,end);
}

test('RC74.16 mantiene el bootstrap sintácticamente válido',()=>{
  const result=spawnSync(process.execPath,['--check',appUrl.pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('RC74.16 enriquece Entrenamiento de hoy sin duplicar la política adaptativa',async()=>{
  const {app}=await sources();
  const valueLoop=valueLoopSource(app);
  assert.match(valueLoop,/\[data-m27-client-home\] \[data-home-kind="train-now"\]/);
  assert.match(valueLoop,/data-workflow-action="start-published-session"/);
  assert.match(valueLoop,/data-session-entry-level/);
  assert.match(valueLoop,/Duración prevista/);
  assert.match(valueLoop,/Objetivo ·/);
  assert.match(valueLoop,/Contexto de hoy: listo para empezar/);
  assert.match(valueLoop,/Contexto de hoy: revisar antes de empezar/);
  assert.doesNotMatch(valueLoop,/(?:pain|sleep|energy|stress)\s*(?:>=|<=|>|<)\s*\d/iu);
});

test('RC74.16 cierra feedback y continuidad sólo sobre datos confirmados',async()=>{
  const {app}=await sources();
  const valueLoop=valueLoopSource(app);
  assert.match(valueLoop,/data-session-live-state="feedback"/);
  assert.match(valueLoop,/data-session-feedback-pain-notes/);
  assert.match(valueLoop,/painNotes\.required=required/);
  assert.match(valueLoop,/aria-required/);
  assert.match(valueLoop,/data-m27-session-continuity/);
  assert.match(valueLoop,/Constancia confirmada · 28 días/);
  assert.match(valueLoop,/Esta sesión no se suma al progreso confirmado hasta que la sincronización termine/);
  assert.match(valueLoop,/buildAdherenceWindows/);
  assert.match(valueLoop,/appointment\.status==='confirmada'/);
  assert.match(valueLoop,/isClientVisibleAppointment/);
  assert.match(valueLoop,/Siguiente paso/);
});

test('RC74.16 reutiliza módulos canónicos ya precacheados y no amplía superficie PWA',async()=>{
  const {app,sw}=await sources();
  const valueLoop=valueLoopSource(app);
  const imports=[
    '/src/m26/engagement/progress-continuity.js',
    '/src/m26/domain/appointment.js',
    '/src/m26/domain/civil-date.js',
    '/src/m26/modules/domain-selectors.js',
  ];
  for(const path of imports){
    assert.ok(valueLoop.includes(`import('${path}')`),path);
    assert.ok(sw.includes(`"${path}"`),`${path} no está en APP_SHELL`);
  }
  assert.doesNotMatch(valueLoop,/\/src\/m26\/experience\/session-value-loop\.js/);
});

test('RC74.16 usa ciclo de render explícito, es idempotente y no introduce atajos inseguros',async()=>{
  const {app}=await sources();
  const valueLoop=valueLoopSource(app);
  assert.match(valueLoop,/addEventListener\('m26:shell-rendered',onShellRendered\)/);
  assert.match(valueLoop,/removeEventListener\('m26:shell-rendered',onShellRendered\)/);
  assert.match(app,/__IBERFIT_M26_SESSION_VALUE_LOOP__\?\.destroy\?\.\(\)/);
  assert.ok(valueLoop.includes("card.querySelector?.('[data-m28-training-value]')?.remove?.();"));
  assert.ok(valueLoop.includes("completed.querySelector?.('[data-m28-post-session-value]')?.remove?.();"));
  assert.doesNotMatch(valueLoop,/MutationObserver/);
  assert.doesNotMatch(valueLoop,/\.click\(\)/);
  assert.doesNotMatch(valueLoop,/innerHTML/);
  assert.doesNotMatch(valueLoop,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE|service[_-]?role/i);
  assert.doesNotMatch(valueLoop,/commandBus|EJECUCION_COMPLETAR|SESION_INICIAR/);
});
