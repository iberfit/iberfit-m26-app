import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controller = await readFile(new URL('../src/m26/admin/controller.js', import.meta.url), 'utf8');
const render = await readFile(new URL('../src/m26/admin/route-render.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../src/m26/admin/admin-state.js', import.meta.url), 'utf8');

test('ADMIN clients surface exposes a guided create-and-invite flow', () => {
  assert.match(render, /form\('client-create'/);
  assert.match(render, /data-client-create-wizard/u);
  assert.match(render, /Crear cliente y enviar invitación/u);
  assert.match(render, /data-client-step="1"/u);
  assert.match(render, /data-client-step="5"/u);
  assert.match(render, /data-client-wizard-prev/u);
  assert.match(render, /data-client-wizard-next/u);
  assert.match(render, /name="email"[^>]*required/u);
  assert.match(render, /name="phone"[^>]*required/u);
  assert.match(render, /name="modality"[^>]*required/u);
  assert.match(render, /name="weeklyFrequency"[^>]*required/u);
  assert.match(render, /name="sessionDurationMinutes"[^>]*required/u);
  assert.match(render, /name="objective"[^>]*required/u);
  assert.match(controller, /kind==='client-create'/);
  assert.match(controller, /type:'ADMIN_CLIENTE_CREAR'/);
  assert.match(controller, /initialAssessmentMode/u);
  assert.match(controller, /weeklyFrequency/u);
  assert.match(controller, /clientWizard\.clear\(\)/u);
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
