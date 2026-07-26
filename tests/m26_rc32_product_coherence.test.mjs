import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createProductionState } from '../src/m26/production-state.js';
import { createShellViewModel } from '../src/m26/shell/shell-view-model.js';
import { createRouteViewModel } from '../src/m26/modules/route-view-model.js';
import { renderRouteView } from '../src/m26/modules/route-render.js';
import {
  normalizeClientProfile,
  normalizeSexForNorms,
} from '../src/m26/domain/client-profile.js';
import { projectCollectionsForRole } from '../src/m26/security/role-projection.js';
import { buildIriCommand } from '../src/m26/workflows/iri-workflow.js';
import {
  normalizeWearableProvider,
  providerReadiness,
} from '../src/m26/wearables/contracts.js';
import { wearableZeroCostPolicy } from '../src/m26/wearables/free-policy.js';

const clientId = 'CLI-RC32-A';
const now = new Date('2026-07-26T14:00:00-04:00');

function state(area = 'hoy') {
  return createProductionState({
    hydration: {
      status: 'ready',
      confirmedAt: now.toISOString(),
      serverTime: now.toISOString(),
    },
    identity: { id: 'COACH-RC32', role: 'coach', name: 'Coach RC32' },
    activeArea: area,
    selectedClientId: clientId,
    collections: {
      ...createProductionState().collections,
      clients: [
        {
          id: clientId,
          name: 'Cliente RC32',
          modality: 'hibrido',
          status: 'activo',
        },
      ],
      clientProfiles: [
        {
          id: 'PROFILE-RC32',
          clientId,
          birthDate: '1990-02-20',
          sexForNorms: 'female',
          email: 'cliente@example.com',
          phone: '+56 9 1234 5678',
          modality: 'hibrido',
          trainingAddress: 'Av. IBERFIT 123',
          commune: 'Las Condes',
          equipmentAvailable: ['TRX', 'Mancuernas'],
        },
      ],
      clientAccess: [],
      iriAssessments: [
        {
          id: 'IRI-RC32',
          clientId,
          assessmentDate: '2026-07-25',
          status: 'completado',
          score: 80,
          classification: 'Performance',
          stepFinalHr: 150,
          stepOneMinuteHr: 110,
          bodyComposition: { bodyFatPercent: 25 },
          strengthPatterns: { push: 12, lower: 18 },
          sexForNorms: 'female',
          ageYears: 36,
          normScoring: { context: { ok: true } },
        },
      ],
      appointments: [
        {
          id: 'PROPOSAL-RC32',
          clientId,
          title: 'Propuesta interna',
          status: 'propuesta',
          visibleToClient: false,
          startAt: '2026-07-26T18:00:00.000Z',
          modality: 'online',
        },
        {
          id: 'CONFIRMED-RC32',
          clientId,
          title: 'Sesión confirmada',
          status: 'confirmada',
          startAt: '2026-07-26T20:00:00.000Z',
          modality: 'presencial',
          location: 'Av. IBERFIT 123',
        },
      ],
    },
  });
}

test('perfil canónico conserva baremo, contacto y logística sin duplicar notas privadas', () => {
  const profile = normalizeClientProfile({
    birth_date: '1990-02-20',
    sexo_baremos: 'mujer',
    correo: 'CLIENTE@EXAMPLE.COM',
    telefono: '+56 9 1234 5678',
    modalidad: 'hibrido',
    direccion_entrenamiento: 'Av. IBERFIT 123',
    comuna: 'Las Condes',
  });

  assert.equal(normalizeSexForNorms('mujer'), 'female');
  assert.equal(profile.sexForNorms, 'female');
  assert.equal(profile.email, 'cliente@example.com');
  assert.equal(profile.phone, '+56 9 1234 5678');
  assert.equal(profile.trainingAddress, 'Av. IBERFIT 123');
  assert.equal(profile.logisticsRequired, true);
  assert.equal(profile.missing.length, 0);
});

test('proyección Cliente incluye su contacto y logística, pero no notas privadas', () => {
  const projected = projectCollectionsForRole(
    {
      clients: [{ id: clientId, name: 'Cliente RC32' }],
      clientProfiles: [
        {
          id: 'PROFILE-RC32',
          clientId,
          sexForNorms: 'female',
          email: 'cliente@example.com',
          phone: '+56 9 1234 5678',
          trainingAddress: 'Av. IBERFIT 123',
          privateNotes: 'NO COMPARTIR',
        },
      ],
      privateNotes: [{ id: 'PRIVATE', clientId, text: 'NO COMPARTIR' }],
    },
    { id: 'USER-RC32', role: 'client', clientId }
  );

  assert.equal(projected.clientProfiles[0].email, 'cliente@example.com');
  assert.equal(projected.clientProfiles[0].phone, '+56 9 1234 5678');
  assert.equal(projected.clientProfiles[0].trainingAddress, 'Av. IBERFIT 123');
  assert.equal(projected.clientProfiles[0].privateNotes, undefined);
  assert.deepEqual(projected.privateNotes, []);
});

