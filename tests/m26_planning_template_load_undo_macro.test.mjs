import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('cargar plantilla captura el borrador previo antes de reemplazarlo',()=>{
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  const snapshot=app.indexOf('const previousDraft=structuredClone(sessionUi.draft);');
  const replace=app.indexOf('sessionUi.draft=nextDraft;');
  assert.ok(snapshot>=0&&replace>snapshot);
  assert.match(app,/sessionUi\.templateUndo=Object\.freeze\(\{draft:previousDraft\}\)/u);
});

test('undo de plantilla está aislado por cliente y es efímero',()=>{
  const app=fs.readFileSync('src/m26/app/application.js','utf8');
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(app,/M26_SESSION_TEMPLATE_UNDO_SCOPE_MISMATCH/u);
  assert.match(app,/function clearCurrentTemplateUndo\(\)/u);
  assert.match(controller,/context\.clearTemplateUndo\?\.\(\)/u);
});

test('acción de restauración está registrada solo para coach/admin',()=>{
  const audit=fs.readFileSync('src/m26/ui/interactive-audit.js','utf8');
  assert.match(audit,/'restore-template-load':\{roles:\['admin','coach'\],domain:'session'\}/u);
});

test('UI ofrece deshacer sin serializar el borrador previo',()=>{
  const ui=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(ui,/data-session-template-undo/u);
  assert.match(ui,/data-session-action="restore-template-load"/u);
  assert.doesNotMatch(ui,/JSON\.stringify\(templateUndo/u);
});
