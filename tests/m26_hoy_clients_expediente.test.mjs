import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState } from '../src/m26/production-state.js';
import { createShellViewModel } from '../src/m26/shell/shell-view-model.js';
import { createRouteViewModel } from '../src/m26/modules/route-view-model.js';
import { renderRouteView } from '../src/m26/modules/route-render.js';
import { clientsOverview, todayOverview, recordsForClient } from '../src/m26/modules/domain-selectors.js';

const qa = '57339e70-7a99-48d6-820f-7d4a51f89d9d';
const other = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-07-18T14:00:00-04:00');
function ready(role = 'coach', overrides = {}) {
  const clients = role === 'client'
    ? [{ id: qa, name: 'Cliente Prueba IBERFIT', modality: 'Híbrido', status: 'activo' }]
    : [
      { id: qa, name: 'Cliente Prueba IBERFIT', modality: 'Híbrido', status: 'activo' },
      { id: other, name: 'Cliente Dos', modality: 'Online', status: 'activo' },
    ];
  return createProductionState({
    hydration: { status: 'ready', error: null, confirmedAt: now.toISOString(), serverTime: now.toISOString() },
    identity: { id: role === 'client' ? 'u-client' : 'u-coach', role, clientId: role === 'client' ? qa : null, name: role === 'client' ? 'Cliente QA' : 'Coach QA' },
    canary: { active: true, scope: 'allowlist', version: 'M26-GATE15-FREE-RC1' },
    selectedClientId: qa,
    activeArea: 'hoy',
    collections: {
      clients,
      clientProfiles: [{ id: 'p1', client_id: qa, objective: 'Fuerza y salud', modality: 'hibrido', birthDate: '1990-02-20', sexForNorms: 'female', email: 'qa@example.com', phone: '+56 9 1111 2222', trainingAddress: 'Av. IBERFIT 123', commune: 'Las Condes', status: 'activo' }],
      clientAccess: [{ id: 'a1', clientId: qa, status: 'activo' }],
      iriAssessments: [{ id: 'i1', client_id: qa, score: 80, quality: 'alta', classification: 'Performance', status: 'completado', created_at: '2026-07-17T10:00:00Z' }],
      reports: [{ id: 'r1', clientId: qa, title: 'Informe IRI', status: 'publicado', createdAt: '2026-07-17T11:00:00Z' }],
      trainingCycles: [{ id: 'c1', client_id: qa, name: 'Ciclo Base', status: 'activo' }],
      sessions: [{ id: 's1', clientId: qa, status: 'publicado' }],
      sessionExecutions: [{ id: 'e1', client_id: qa, status: 'completado' }],
      appointments: [
        { id: 'ap0', client_id: qa, title: 'Propuesta privada', start_at: '2026-07-18T17:00:00Z', status: 'propuesta', visibleToClient: false, modality: 'online' },
        { id: 'ap1', client_id: qa, session_id: 's1', title: 'Sesión presencial', start_at: '2026-07-18T18:00:00Z', status: 'confirmado', location: 'Las Condes', modality: 'presencial' },
        { id: 'ap2', client_id: other, title: 'Sesión online', start_at: '2026-07-18T20:00:00Z', status: 'confirmado' },
      ],
      intelligenceRuns: [], domainEvents: [], coachAvailability: [], m26Entities: [],
    },
    ...overrides,
  });
}

test('selectores filtran estrictamente por clientId', () => {
  const state = ready('coach');
  assert.equal(recordsForClient(state, 'appointments', qa).length, 2);
  assert.equal(recordsForClient(state, 'appointments', other).length, 1);
});

test('overview Cliente nunca incluye agenda de otro cliente', () => {
  const overview = todayOverview(ready('client'), now);
  assert.equal(overview.appointments.length, 1);
  assert.equal(overview.appointments[0].client_id, qa);
  assert.equal(overview.summaries.length, 1);
  assert.equal(overview.summaries[0].client.id, qa);
});

test('overview Coach conserva cartera visible y métricas por expediente', () => {
  const rows = clientsOverview(ready('coach'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].iri.id, 'i1');
  assert.equal(rows[0].counts.sessions, 1);
  assert.equal(rows[1].counts.sessions, 0);
});

test('Hoy renderiza datos reales del store sin fixtures', () => {
  const state = ready('coach');
  const shellVm = createShellViewModel(state);
  const vm = createRouteViewModel(shellVm, state, now);
  const html = renderRouteView(vm);
  assert.equal(vm.kind, 'hoy');
  assert.match(html, /Prioridades de hoy/);
  assert.match(html, /Siguiente acción/);
  assert.match(html, /Sesión presencial/);
  assert.match(html, /1 propuesta/);
  assert.doesNotMatch(html, /Agenda confirmada/);
  assert.match(html, /Cliente Prueba IBERFIT/);
  assert.doesNotMatch(html, /CLI-DEMO|fixture|demo\.iberfit/i);
});

test('Hoy Cliente inicia directamente la sesión publicada vinculada a su cita', () => {
  const state = ready('client');
  const shellVm = createShellViewModel(state);
  const vm = createRouteViewModel(shellVm, state, now);
  const html = renderRouteView(vm);

  assert.equal(vm.kind, 'hoy');
  assert.equal(vm.appointments.length, 1);
  assert.equal(vm.appointments[0].sessionId, 's1');

  assert.match(
    html,
    /data-workflow-action="start-published-session"/
  );

  assert.match(
    html,
    /data-entity-id="s1"/
  );

  assert.match(
    html,
    />Iniciar entrenamiento</
  );
});
test('Clientes abre expediente mediante atributos de datos, no handlers inline', () => {
  const state = ready('coach', { activeArea: 'clientes' });
  const vm = createRouteViewModel(createShellViewModel(state), state, now);
  const html = renderRouteView(vm);
  assert.match(html, new RegExp(`data-m26-select-client="${qa}"`));
  assert.doesNotMatch(html, /onclick=/i);
});

test('Expediente presenta IRI por dominios, contacto y acciones contextuales', () => {
  const state = ready('coach', { activeArea: 'expediente' });
  const vm = createRouteViewModel(createShellViewModel(state), state, now);
  const html = renderRouteView(vm);
  assert.equal(vm.summary.iri.coverageCount, 0);
  assert.match(html, /Correo electrónico/);
  assert.match(html, /qa@example.com/);
  assert.match(html, /Dirección de entrenamiento/);
  assert.doesNotMatch(html, />80</);
  assert.doesNotMatch(html, /Performance/);
  assert.match(html, /data-m26-area="planificacion"/);
});

test('operaciones pendientes se muestran como no confirmadas', () => {
  const state = ready('coach', { pendingOperations: [{ operationId: 'op-1' }] });
  const vm = createRouteViewModel(createShellViewModel(state), state, now);
  const html = renderRouteView(vm);
  assert.match(html, /Ningún cambio se muestra como confirmado/);
  assert.match(html, /Sincronizando/);
});
