import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeApplicationContextExtension,
  filterSnapshotForAssignmentScope,
} from '../src/m26/shared/integration-context.js';

function snapshot() {
  return {
    data: {
      clients: [
        { id: 'C1', name: 'Uno' },
        { id: 'C2', name: 'Dos' },
      ],
      sessions: [
        { id: 'S1', clientId: 'C1' },
        { id: 'S2', clientId: 'C2' },
      ],
      appointments: [
        { id: 'A1', clientId: 'C1' },
        { id: 'A2', clientId: 'C2' },
      ],
      wearableDailySummaries: [
        { id: 'W1', clientId: 'C1' },
        { id: 'W2', clientId: 'C2' },
      ],
      coachAvailability: [
        { id: 'AV1' },
      ],
    },
  };
}

test('RC46 Coach v2 sin asignaciones recibe cartera vacía', () => {
  const context = normalizeApplicationContextExtension({
    available: true,
    membershipStatus: 'active',
    roles: ['coach'],
    assignmentScopeEnforced: false,
    assignedClientIds: [],
    revision: 2,
  });

  const filtered = filterSnapshotForAssignmentScope(
    snapshot(),
    context,
    'coach'
  );

  assert.deepEqual(filtered.data.clients, []);
  assert.deepEqual(filtered.data.sessions, []);
  assert.deepEqual(filtered.data.appointments, []);
  assert.deepEqual(filtered.data.wearableDailySummaries, []);
  assert.equal(filtered.data.coachAvailability.length, 1);
});

test('RC46 Coach solo conserva datos de clientes asignados', () => {
  const context = normalizeApplicationContextExtension({
    available: true,
    membershipStatus: 'active',
    roles: ['coach'],
    assignmentScopeEnforced: true,
    assignedClientIds: ['C2'],
    revision: 2,
  });

  const filtered = filterSnapshotForAssignmentScope(
    snapshot(),
    context,
    'coach'
  );

  assert.deepEqual(filtered.data.clients.map((x) => x.id), ['C2']);
  assert.deepEqual(filtered.data.sessions.map((x) => x.id), ['S2']);
  assert.deepEqual(filtered.data.appointments.map((x) => x.id), ['A2']);
  assert.deepEqual(
    filtered.data.wearableDailySummaries.map((x) => x.id),
    ['W2']
  );
});

test('RC46 Admin conserva visión organizacional completa', () => {
  const context = normalizeApplicationContextExtension({
    available: true,
    membershipStatus: 'active',
    roles: ['coach','admin'],
    assignmentScopeEnforced: true,
    assignedClientIds: ['C1'],
    revision: 2,
  });

  const filtered = filterSnapshotForAssignmentScope(
    snapshot(),
    context,
    'admin'
  );

  assert.deepEqual(
    filtered.data.clients.map((x) => x.id),
    ['C1','C2']
  );
});

test('RC46 mantiene compatibilidad con backend v1 durante despliegue', () => {
  const context = normalizeApplicationContextExtension({
    available: true,
    membershipStatus: 'active',
    roles: ['coach'],
    assignmentScopeEnforced: false,
    assignedClientIds: [],
    revision: 1,
  });

  const filtered = filterSnapshotForAssignmentScope(
    snapshot(),
    context,
    'coach'
  );

  assert.deepEqual(
    filtered.data.clients.map((x) => x.id),
    ['C1','C2']
  );
});

test('migración RC46 contiene backfill protegido y scope backend estricto', () => {
  const sql = readFileSync(
    'supabase/migrations/20260809185000_rc46_strict_coach_assignment_scope.sql',
    'utf8'
  );

  assert.match(
    sql,
    /create or replace function public\.is_assigned_coach\s*\(\s*target_client uuid/i
  );

  assert.match(
    sql,
    /a\.coach_user_id\s*=\s*auth\.uid\(\)/i
  );

  assert.match(
    sql,
    /v_assignment_rows\s*=\s*0/i
  );

  assert.match(
    sql,
    /cardinality\(v_coaches\)\s*=\s*1/i
  );

  assert.match(
    sql,
    /'assignmentScopeEnforced',\s*coalesce\(v_enforced,false\)/i
  );

  assert.match(
    sql,
    /'revision',\s*2/i
  );
});