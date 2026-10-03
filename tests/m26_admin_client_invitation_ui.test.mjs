import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const controller = await readFile(new URL('../src/m26/admin/controller.js', import.meta.url), 'utf8');
const render = await readFile(new URL('../src/m26/admin/route-render.js', import.meta.url), 'utf8');
const state = await readFile(new URL('../src/m26/admin/admin-state.js', import.meta.url), 'utf8');

test('ADMIN clients surface exposes a guided service-aware create and access flow', () => {
  assert.match(render, /form\('client-create'/);
  assert.match(render, /data-client-create-wizard/u);
  assert.match(render, /Crear persona y preparar acceso/u);
  assert.match(render, /Expediente interno · no enviar invitación/u);
  assert.match(render, /Acceso IBERFIT · enviar invitación/u);
  assert.match(render, /Solo IRI · evaluación e informe/u);
  assert.match(render, /data-client-step="1"/u);
  assert.match(render, /data-client-step="5"/u);
  assert.match(render, /data-client-wizard-prev/u);
  assert.match(render, /data-client-wizard-next/u);
  assert.match(render, /name="email"[^>]*required/u);
  assert.match(render, /name="phone"/u);
  assert.doesNotMatch(render, /name="phone"[^>]*required/u);
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
  assert.match(state, /'clientLifecycle'/);
  assert.doesNotMatch(state, /'clientServices'/);
  assert.match(state, /lastInvitationAttemptAt/);
  assert.match(state, /invitationDeliveryStatus/);
  assert.match(state, /access:accessByClient/);
  assert.match(render, /Acceso activo/);
  assert.match(render, /Invitación enviada/);
  assert.match(render, /Invitación pendiente/);
  assert.match(render, /Error de invitación/);
});

test('ADMIN creation feedback distinguishes internal record and provider delivery result', () => {
  assert.match(controller, /creado sin enviar invitación/u);
  assert.match(controller, /Invitación enviada correctamente/);
  assert.match(controller, /invitación no pudo enviarse/);
  assert.match(controller, /Invitación en proceso/);
});


test('ADMIN can retry a failed invitation without exposing resend for healthy states', () => {
  assert.match(render, /function clientInvitationRetry\(c\)/u);
  assert.match(render, /delivery!==['"]error['"]/u);
  assert.match(render, /client-invite-resend/u);
  assert.match(render, /Reintentar invitación/u);
  assert.match(controller, /ADMIN_CLIENTE_REENVIAR_INVITACION/u);
  assert.match(controller, /invitationResendSuccess/u);
});
