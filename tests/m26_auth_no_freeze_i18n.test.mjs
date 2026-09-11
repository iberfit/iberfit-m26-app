import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  AUTH_BUSY_WATCHDOG_MS,
  createAuthBusyWatchdog,
} from '../src/m26/app/application.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

function fakeClock(){
  let nextId=1;
  const timers=new Map();
  return {
    setTimeoutFn(fn,ms){
      const id=nextId++;
      timers.set(id,{fn,ms});
      return id;
    },
    clearTimeoutFn(id){timers.delete(id);},
    fire(id){
      const timer=timers.get(id);
      if(!timer)return false;
      timers.delete(id);
      timer.fn();
      return true;
    },
    first(){
      const entry=timers.entries().next().value;
      return entry?{id:entry[0],...entry[1]}:null;
    },
    get size(){return timers.size;},
  };
}

test('auth watchdog invalidates the active generation before surfacing timeout',()=>{
  const clock=fakeClock();
  const timeouts=[];
  const watchdog=createAuthBusyWatchdog({
    setTimeoutFn:clock.setTimeoutFn,
    clearTimeoutFn:clock.clearTimeoutFn,
    onTimeout:(detail)=>timeouts.push(detail),
  });

  const attempt=watchdog.begin('resume');
  const timer=clock.first();
  assert.equal(timer.ms,AUTH_BUSY_WATCHDOG_MS);
  assert.equal(watchdog.isCurrent(attempt),true);

  assert.equal(clock.fire(timer.id),true);
  assert.equal(timeouts.length,1);
  assert.equal(timeouts[0].stage,'resume');
  assert.equal(watchdog.isCurrent(attempt),false,'timed-out work must become stale before UI recovery');
});

test('completing auth cancels timeout and stale completions cannot clear newer attempts',()=>{
  const clock=fakeClock();
  let timeoutCount=0;
  const watchdog=createAuthBusyWatchdog({
    timeoutMs:9_000,
    setTimeoutFn:clock.setTimeoutFn,
    clearTimeoutFn:clock.clearTimeoutFn,
    onTimeout:()=>{timeoutCount+=1;},
  });

  const first=watchdog.begin('login');
  assert.equal(watchdog.complete(first),true);
  assert.equal(clock.size,0);

  const second=watchdog.begin('retry');
  assert.notEqual(second,first);
  assert.equal(watchdog.complete(first),false);
  assert.equal(watchdog.isCurrent(second),true);
  watchdog.invalidate();
  assert.equal(watchdog.isCurrent(second),false);
  assert.equal(clock.size,0);
  assert.equal(timeoutCount,0);
});

test('login, resume and retry are all protected by the no-freeze watchdog',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  for(const [fn,stage] of [
    ['async function login(email,password)',"authWatchdog.begin('login')"],
    ['async function resume()',"authWatchdog.begin('resume')"],
    ['async function retrySession()',"authWatchdog.begin('session-retry')"],
  ]){
    const start=source.indexOf(fn);
    assert.ok(start>=0,fn);
    const block=source.slice(start,start+4200);
    assert.ok(block.includes(stage),stage);
  }
  assert.match(source,/M26_AUTH_ATTEMPT_SUPERSEDED/u);
  assert.match(source,/surfaceRetriableSessionFailure\(\s*new Error\('M26_AUTH_UI_TIMEOUT'\)/u);
});

const ACCESS_COPY=[
  'Acceso privado',
  'Entrenamiento personal con criterio',
  'Diagnóstico, planificación, control y seguimiento.',
  'Correo',
  'Recordar correo',
  'Primera vez o no recuerdo mi contraseña',
  'Entrar',
  'Confirmando…',
  'Reconectando tu sesión…',
  'Restaurando tu sesión segura…',
  'Confirmando identidad y permisos…',
  'Entrenamiento personal premium',
  'Un sistema claro para entrenar, medir y progresar.',
  'IBERFIT une diagnóstico, planificación, control de carga y seguimiento en una experiencia continua, dentro y fuera de cada sesión.',
  'Diagnóstico',
  'Punto de partida medible',
  'Carga y progresión con criterio',
  'Decisiones basadas en tu evolución',
  'Acceso privado · datos protegidos · continuidad entre dispositivos',
];

test('premium access copy is complete in every selectable non-Spanish language',()=>{
  for(const language of ['en','fr','pt']){
    for(const source of ACCESS_COPY){
      const translated=iberfitSurfaceTranslate(source,{language});
      assert.ok(translated.trim(),language+': '+source);
      assert.notEqual(translated,source,language+' must translate: '+source);
    }
  }
});

test('English access copy uses natural product wording instead of mixed-language fragments',()=>{
  assert.equal(
    iberfitSurfaceTranslate('Primera vez o no recuerdo mi contraseña',{language:'en'}),
    'First time here or forgot your password',
  );
  assert.equal(iberfitSurfaceTranslate('Correo',{language:'en'}),'Email');
  assert.equal(iberfitSurfaceTranslate('Confirmando…',{language:'en'}),'Signing in…');
  assert.equal(
    iberfitSurfaceTranslate('Un sistema claro para entrenar, medir y progresar.',{language:'en'}),
    'A clear system to train, measure and progress.',
  );
});
