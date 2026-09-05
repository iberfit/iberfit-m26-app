import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditInteractiveMarkup,assertInteractiveMarkup} from '../src/m26/ui/interactive-audit.js';
import {renderM26AccessFrame} from '../src/m26/shell/shell-render.js';

const shellSource=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');

test('access frame diferencia loading y error para tecnologías de asistencia',()=>{
  const loading=renderM26AccessFrame({hydration:{status:'loading'}});
  const error=renderM26AccessFrame({hydration:{status:'error'}});
  assert.match(loading,/data-ux-state="loading"/);
  assert.match(loading,/aria-busy="true"/);
  assert.match(loading,/role="status" aria-live="polite"/);
  assert.match(error,/data-ux-state="error"/);
  assert.match(error,/aria-busy="false"/);
  assert.match(error,/role="alert" aria-live="assertive"/);
});

test('shell conserva skip target enfocable y diálogo con nombre accesible',()=>{
  assert.match(shellSource,/href="#m26-main"/);
  assert.match(shellSource,/id=\\?"m26-main\\?"[^>]*tabindex=\\?"-1\\?"/);
  assert.match(shellSource,/role=\\?"dialog\\?"[^>]*aria-modal=\\?"true\\?"[^>]*aria-labelledby=\\?"m26-coach-command-title\\?"/);
  assert.match(shellSource,/id=\\?"m26-coach-command-title\\?"/);
});

test('auditor fail-closed detecta regresiones críticas de accesibilidad',()=>{
  const broken=[
    '<section role="dialog"><button type="button">Cerrar</button></section>',
    '<section role="dialog" aria-labelledby="missing"><button type="button">Cerrar</button></section>',
    '<div role="alert" aria-live="polite">Error</div>',
    '<main id="m26-main">Contenido</main>',
    '<div id="same"></div><span id="same"></span>',
  ].join('');
  const report=auditInteractiveMarkup(broken);
  assert.equal(report.ok,false);
  assert.ok(report.errors.includes('DIALOG_NAME_REQUIRED'));
  assert.ok(report.errors.includes('DIALOG_LABEL_TARGET_REQUIRED:missing'));
  assert.ok(report.errors.includes('ALERT_LIVE_ASSERTIVE_REQUIRED'));
  assert.ok(report.errors.includes('MAIN_FOCUS_TARGET_REQUIRED'));
  assert.ok(report.errors.includes('DUPLICATE_ID:same'));
  assert.throws(()=>assertInteractiveMarkup(broken),/M26_ACCESSIBILITY_GATE_FAILED/);
});

test('auditor acepta un diálogo y un main correctamente etiquetados',()=>{
  const markup='<h2 id="dialog-title">Acciones</h2><section role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button type="button">Cerrar</button></section><div role="alert" aria-live="assertive">Error</div><main id="m26-main" tabindex="-1">Contenido</main>';
  assert.deepEqual(assertInteractiveMarkup(markup),{ok:true,errors:[]});
});
