import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateIriScore,
  createIriAssessment,
  synchronizeIriDerivedFields,
} from '../baseline_m25_2/src/iri.js';

function assessmentFixture() {
  const requiredPlan = {
    prioridad1: 'Consolidar fuerza global',
    modalidadSugerida: 'Híbrido',
    frecuenciaSugerida: '3 veces por semana',
    reevaluacion: '2026-08-18',
  };
  return createIriAssessment({
    clientId: '57339e70-7a99-48d6-820f-7d4a51f89d9d',
    sections: {
      contexto: { objetivo: 'Mejorar rendimiento', antecedentes: 'Sin restricciones declaradas', disponibilidad: '3 días' },
      composicion: { peso: '70', talla: '170', condiciones: 'Mañana, ayuno, mismo equipo' },
      movilidad: {
        tobilloIzq: '3.75', tobilloDer: '3.75',
        caderaIzq: '3.75', caderaDer: '3.75',
        hombroIzq: '3.75', hombroDer: '3.75',
      },
      fuerza: {
        traccionTest: 'Remo', traccionCalidad: '4',
        empujeTest: 'Flexión', empujeCalidad: '4',
        bisagraTest: 'Peso muerto rumano', bisagraCalidad: '4',
        sentadillaTest: 'Goblet', sentadillaCalidad: '4',
        rotacionTest: 'Pallof', rotacionCalidad: '4',
      },
      capacidad: { protocolo: 'Step test 3 minutos', fcFinal: '160', fcMinuto: '138', rpe: '7' },
      interpretacion: {
        fortalezas: 'Respuesta global consistente',
        limitadores: 'Mantener control técnico',
        clasificacion: 'Performance',
        criterio: 'Lectura previa',
        score: '78',
        calidadDatos: 'media',
      },
      planAccion: requiredPlan,
    },
  });
}

test('M25.2 reproduce 78→80 y sincroniza la lectura antes de persistir', () => {
  const full = assessmentFixture();
  const partial = structuredClone(full);
  partial.sections.planAccion = {
    ...partial.sections.planAccion,
    prioridad1: '', modalidadSugerida: '', frecuenciaSugerida: '', reevaluacion: '',
  };
  assert.equal(calculateIriScore(partial).score, 78);
  assert.equal(calculateIriScore(partial).dataQuality, 'media');
  assert.equal(calculateIriScore(full).score, 80);
  assert.equal(calculateIriScore(full).dataQuality, 'alta');
  const synced = synchronizeIriDerivedFields(full);
  assert.equal(synced.sections.interpretacion.score, 80);
  assert.equal(synced.sections.interpretacion.calidadDatos, 'alta');
  assert.equal(synced.sections.interpretacion.clasificacion, 'Performance');
});

test('clasificación manual solo prevalece con override explícito', () => {
  const assessment = assessmentFixture();
  assessment.sections.interpretacion.overrideManual = true;
  assessment.sections.interpretacion.clasificacion = 'Progreso';
  assessment.sections.interpretacion.motivoOverride = 'Criterio profesional documentado';
  const synced = synchronizeIriDerivedFields(assessment);
  assert.equal(synced.sections.interpretacion.clasificacion, 'Progreso');
  assert.equal(synced.sections.interpretacion.motivoOverride, 'Criterio profesional documentado');
});
