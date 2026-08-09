import test from 'node:test';
import assert from 'node:assert/strict';

import { createProductionState } from '../src/m26/production-state.js';
import { createShellViewModel } from '../src/m26/shell/shell-view-model.js';
import { createRouteViewModel } from '../src/m26/modules/route-view-model.js';

const clientId = '57339e70-7a99-48d6-820f-7d4a51f89d9d';
const otherId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-07-18T14:00:00-04:00');

function stateFor(role = 'coach', area = 'hoy') {
  const clients =
    role === 'client'
      ? [
          {
            id: clientId,
            name: 'Cliente Prueba IBERFIT',
            modality: 'Híbrido',
            status: 'activo',
          },
        ]
      : [
          {
            id: clientId,
            name: 'Cliente Prueba IBERFIT',
            modality: 'Híbrido',
            status: 'activo',
          },
          {
            id: otherId,
            name: 'Cliente Pendiente',
            modality: 'Online',
            status: 'activo',
          },
        ];

  return createProductionState({
    hydration: {
      status: 'ready',
      error: null,
      confirmedAt: now.toISOString(),
      serverTime: now.toISOString(),
    },

    identity: {
      id: role === 'client' ? 'u-client' : 'u-coach',
      role,
      clientId: role === 'client' ? clientId : null,
      name: role === 'client' ? 'Cliente QA' : 'Coach QA',
    },

    canary: {
      active: true,
      scope: 'allowlist',
      version: 'M26-RC46-EXPERIENCE',
    },

    selectedClientId: clientId,
    activeArea: area,

    collections: {
      clients,

      clientProfiles: [
        {
          id: 'p1',
          client_id: clientId,
          objective: 'Fuerza y salud',
          modality: 'hibrido',
          birthDate: '1990-02-20',
          sexForNorms: 'female',
          email: 'qa@example.com',
          phone: '+56 9 1111 2222',
          trainingAddress: 'Av. IBERFIT 123',
          commune: 'Las Condes',
          status: 'activo',
        },
      ],

      clientAccess: [
        {
          id: 'a1',
          clientId,
          status: 'activo',
        },
      ],

      iriAssessments: [
        {
          id: 'i1',
          client_id: clientId,
          score: 80,
          quality: 'alta',
          classification: 'Performance',
          status: 'completado',
          created_at: '2026-07-17T10:00:00Z',
        },
      ],

      reports: [
        {
          id: 'r1',
          clientId,
          title: 'Informe IRI',
          status: 'publicado',
          createdAt: '2026-07-17T11:00:00Z',
        },
      ],

      trainingCycles: [
        {
          id: 'c1',
          client_id: clientId,
          name: 'Ciclo Base',
          status: 'activo',
        },
      ],

      sessions: [
        {
          id: 's1',
          clientId,
          status: 'publicado',
        },
      ],

      sessionExecutions: [
        {
          id: 'e1',
          client_id: clientId,
          status: 'completado',
        },
      ],

      appointments: [
        {
          id: 'ap1',
          client_id: clientId,
          title: 'Sesión presencial',
          start_at: '2026-07-18T18:00:00Z',
          status: 'confirmado',
          location: 'Las Condes',
          modality: 'presencial',
        },
        {
          id: 'ap2',
          client_id: otherId,
          title: 'Primera sesión',
          start_at: '2026-07-18T20:00:00Z',
          status: 'confirmado',
        },
      ],

      intelligenceRuns: [],
      domainEvents: [],
      coachAvailability: [],
      m26Entities: [],
    },
  });
}

function route(role, area) {
  const state = stateFor(role, area);
  return createRouteViewModel(
    createShellViewModel(state),
    state,
    now
  );
}

function clientFrom(vm, id = clientId) {
  return vm.clients?.find((client) => client.id === id) || null;
}

function assertSpanishExperience(summary) {
  assert.ok(summary?.experience);
  assert.ok(summary?.nextAction);

  const visible = [
    summary.experience.stageLabel,
    summary.nextAction.label,
    summary.nextAction.reason,
  ]
    .filter(Boolean)
    .join(' ');

  assert.doesNotMatch(
    visible,
    /\bonboarding\b|\bevaluation\b|\bscheduling\b|\breview follow up\b|\bcomplete profile\b/i
  );
}

test('Hoy Coach consume Experience Core en el cliente operativo', () => {
  const vm = route('coach', 'hoy');
  const client = clientFrom(vm);

  assert.equal(vm.kind, 'hoy');
  assert.ok(client);

  assert.equal(client.experience.stage, 'active');
  assert.equal(client.experience.stageLabel, 'Seguimiento activo');
  assert.equal(client.experience.process.percentage, 100);

  assert.equal(client.nextAction.key, 'review_follow_up');
  assert.equal(client.nextAction.label, 'Revisar seguimiento');
  assert.equal(client.nextAction.area, 'expediente');

  assertSpanishExperience(client);
});

test('Clientes distingue recorrido completo de alta pendiente', () => {
  const vm = route('coach', 'clientes');

  const active = clientFrom(vm, clientId);
  const pending = clientFrom(vm, otherId);

  assert.equal(vm.kind, 'clientes');

  assert.equal(active.experience.stage, 'active');

  assert.equal(pending.experience.stage, 'onboarding');
  assert.equal(pending.experience.stageLabel, 'Alta incompleta');
  assert.equal(pending.nextAction.key, 'complete_profile');
  assert.equal(pending.nextAction.label, 'Completar expediente');

  assertSpanishExperience(active);
  assertSpanishExperience(pending);
});

test('Expediente expone una única interpretación operativa', () => {
  const vm = route('coach', 'expediente');

  assert.equal(vm.kind, 'expediente');
  assert.equal(vm.summary.experience.stage, 'active');
  assert.equal(vm.summary.nextAction.key, 'review_follow_up');

  assertSpanishExperience(vm.summary);
});

test('Agenda integra Experience Core sin perder el rol', () => {
  const vm = route('coach', 'agenda');
  const client = clientFrom(vm);

  assert.equal(vm.kind, 'agenda');
  assert.equal(vm.role, 'coach');

  assert.equal(client.experience.stage, 'active');
  assert.equal(client.nextAction.area, 'expediente');

  assertSpanishExperience(client);
});

test('Cliente recibe una acción propia y nunca una tarea interna del Coach', () => {
  const vm = route('client', 'hoy');
  const client = clientFrom(vm);

  assert.equal(vm.role, 'client');

  assert.equal(client.experience.stage, 'active');
  assert.equal(client.nextAction.key, 'view_next_appointment');
  assert.equal(client.nextAction.label, 'Ver próxima cita');
  assert.equal(client.nextAction.area, 'agenda');

  assert.doesNotMatch(client.nextAction.label, /IRI/i);
  assertSpanishExperience(client);
});