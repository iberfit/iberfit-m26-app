import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState } from '../src/m26/production-state.js';
import { normalizeRole, assertClientSelectionAllowed } from '../src/m26/shell/role-policy.js';
import { navigationForRole } from '../src/m26/shell/navigation.js';
import { resolveM26Route } from '../src/m26/shell/route-guard.js';
import { createShellViewModel } from '../src/m26/shell/shell-view-model.js';
import { renderM26Shell } from '../src/m26/shell/shell-render.js';

const qaClientId = '57339e70-7a99-48d6-820f-7d4a51f89d9d';
const otherClientId = '91d73166-2fc5-4a96-a27a-b6f71e24d93c';

function readyState(role, overrides = {}) {
  const identity = role === 'client'
    ? { id: '61227666-d8b4-4d1e-aa08-2405ad2000db', role, clientId: qaClientId, name: 'Cliente QA M26' }
    : { id: '2425747b-93aa-44ed-86f3-334919a1f832', role, name: role === 'admin' ? 'Admin QA' : 'Coach QA M26' };
  return createProductionState({
    hydration: { status: 'ready', error: null, confirmedAt: '2026-07-18T21:00:00Z', serverTime: '2026-07-18T21:00:00Z' },
    identity,
    environment: 'PRODUCTION',
    canary: { active: true, scope: 'allowlist', version: 'M26-GATE15-FREE-RC1' },
    selectedClientId: qaClientId,
    collections: {
      ...createProductionState().collections,
      clients: [
        { id: qaClientId, name: 'Cliente Prueba IBERFIT', modalidad: 'Híbrido' },
        { id: otherClientId, name: 'Otro cliente visible' },
      ],
    },
    ...overrides,
  });
}

test('normaliza roles humanos sin ampliar privilegios', () => {
  assert.equal(normalizeRole('Entrenador'), 'coach');
  assert.equal(normalizeRole('Cliente'), 'client');
  assert.equal(normalizeRole('Administración'), null);
});

test('Cliente recibe navegación propia sin herramientas Coach', () => {
  const nav = navigationForRole('client');
  const all = [...nav.primary, ...nav.context, ...nav.tools].map((item) => item.key);
  assert.deepEqual(nav.primary.map((item) => item.key), ['hoy', 'planificacion', 'sesion', 'progreso']);
  assert.equal(all.includes('clientes'), false);
  assert.equal(all.includes('iri'), false);
  assert.equal(all.includes('biblioteca'), false);
  assert.equal(all.includes('verificacion'), false);
});

test('Coach conserva navegación clínica-operativa completa', () => {
  const nav = navigationForRole('coach');
  const all = [...nav.primary, ...nav.context, ...nav.tools].map((item) => item.key);
  for (const area of ['hoy', 'clientes', 'expediente', 'iri', 'planificacion', 'agenda', 'sesion', 'informes', 'inteligencia', 'biblioteca', 'verificacion']) {
    assert.equal(all.includes(area), true, area);
  }
});

test('Cliente solo puede seleccionar su propio expediente visible', () => {
  const state = readyState('client');
  assert.equal(assertClientSelectionAllowed(state, qaClientId), qaClientId);
  assert.throws(() => assertClientSelectionAllowed(state, otherClientId), /M26_CLIENT_SCOPE_FORBIDDEN/);
});

test('Coach solo puede seleccionar expedientes devueltos por bootstrap', () => {
  const state = readyState('coach');
  assert.equal(assertClientSelectionAllowed(state, otherClientId), otherClientId);
  assert.throws(() => assertClientSelectionAllowed(state, '00000000-0000-4000-8000-000000000000'), /M26_CLIENT_NOT_VISIBLE/);
});

test('Cliente no puede navegar a Clientes ni Diagnóstico IRI', () => {
  const state = readyState('client');
  assert.deepEqual(resolveM26Route(state, 'clientes'), { area: 'hoy', allowed: false, reason: 'M26_ROUTE_FORBIDDEN', contextClientId: null });
  assert.deepEqual(resolveM26Route(state, 'iri'), { area: 'hoy', allowed: false, reason: 'M26_ROUTE_FORBIDDEN', contextClientId: null });
});

test('ruta Coach con contexto exige expediente seleccionado', () => {
  const state = readyState('coach', { selectedClientId: null });
  assert.deepEqual(resolveM26Route(state, 'expediente'), { area: 'clientes', allowed: false, reason: 'M26_CLIENT_CONTEXT_REQUIRED', contextClientId: null });
});

test('Cliente siempre usa su propio clientId como contexto', () => {
  const state = readyState('client', { selectedClientId: otherClientId });
  const decision = resolveM26Route(state, 'informes');
  assert.equal(decision.allowed, true);
  assert.equal(decision.contextClientId, qaClientId);
});

test('view model Cliente oculta cualquier otro cliente visible por error', () => {
  const vm = createShellViewModel(readyState('client'));
  assert.equal(vm.clientOptions.length, 1);
  assert.equal(vm.clientOptions[0].id, qaClientId);
  assert.equal(vm.canChangeClient, false);
});

test('view model Coach conserva selector y contexto activo', () => {
  const vm = createShellViewModel(readyState('coach', { activeArea: 'expediente' }));
  assert.equal(vm.clientOptions.length, 2);
  assert.equal(vm.selectedClient.id, qaClientId);
  assert.equal(vm.canChangeClient, true);
  assert.equal(vm.page.title, 'Expediente IBERFIT');
});

test('operaciones pendientes no se presentan como confirmadas', () => {
  const vm = createShellViewModel(readyState('coach', {
    pendingOperations: [{ operationId: 'op-1' }],
    conflicts: [{ operationId: 'op-2' }],
  }));
  const html = renderM26Shell(vm);
  assert.match(html, /1 pendiente/);
  assert.match(html, /1 conflicto/);
  assert.doesNotMatch(html, /Todo confirmado/);
});

test('shell renderiza marca y estructura accesible sin manejadores inline', () => {
  const vm = createShellViewModel(readyState('coach', { activeArea: 'hoy' }));
  const html = renderM26Shell(vm);
  assert.match(html, /Entrenamiento personal con criterio/);
  assert.match(html, /aria-label="Navegación IBERFIT"/);
  assert.match(html, /id="m26-main"/);
  assert.doesNotMatch(html, /onclick=/i);
  assert.doesNotMatch(html, /<script/i);
});

test('sin hidratación el shell permanece en acceso', () => {
  const vm = createShellViewModel(createProductionState());
  assert.equal(vm.mode, 'access');
  assert.match(renderM26Shell(vm), /Confirmando identidad y permisos/);
});