test('Hoy separa propuestas de sesiones confirmadas', () => {
  const source = state('hoy');
  const vm = createRouteViewModel(createShellViewModel(source), source, now);
  const html = renderRouteView(vm);

  assert.deepEqual(vm.appointments.map((item) => item.id), ['CONFIRMED-RC32']);
  assert.deepEqual(vm.proposals.map((item) => item.id), ['PROPOSAL-RC32']);
  assert.match(html, /Sesiones confirmadas hoy/);
  assert.match(html, /Propuestas de hoy/);
  assert.match(html, /1 propuesta/);
  assert.doesNotMatch(html, /Agenda confirmada/);
});

test('expediente e IRI eliminan score global y muestran contexto útil', () => {
  for (const area of ['expediente', 'iri']) {
    const source = state(area);
    const vm = createRouteViewModel(createShellViewModel(source), source, now);
    const html = renderRouteView(vm);

    assert.doesNotMatch(html, /IRI 80|Performance/);
    assert.match(html, /Correo electrónico/);
    assert.match(html, /Teléfono/);
    assert.match(html, /Dirección de entrenamiento/);
    assert.match(html, /Sexo utilizado para baremos/);
  }
});

test('comando IRI conserva un snapshot inmutable del contexto de baremo', () => {
  const command = buildIriCommand(
    {
      id: 'IRI-RC32',
      clientId,
      assessmentDate: '2026-07-26',
      birthDate: '1990-02-20',
      sexForNorms: 'female',
      stepFinalHr: 150,
      stepOneMinuteHr: 110,
      pushUps: 12,
      chairStand30s: 18,
      bodyComposition: { bodyFatPercent: 25 },
      strengthPatterns: { push: 12, lower: 18 },
    },
    3
  );

  assert.equal(command.baseRevision, 3);
  assert.equal(command.payload.patch.normContextSnapshot.sexForNorms, 'female');
  assert.equal(command.payload.patch.normContextSnapshot.birthDate, '1990-02-20');
  assert.equal(command.payload.patch.normContextSnapshot.ageYears, 36);
  assert.equal(
    command.payload.patch.normContextSnapshot.normEngineVersion,
    command.payload.patch.normEngineVersion
  );
});

test('wearables incluyen Samsung Health y Strava sin fingir conexión activa', () => {
  assert.equal(normalizeWearableProvider('Samsung Health'), 'samsung_health');
  assert.equal(normalizeWearableProvider('Strava'), 'strava');
  assert.equal(wearableZeroCostPolicy('samsung_health').productionAllowed, false);
  assert.equal(wearableZeroCostPolicy('strava').productionAllowed, false);

  const providers = providerReadiness({});
  assert.equal(providers.find((item) => item.key === 'samsung_health').available, false);
  assert.equal(providers.find((item) => item.key === 'strava').available, false);
});

test('build y runtime empaquetan solo mapa e imágenes RepDB', () => {
  const build = fs.readFileSync(
    new URL('../scripts/build_rc29_prepublication_candidate.mjs', import.meta.url),
    'utf8'
  );
  const runtime = fs.readFileSync(
    new URL('../scripts/generate_rc32_runtime_config.mjs', import.meta.url),
    'utf8'
  );

  assert.match(build, /copy\(MEDIA_MAP_PATH, MEDIA_MAP_PATH\)/);
  assert.match(build, /public\/vendor\/repdb\/images\/flat/);
  assert.doesNotMatch(
    build,
    /copy\('public\/vendor\/repdb', 'public\/vendor\/repdb'\)/
  );

  for (const source of [build, runtime]) {
    assert.match(source, /unexpectedRepdbFiles/);
    assert.match(source, /mediaMapBytes/);
    assert.match(source, /coreBytes/);
    assert.match(source, /mediaBytes/);
    assert.match(source, /MEDIA_FILE_LIMIT/);
  }
});

test('CSS RC32 contiene reglas explícitas contra desbordes y solapamientos', () => {
  const css = fs.readFileSync(
    new URL('../src/m26/shell/shell.css', import.meta.url),
    'utf8'
  );

  assert.match(css, /\.m26-route,\.m26-route \*\{min-width:0\}/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /\.m26-profile-sections/);
  assert.match(css, /@media\(max-width:420px\)/);
});
