import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createM26Id} from '../src/m26/platform/id.js';
import {createSessionDraft} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {auditInteractiveMarkup,M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {loadExerciseCatalog} from '../src/m26/exercises/catalog.js';
const root=new URL('..',import.meta.url);const json=(p)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));const text=(p)=>fs.readFileSync(new URL(p,root),'utf8');

test('QA integrada aprueba Coach y Cliente con rutas y acciones reales',()=>{const report=json('recovery/RC14_INTEGRATED_QA_REPORT.json');assert.equal(report.total,2);assert.equal(report.passed,2);for(const result of report.results){assert.equal(result.ok,true,result.role);assert.ok(result.routes.every(x=>x.ok));assert.ok(result.actions.every(x=>x.ok));assert.equal(result.console_errors.length,0);assert.equal(result.page_errors.length,0);}});

test('aplicación pública usa carga absoluta diferida y configuración cerrada',()=>{const entry=text('public/m26/app.js');assert.doesNotMatch(entry,/^import\s+\{createM26Application\}/m);assert.match(entry,/await import\('\/src\/m26\/app\/application\.js'\)/);assert.match(text('public/m26/runtime-config.js'),/enabled:\s*false/);assert.match(text('public/m26/runtime-config.example.js'),/qaOnly:\s*true/);});

test('navegación móvil expone menú Más con todas las rutas autorizadas',()=>{const render=text('src/m26/shell/shell-render.js');const css=text('src/m26/shell/shell.css');assert.match(render,/m26-mobile-more/);assert.match(render,/allMobileItems/);assert.match(css,/position:\s*fixed/);assert.match(css,/z-index:\s*1000/);});

test('biblioteca busca en los 367 ejercicios mediante índice normalizado',()=>{const controller=text('src/m26/app/workflow-controller.js');const search=text('src/m26/exercises/search.js');assert.match(controller,/createExerciseSearchIndex/);assert.match(search,/aliases/);assert.match(search,/safeLimit/);});

test('identificadores conservan fallback cuando randomUUID no está disponible',()=>{const id=createM26Id();assert.match(id,/^[0-9a-f-]{36}$/);});

test('constructor y ejecución incluyen salida segura registrada',async()=>{const catalog=await loadExerciseCatalog(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url));const draft=createSessionDraft({clientId:'c1'});const builder=renderSessionBuilder({draft,catalog});assert.match(builder,/data-session-action="exit-session"/);assert.equal(auditInteractiveMarkup(builder).ok,true);assert.ok(M26_ACTION_REGISTRY['exit-session']);const session={...draft,id:'s1',blocks:[{id:'b1',type:'exercise',exerciseId:catalog.list()[0].id,name:'Ejercicio',sets:1,reps:'8',restSeconds:60}]};const execution=createExecution({session,clientId:'c1'});const ready=renderGuidedExecution({execution,session,catalog});assert.match(ready,/exit-session/);assert.equal(auditInteractiveMarkup(ready).ok,true);});

test('guard de sesión impide perder el contexto al cambiar de módulo',()=>{const app=text('src/m26/app/application.js');assert.match(app,/guardSessionNavigation/);assert.match(app,/stopImmediatePropagation/);assert.match(app,/exitSessionWorkspace/);});
