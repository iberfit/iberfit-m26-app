import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nativeWorkspace=fs.readFileSync('src/m26/ui/native-workspace.js','utf8');
const adminRoute=fs.readFileSync('src/m26/admin/route-render.js','utf8');

test('lead capture is never presented as real client onboarding',()=>{
  assert.match(nativeWorkspace,/eyebrow\.textContent='Prospección'/u);
  assert.match(nativeWorkspace,/title\.textContent='Registrar un lead'/u);
  assert.match(nativeWorkspace,/utiliza “Nuevo cliente” para crear su expediente real/u);
  assert.doesNotMatch(nativeWorkspace,/eyebrow\.textContent='Alta de cliente'/u);
  assert.doesNotMatch(nativeWorkspace,/open\.textContent='Empezar alta'/u);
});

test('real client wizard remains the explicit path that creates the expediente and invitation',()=>{
  assert.match(adminRoute,/<h3>Nuevo cliente<\/h3>/u);
  assert.match(adminRoute,/Crear cliente y enviar invitación/u);
  assert.match(adminRoute,/IBERFIT creará el expediente/u);
  assert.match(adminRoute,/data-admin-form="client-create"|form\('client-create'/u);
});
