import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  renderCoachPlanningSessionsProgressive,
  COACH_PLANNING_FOCUS_SESSIONS,
  COACH_PLANNING_VISIBLE_SESSIONS,
} from '../src/m26/modules/route-render.js';
import {recoverExecutionAfterAuthentication} from '../src/m26/app/application.js';
import {createExecutionRecoveryStore} from '../src/m26/workflows/session-recovery.js';

const session=(index)=>({
  id:'b34-session-'+index,
  title:'Sesión '+index,
  dateLabel:'Semana '+index,
  status:'Publicado',
  publication:{status:'published',statusLabel:'Publicado',actions:[{action:'withdraw',label:'Retirar',requiresReason:true}]},
  clientContent:{title:'Sesión '+index,facts:['Entrenamiento personal']},
});

test('B34 Coach conserva cada sesión y cada acción, pero muestra solo dos fichas completas de inicio',()=>{
  const records=Array.from({length:36},(_,i)=>session(i));
  const html=renderCoachPlanningSessionsProgressive(records,'session');
  assert.equal(COACH_PLANNING_FOCUS_SESSIONS,2);
  assert.equal(COACH_PLANNING_VISIBLE_SESSIONS,6);
  assert.equal((html.match(/data-coach-planning-compact/g)||[]).length,4);
  assert.equal((html.match(/data-publication-card/g)||[]).length,36);
  assert.equal((html.match(/data-workflow-action="reuse-session"/g)||[]).length,36);
  assert.equal((html.match(/data-publication-action="withdraw"/g)||[]).length,36);
  assert.equal((html.match(/data-coach-planning-batch/g)||[]).length,2);
  assert.match(html,/Consultar otras 30 sesiones/);
  for(let i=0;i<36;i++)assert.ok(html.includes('data-entity-id="b34-session-'+i+'"'));
});

test('B34 Coach protege los casos empty, compactos y la separación de permisos de planificación',()=>{
  const one=renderCoachPlanningSessionsProgressive([session(0)],'session');
  assert.doesNotMatch(one,/data-coach-planning-compact|data-coach-planning-archive/);
  const small=renderCoachPlanningSessionsProgressive([session(0),session(1),session(2)],'planning');
  assert.equal((small.match(/data-coach-planning-compact/g)||[]).length,1);
  assert.doesNotMatch(small,/data-workflow-action="reuse-session"/);
  assert.equal((small.match(/data-publication-action="withdraw"/g)||[]).length,3);
  assert.throws(()=>renderCoachPlanningSessionsProgressive([session(0)],'report'),/COACH_PLANNING_ENTITY_INVALID/);
});

test('B34 los títulos no confiables se escapan en resumen y ficha completa',()=>{
  const malicious={...session(2),title:'<img src=x onerror=alert(1)>'};
  const html=renderCoachPlanningSessionsProgressive([session(0),session(1),malicious],'session');
  assert.doesNotMatch(html,/<img src=x onerror=alert/);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('B34 el deadline aborta el trabajo en curso sin bloquear el acceso autenticado',async()=>{
  let observedSignal=null;
  const reported=[];
  const restored=await recoverExecutionAfterAuthentication({
    restoreExecution:({signal})=>{observedSignal=signal;return new Promise(()=>{});},
    timeoutMs:25,
    reportDiagnostic:(code,error)=>reported.push([code,error.message]),
  });
  assert.equal(restored,false);
  assert.equal(observedSignal?.aborted,true);
  assert.deepEqual(reported,[['session-recovery-auto-restore','M26_SESSION_RECOVERY_TIMEOUT']]);
});

test('B34 el listado ya purga snapshots inválidos sin un barrido previo duplicado',async()=>{
  const removed=[];
  const store=createExecutionRecoveryStore({
    ownerId:'synthetic-coach',
    storage:{
      entries:async(prefix)=>[[prefix+'invalid',{ownerId:'synthetic-coach',invalid:true}]],
      remove:async(key)=>{removed.push(key);},
    },
    now:()=>new Date('2026-10-27T15:00:00.000Z'),
  });
  assert.deepEqual(await store.list(),[]);
  assert.deepEqual(removed,['m26:execution:synthetic-coach:invalid']);
});

test('B34 abort y lease de identidad se verifican antes de navegar o asignar sesión',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const start=source.indexOf('  async function restoreExecution({signal}={})');
  const end=source.indexOf('  async function restoreExecutionAfterAuthentication()',start);
  assert.ok(start>0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/ownerCoordinator\.list\?\.\(\)/);
  assert.doesNotMatch(block,/purgeExpired\?\.\(\)/);
  assert.match(block,/recoveryCoordinator!==ownerCoordinator/);
  assert.match(block,/String\(session\?\.user\?\.id\|\|''\)!==ownerUserId/);
  assert.match(block,/fresh\.selectedClientId/);
  assert.ok(block.lastIndexOf('signal?.aborted')<block.indexOf('sessionUi={'));
  assert.ok(block.includes("store.navigate('sesion')"));
});

test('B34 foco, accesibilidad táctil y contraste forzado siguen presentes en móvil',()=>{
  const css=readFileSync(new URL('../src/m26/design/signature-ux-v2.css',import.meta.url),'utf8').split('SIGNATURE B34').at(-1);
  assert.match(css,/min-height:48px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/forced-colors:active/);
  assert.match(css,/max-width:370px/);
  assert.doesNotMatch(css,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/);
});
