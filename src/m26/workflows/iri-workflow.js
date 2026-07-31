import { scoreIriPerformance } from '../norms/iri-scoring.js';
import { validateIriProfile } from './iri-profile.js';

const REQUIRED = [
  'clientId',
  'assessmentDate',
  'sexForNorms',
];
const NORM_ENGINE_VERSION = 'm26-rc5.1';

function finite(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value));
}

function hasObjectiveMeasurement(value) {
  if (finite(value)) return Number(value) >= 0;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(hasObjectiveMeasurement);
}

function coreDomainCoverage(draft = {}) {
  const bodySkipped = draft.bodyComposition?.skipped === true;
  const strengthSkipped = draft.strengthAssessment?.skipped === true || draft.strengthPatterns?.skipped === true;
  const cardioSkipped = draft.cardio?.skipped === true;
  const bodyMeasured = !bodySkipped && hasObjectiveMeasurement(draft.bodyComposition);
  const strengthMeasured = !strengthSkipped && hasObjectiveMeasurement(draft.strengthPatterns);
  const cardioMeasured = !cardioSkipped && finite(draft.stepFinalHr) && finite(draft.stepOneMinuteHr);
  const states = Object.freeze({
    bodyComposition: bodyMeasured,
    strength: strengthMeasured,
    cardio: cardioMeasured,
  });
  const measured = Object.values(states).filter(Boolean).length;
  return Object.freeze({
    states,
    measured,
    required: 2,
    complete: measured >= 2,
    skipped: Object.freeze({bodyComposition:bodySkipped,strength:strengthSkipped,cardio:cardioSkipped}),
  });
}

export function computeDeltaFc(finalHr, oneMinuteHr) {
  if (!finite(finalHr) || !finite(oneMinuteHr)) {
    throw new Error('M26_IRI_HR_REQUIRED');
  }
  return Number(finalHr) - Number(oneMinuteHr);
}

export function validateIriDraft(draft = {}) {
  const errors = [];

  for (const key of REQUIRED) {
    if (
      draft[key] === null ||
      draft[key] === undefined ||
      draft[key] === '' ||
      (Array.isArray(draft[key]) && !draft[key].length)
    ) {
      errors.push(key);
    }
  }

  const coverage = coreDomainCoverage(draft);
  if (!coverage.complete) errors.push('coreDomains');

  if (!coverage.skipped.cardio) {
    if (!finite(draft.stepFinalHr) || !finite(draft.stepOneMinuteHr)) {
      errors.push('cardioHeartRate');
    } else if (computeDeltaFc(draft.stepFinalHr, draft.stepOneMinuteHr) < 0) {
      errors.push('deltaFc');
    }
  }
  if (!coverage.skipped.strength && !hasObjectiveMeasurement(draft.strengthPatterns)) {
    errors.push('strengthPatterns');
  }
  if (!coverage.skipped.bodyComposition && !hasObjectiveMeasurement(draft.bodyComposition)) {
    errors.push('bodyComposition');
  }

  const profile = validateIriProfile(draft, draft.assessmentDate);
  errors.push(...profile.errors);

  return {
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
    coverage,
  };
}

export function buildIriCommand(draft, revision = 0) {
  if (!draft?.id) throw new Error('M26_IRI_REMOTE_ENTITY_REQUIRED');

  const check = validateIriDraft(draft);
  if (!check.ok) {
    throw new Error(`M26_IRI_INVALID:${check.errors.join(',')}`);
  }

  const profile = validateIriProfile(draft, draft.assessmentDate);
  const coverage = check.coverage || coreDomainCoverage(draft);
  const normalized = { ...draft, ageYears: profile.ageYears };
  const scoring = scoreIriPerformance(normalized);

  if (!scoring.context.ok) {
    throw new Error(
      `M26_IRI_NORM_CONTEXT_INVALID:${scoring.context.errors.join(',')}`
    );
  }

  const normContextSnapshot = Object.freeze({
    assessmentDate: draft.assessmentDate,
    birthDate: draft.birthDate || null,
    ageYears: profile.ageYears,
    sexForNorms: draft.sexForNorms,
    normEngineVersion: NORM_ENGINE_VERSION,
  });

  return {
    type: 'IRI_COMPLETAR',
    entityType: 'iri',
    entityId: draft.id,
    clientId: draft.clientId,
    baseRevision: revision,
    payload: {
      patch: {
        ...structuredClone(normalized),
        deltaFc: coverage.skipped.cardio ? null : computeDeltaFc(draft.stepFinalHr, draft.stepOneMinuteHr),
        evidenceCoverage: coverage,
        normContextSnapshot,
        normScoring: scoring,
        normEngineVersion: NORM_ENGINE_VERSION,
      },
    },
  };
}

export function buildIriReportCommand(
  {
    clientId,
    assessmentId,
    reportId,
    visibility = 'coach',
    previewAccepted = true,
  },
  revision = 0
) {
  if (!clientId || !assessmentId || !reportId) {
    throw new Error('M26_IRI_REPORT_CONTEXT_REQUIRED');
  }
  if (!previewAccepted) throw new Error('M26_IRI_REPORT_PREVIEW_REQUIRED');

  return {
    type: 'INFORME_PUBLICAR',
    entityType: 'report',
    entityId: reportId,
    clientId,
    baseRevision: revision,
    previewAccepted: true,
    payload: {
      patch: {
        assessmentId,
        visibility,
        format: 'a4-premium',
        singleReport: true,
      },
    },
  };
}

export const __iriWorkflowInternals = Object.freeze({
  NORM_ENGINE_VERSION,
  finite,
  hasObjectiveMeasurement,
  coreDomainCoverage,
});
