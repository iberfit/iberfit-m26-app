import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controller = await readFile(new URL('../src/m26/admin/controller.js', import.meta.url), 'utf8');
const render = await readFile(new URL('../src/m26/admin/route-render.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../src/m26/admin/admin-state.js', import.meta.url), 'utf8');

test('ADMIN clients surface exposes real create-and-invite action', () => {
  assert.match(render, /data-admin-form=\"client-create\"/);
  assert.match(render, /Crear cliente y enviar invitación/);
  assert.match(render, /name=\"email\"[^>]*required/);
  assert.match(render, /name=\"modality\"[^>]*required/);
  assert.match(render, /name=\"objective\"[^>]*required/);
  assert.match(render, /name=\"frequency\"[^>]*required/);
  assert.match(controller, /kind==='client-create'/);
  assert.match(controller, /type:'ADMIN_CLIENTE_CREAR'/);
});

test('ADMIN client access state remains visible after bootstrap refresh', () => {
  assert.match(state, /'clientAccess'/);
  assert.match(state, /lastInvitationAttemptAt/);
  assert.match(state, /invitationDeliveryStatus/);
  assert.match(state, /access:accessByClient/);
  assert.match(render, /Acceso activo/);
  assert.match(render, /Invitación enviada/);
  assert.match(render, /Invitación pendiente/);
  assert.match(render, /Error de invitación/);
});

test('ADMIN creation feedback distinguishes provider delivery result', () => {
  assert.match(controller, /Invitación enviada correctamente/);
  assert.match(controller, /invitación no pudo enviarse/);
  assert.match(controller, /Invitación en proceso/);
});
