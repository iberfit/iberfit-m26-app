export const IRI_PROTOCOL_VERSION = '3.0.0';

export const IRI_SECTION_ORDER = Object.freeze([
  'contexto',
  'composicion',
  'movilidad',
  'fuerza',
  'capacidad',
  'interpretacion',
  'planAccion',
]);

export const IRI_STRENGTH_PATTERNS = Object.freeze([
  'traccion',
  'empuje',
  'bisagra',
  'sentadilla',
  'rotacion',
]);

export const IRI_SECTION_META = Object.freeze({
  contexto: {
    title: 'Contexto y objetivos',
    subtitle: 'Qué necesita la persona, qué limita el proceso y en qué condiciones puede entrenar.',
  },
  composicion: {
    title: 'Composición corporal',
    subtitle: 'Registro comparable y contextualizado. No se interpreta de forma aislada.',
  },
  movilidad: {
    title: 'Movilidad',
    subtitle: 'Observación bilateral de los rangos que condicionan la ejecución.',
  },
  fuerza: {
    title: 'Fuerza por patrón',
    subtitle: 'Tracción, empuje, bisagra, sentadilla y rotación/anti-rotación.',
  },
  capacidad: {
    title: 'Acondicionamiento',
    subtitle: 'Respuesta al protocolo y recuperación mediante ΔFC = FC final − FC al minuto.',
  },
  interpretacion: {
    title: 'Lectura IBERFIT',
    subtitle: 'Síntesis del Coach: fortalezas, limitadores, clasificación y criterio.',
  },
  planAccion: {
    title: 'Plan de acción',
    subtitle: 'Prioridades concretas, modalidad, frecuencia y momento de reevaluación.',
  },
});

const QUALITATIVE_SCORE = Object.freeze({
  'muy limitada': 1,
  limitada: 1,
  inicial: 1,
  baja: 1,
  'requiere apoyo': 1,
  parcial: 2,
  mejorable: 2,
  media: 3,
  adecuado: 4,
  adecuada: 4,
  buena: 4,
  alto: 4,
  alta: 4,
  sólido: 5,
  solido: 5,
  excelente: 5,
});

function text(value) {
  return String(value ?? '').trim();
}

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `IRI-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function qualitativeScore(value) {
  const numeric = finiteNumber(value);
  if (numeric != null) return clamp(numeric, 1, 5);
  const normalized = text(value).toLowerCase();
  if (!normalized) return null;
  return QUALITATIVE_SCORE[normalized] ?? null;
}

function mobilitySideScore(section, joint) {
  const left = qualitativeScore(section?.[`${joint}Izq`]);
  const right = qualitativeScore(section?.[`${joint}Der`]);
  const legacy = qualitativeScore(section?.[joint]);
  const values = [left, right].filter((value) => value != null);
  if (values.length) return values.reduce((sum, value) => sum + value, 0) / values.length;
  return legacy;
}

function patternScore(section, pattern) {
  const quality = qualitativeScore(section?.[`${pattern}Calidad`]);
  if (quality != null) return quality;
  return qualitativeScore(section?.[pattern]);
}

export function calculateDeltaFc(fcFinal, fcMinuto) {
  const finalValue = finiteNumber(fcFinal);
  const minuteValue = finiteNumber(fcMinuto);
  if (finalValue == null || minuteValue == null) return null;
  return finalValue - minuteValue;
}

export function calculateBmi(weightKg, heightCm) {
  const weight = finiteNumber(weightKg);
  const height = finiteNumber(heightCm);
  if (weight == null || height == null || weight <= 0 || height <= 0) return null;
  const meters = height / 100;
  return Math.round((weight / (meters * meters)) * 10) / 10;
}

function buildStrengthDefaults(input = {}) {
  const defaults = {};
  for (const pattern of IRI_STRENGTH_PATTERNS) {
    defaults[pattern] = '';
    defaults[`${pattern}Test`] = '';
    defaults[`${pattern}Carga`] = '';
    defaults[`${pattern}Reps`] = '';
    defaults[`${pattern}Rpe`] = '';
    defaults[`${pattern}Calidad`] = '';
    defaults[`${pattern}Dolor`] = '0';
    defaults[`${pattern}Observaciones`] = '';
  }
  return { ...defaults, ...input };
}

export function createIriAssessment(input = {}) {
  const now = new Date().toISOString();
  const capacity = {
    fcReposo: '',
    fcFinal: '',
    fcMinuto: '',
    deltaFc: '',
    protocolo: 'Step test 3 minutos',
    duracion: '3',
    rpe: '',
    resultado: '',
    observaciones: '',
    ...input.sections?.capacidad,
  };
  capacity.deltaFc = calculateDeltaFc(capacity.fcFinal, capacity.fcMinuto) ?? capacity.deltaFc;

  const composition = {
    peso: '',
    talla: '',
    imc: '',
    grasa: '',
    masaMuscular: '',
    cintura: '',
    condiciones: '',
    dispositivo: '',
    observaciones: '',
    ...input.sections?.composicion,
  };
  composition.imc = calculateBmi(composition.peso, composition.talla) ?? composition.imc;

  return {
    id: input.id || uuid(),
    clientId: input.clientId || null,
    assessmentType: input.assessmentType || 'inicial',
    protocolVersion: input.protocolVersion || IRI_PROTOCOL_VERSION,
    currentStep: IRI_SECTION_ORDER.includes(input.currentStep) ? input.currentStep : 'contexto',
    status: input.status || 'borrador',
    revision: Number(input.revision || 0),
    evaluatedAt: input.evaluatedAt || new Date().toISOString().slice(0, 10),
    startedAt: input.startedAt || now,
    completedAt: input.completedAt || null,
    approvedAt: input.approvedAt || null,
    approvedBy: input.approvedBy || null,
    publishedAt: input.publishedAt || null,
    sections: {
      contexto: {
        objetivo: '',
        objetivosSecundarios: '',
        antecedentes: '',
        restricciones: '',
        limitadores: '',
        experiencia: '',
        frecuenciaActual: '',
        disponibilidad: '',
        sueno: '',
        estres: '',
        dolor: '0',
        observaciones: '',
        ...input.sections?.contexto,
      },
      composicion: composition,
      movilidad: {
        tobillo: '', cadera: '', hombro: '',
        tobilloIzq: '', tobilloDer: '',
        caderaIzq: '', caderaDer: '',
        hombroIzq: '', hombroDer: '',
        observaciones: '',
        ...input.sections?.movilidad,
      },
      fuerza: buildStrengthDefaults(input.sections?.fuerza),
      capacidad: capacity,
      interpretacion: {
        fortalezas: '',
        limitadores: '',
        clasificacion: '',
        criterio: '',
        score: '',
        calidadDatos: '',
        overrideManual: false,
        motivoOverride: '',
        ...input.sections?.interpretacion,
      },
      planAccion: {
        prioridad1: '',
        prioridad2: '',
        prioridad3: '',
        modalidadSugerida: '',
        frecuenciaSugerida: '',
        reevaluacion: '',
        acciones: '',
        ...input.sections?.planAccion,
      },
    },
    updatedAt: input.updatedAt || now,
    remote: Boolean(input.remote),
    remoteSavedAt: input.remoteSavedAt || null,
  };
}

export function normalizeIriAssessment(input = {}) {
  return createIriAssessment(input);
}

export function iriCurrentStepIndex(assessment) {
  return Math.max(0, IRI_SECTION_ORDER.indexOf(assessment?.currentStep));
}

export function setIriStep(assessment, step) {
  if (!IRI_SECTION_ORDER.includes(step)) throw new Error(`Sección IRI inválida: ${step}`);
  return {
    ...assessment,
    currentStep: step,
    updatedAt: new Date().toISOString(),
  };
}

export function nextIriStep(assessment) {
  const index = iriCurrentStepIndex(assessment);
  return setIriStep(assessment, IRI_SECTION_ORDER[Math.min(IRI_SECTION_ORDER.length - 1, index + 1)]);
}

export function previousIriStep(assessment) {
  const index = iriCurrentStepIndex(assessment);
  return setIriStep(assessment, IRI_SECTION_ORDER[Math.max(0, index - 1)]);
}

export function updateIriField(assessment, section, field, value) {
  if (['aprobado', 'publicado', 'retirado'].includes(assessment?.status)) throw new Error('El IRI aprobado es inmutable; crea una reevaluación para registrar cambios');
  if (!IRI_SECTION_ORDER.includes(section)) throw new Error(`Sección IRI inválida: ${section}`);
  if (!assessment?.sections?.[section]) throw new Error(`No existe la sección IRI: ${section}`);
  const nextSection = { ...assessment.sections[section], [field]: value };
  if (section === 'capacidad' && ['fcFinal', 'fcMinuto'].includes(field)) {
    nextSection.deltaFc = calculateDeltaFc(
      field === 'fcFinal' ? value : nextSection.fcFinal,
      field === 'fcMinuto' ? value : nextSection.fcMinuto,
    );
  }
  if (section === 'composicion' && ['peso', 'talla'].includes(field)) {
    nextSection.imc = calculateBmi(
      field === 'peso' ? value : nextSection.peso,
      field === 'talla' ? value : nextSection.talla,
    );
  }
  return {
    ...assessment,
    revision: Number(assessment.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    sections: { ...assessment.sections, [section]: nextSection },
  };
}

const REQUIRED_FIELDS = Object.freeze({
  contexto: ['objetivo', 'antecedentes', 'disponibilidad'],
  composicion: ['peso', 'condiciones'],
  movilidad: ['tobilloIzq', 'tobilloDer', 'caderaIzq', 'caderaDer', 'hombroIzq', 'hombroDer'],
  fuerza: IRI_STRENGTH_PATTERNS.flatMap((pattern) => [`${pattern}Test`, `${pattern}Calidad`]),
  capacidad: ['protocolo', 'fcFinal', 'fcMinuto', 'rpe'],
  interpretacion: ['fortalezas', 'limitadores', 'clasificacion', 'criterio'],
  planAccion: ['prioridad1', 'modalidadSugerida', 'frecuenciaSugerida', 'reevaluacion'],
});

function fieldPresent(assessment, section, field) {
  const value = assessment.sections?.[section]?.[field];
  if (text(value)) return true;
  if (section === 'movilidad' && /^(tobillo|cadera|hombro)(Izq|Der)$/.test(field)) {
    const joint = field.replace(/(Izq|Der)$/, '');
    return text(assessment.sections?.movilidad?.[joint]) !== '';
  }
  if (section === 'fuerza' && field.endsWith('Test')) {
    const pattern = field.replace(/Test$/, '');
    return text(assessment.sections?.fuerza?.[pattern]) !== '';
  }
  if (section === 'fuerza' && field.endsWith('Calidad')) {
    const pattern = field.replace(/Calidad$/, '');
    return text(assessment.sections?.fuerza?.[pattern]) !== '';
  }
  return false;
}

export function iriSectionCompleteness(assessment, section) {
  if (!IRI_SECTION_ORDER.includes(section)) throw new Error(`Sección IRI inválida: ${section}`);
  const required = REQUIRED_FIELDS[section] || [];
  const complete = required.filter((field) => fieldPresent(assessment, section, field));
  const missing = required.filter((field) => !fieldPresent(assessment, section, field));
  return {
    section,
    total: required.length,
    complete: complete.length,
    ratio: required.length ? complete.length / required.length : 1,
    missing,
  };
}

export function iriCompleteness(assessment) {
  const sections = IRI_SECTION_ORDER.map((section) => iriSectionCompleteness(assessment, section));
  const total = sections.reduce((sum, item) => sum + item.total, 0);
  const complete = sections.reduce((sum, item) => sum + item.complete, 0);
  return {
    total,
    complete,
    ratio: total ? complete / total : 0,
    missing: sections.flatMap((item) => item.missing.map((field) => `${item.section}.${field}`)),
    sections,
  };
}

export function validateIriSection(assessment, section) {
  const completeness = iriSectionCompleteness(assessment, section);
  const errors = [];
  if (completeness.missing.length) errors.push(`Faltan ${completeness.missing.length} campos obligatorios`);

  if (section === 'contexto') {
    const pain = finiteNumber(assessment.sections.contexto.dolor);
    if (pain != null && (pain < 0 || pain > 10)) errors.push('Dolor debe estar entre 0 y 10');
  }
  if (section === 'composicion') {
    const weight = finiteNumber(assessment.sections.composicion.peso);
    const height = finiteNumber(assessment.sections.composicion.talla);
    if (weight != null && weight <= 0) errors.push('Peso inválido');
    if (height != null && height <= 0) errors.push('Talla inválida');
  }
  if (section === 'fuerza') {
    for (const pattern of IRI_STRENGTH_PATTERNS) {
      const quality = qualitativeScore(assessment.sections.fuerza[`${pattern}Calidad`] || assessment.sections.fuerza[pattern]);
      if (quality != null && (quality < 1 || quality > 5)) errors.push(`Calidad de ${pattern} debe estar entre 1 y 5`);
      const pain = finiteNumber(assessment.sections.fuerza[`${pattern}Dolor`]);
      if (pain != null && (pain < 0 || pain > 10)) errors.push(`Dolor de ${pattern} debe estar entre 0 y 10`);
    }
  }
  if (section === 'capacidad') {
    const delta = calculateDeltaFc(assessment.sections.capacidad.fcFinal, assessment.sections.capacidad.fcMinuto);
    if (delta == null) errors.push('No se puede calcular ΔFC');
    if (delta != null && delta < 0) errors.push('FC al minuto no debe ser mayor que FC final');
    const rpe = finiteNumber(assessment.sections.capacidad.rpe);
    if (rpe != null && (rpe < 0 || rpe > 10)) errors.push('RPE debe estar entre 0 y 10');
  }
  if (section === 'interpretacion' && assessment.sections.interpretacion.overrideManual && !text(assessment.sections.interpretacion.motivoOverride)) {
    errors.push('La clasificación manual necesita una justificación');
  }

  return { ok: errors.length === 0, errors, completeness };
}

function capacityRecoveryScore(delta) {
  if (delta == null || delta < 0) return null;
  if (delta >= 30) return 100;
  if (delta >= 20) return 75;
  if (delta >= 12) return 50;
  return 25;
}

function scoreClassification(score) {
  if (score >= 75) return 'Performance';
  if (score >= 50) return 'Progreso';
  return 'Base';
}

function dataQualityLabel(completeness) {
  if (completeness.ratio >= 0.95) return 'alta';
  if (completeness.ratio >= 0.75) return 'media';
  return 'insuficiente';
}

export function calculateIriScore(assessment) {
  const mobilityValues = ['tobillo', 'cadera', 'hombro']
    .map((joint) => mobilitySideScore(assessment.sections.movilidad, joint))
    .filter((value) => value != null);
  const strengthValues = IRI_STRENGTH_PATTERNS
    .map((pattern) => patternScore(assessment.sections.fuerza, pattern))
    .filter((value) => value != null);
  const delta = calculateDeltaFc(assessment.sections.capacidad.fcFinal, assessment.sections.capacidad.fcMinuto);
  const capacity = capacityRecoveryScore(delta);
  const completeness = iriCompleteness(assessment);

  const mobility = mobilityValues.length
    ? (mobilityValues.reduce((sum, value) => sum + value, 0) / mobilityValues.length) * 20
    : null;
  const strength = strengthValues.length
    ? (strengthValues.reduce((sum, value) => sum + value, 0) / strengthValues.length) * 20
    : null;
  const components = [
    mobility == null ? null : { key: 'movilidad', score: mobility, weight: 0.25 },
    strength == null ? null : { key: 'fuerza', score: strength, weight: 0.4 },
    capacity == null ? null : { key: 'capacidad', score: capacity, weight: 0.25 },
    { key: 'calidadDatos', score: completeness.ratio * 100, weight: 0.1 },
  ].filter(Boolean);

  const usedWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const score = usedWeight
    ? Math.round(components.reduce((sum, item) => sum + item.score * item.weight, 0) / usedWeight)
    : null;
  const automaticClassification = score == null ? '' : scoreClassification(score);
  const manual = Boolean(assessment.sections.interpretacion.overrideManual);
  const selectedClassification = manual && text(assessment.sections.interpretacion.clasificacion)
    ? assessment.sections.interpretacion.clasificacion
    : automaticClassification;

  return {
    score,
    classification: selectedClassification,
    automaticClassification,
    dataQuality: dataQualityLabel(completeness),
    deltaFc: delta,
    components,
    methodology: `IRI ${assessment.protocolVersion || IRI_PROTOCOL_VERSION} · puntuación interna de rendimiento, no diagnóstico médico`,
  };
}

function strengthSnapshot(assessment) {
  return IRI_STRENGTH_PATTERNS.map((pattern) => ({
    pattern,
    test: assessment.sections.fuerza[`${pattern}Test`] || assessment.sections.fuerza[pattern] || '',
    load: finiteNumber(assessment.sections.fuerza[`${pattern}Carga`]),
    reps: finiteNumber(assessment.sections.fuerza[`${pattern}Reps`]),
    rpe: finiteNumber(assessment.sections.fuerza[`${pattern}Rpe`]),
    quality: qualitativeScore(assessment.sections.fuerza[`${pattern}Calidad`] || assessment.sections.fuerza[pattern]),
    pain: finiteNumber(assessment.sections.fuerza[`${pattern}Dolor`]),
    observations: assessment.sections.fuerza[`${pattern}Observaciones`] || '',
  }));
}

export function deriveIriInterpretation(assessment) {
  const scoring = calculateIriScore(assessment);
  const strength = strengthSnapshot(assessment);
  const strongest = [...strength].filter((item) => item.quality != null).sort((a, b) => b.quality - a.quality)[0];
  const weakest = [...strength].filter((item) => item.quality != null).sort((a, b) => a.quality - b.quality)[0];
  const strengths = strongest ? `Mejor respuesta relativa en ${strongest.pattern}.` : '';
  const limiters = weakest ? `Prioridad técnica relativa en ${weakest.pattern}.` : '';
  const criterion = scoring.score == null
    ? 'Completar los datos obligatorios antes de emitir una lectura IBERFIT.'
    : `Puntuación interna ${scoring.score}/100, clasificación ${scoring.classification} y calidad de datos ${scoring.dataQuality}.`;
  return { ...scoring, strengths, limiters, criterion };
}

export function applyDerivedIriInterpretation(assessment) {
  const derived = deriveIriInterpretation(assessment);
  const section = assessment.sections.interpretacion;
  const nextSection = {
    ...section,
    fortalezas: text(section.fortalezas) || derived.strengths,
    limitadores: text(section.limitadores) || derived.limiters,
    clasificacion: section.overrideManual && text(section.clasificacion) ? section.clasificacion : derived.classification,
    criterio: text(section.criterio) || derived.criterion,
    score: derived.score ?? '',
    calidadDatos: derived.dataQuality,
  };
  return {
    ...assessment,
    revision: Number(assessment.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
    sections: { ...assessment.sections, interpretacion: nextSection },
  };
}

export function validateIriAssessment(assessment) {
  const completeness = iriCompleteness(assessment);
  const errors = [];
  if (!assessment.clientId) errors.push('Falta cliente');
  for (const section of IRI_SECTION_ORDER) {
    const gate = validateIriSection(assessment, section);
    for (const error of gate.errors) errors.push(`${IRI_SECTION_META[section].title}: ${error}`);
  }
  const scoring = calculateIriScore(assessment);
  if (scoring.score == null) errors.push('No se puede calcular la puntuación IRI');
  return { ok: errors.length === 0, errors, completeness, deltaFc: scoring.deltaFc, scoring };
}

export function approveIriAssessment(assessment, actor = 'coach', actorUserId = null) {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede aprobar el IRI');
  const interpreted = applyDerivedIriInterpretation(assessment);
  const gate = validateIriAssessment(interpreted);
  if (!gate.ok) throw new Error(gate.errors.join(' · '));
  const now = new Date().toISOString();
  return {
    ...interpreted,
    status: 'aprobado',
    currentStep: 'planAccion',
    revision: interpreted.revision + 1,
    completedAt: interpreted.completedAt || now,
    approvedAt: now,
    approvedBy: actorUserId,
    updatedAt: now,
  };
}

export function publishIriAssessment(assessment, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede publicar el IRI');
  if (assessment.status !== 'aprobado') throw new Error('El IRI debe estar aprobado antes de publicarse');
  const now = new Date().toISOString();
  return { ...assessment, status: 'publicado', revision: assessment.revision + 1, publishedAt: now, updatedAt: now };
}

export function compareIriAssessments(current, previous) {
  if (!current || !previous) return null;
  const currentScore = calculateIriScore(current);
  const previousScore = calculateIriScore(previous);
  const currentStrength = strengthSnapshot(current);
  const previousStrength = strengthSnapshot(previous);
  const byPattern = IRI_STRENGTH_PATTERNS.map((pattern) => {
    const now = currentStrength.find((item) => item.pattern === pattern);
    const before = previousStrength.find((item) => item.pattern === pattern);
    return {
      pattern,
      previous: before?.quality ?? null,
      current: now?.quality ?? null,
      delta: now?.quality != null && before?.quality != null ? now.quality - before.quality : null,
    };
  });
  return {
    currentId: current.id,
    previousId: previous.id,
    scorePrevious: previousScore.score,
    scoreCurrent: currentScore.score,
    scoreDelta: currentScore.score != null && previousScore.score != null ? currentScore.score - previousScore.score : null,
    deltaFcPrevious: previousScore.deltaFc,
    deltaFcCurrent: currentScore.deltaFc,
    deltaFcChange: previousScore.deltaFc != null && currentScore.deltaFc != null ? currentScore.deltaFc - previousScore.deltaFc : null,
    byPattern,
    evaluatedAtPrevious: previous.evaluatedAt,
    evaluatedAtCurrent: current.evaluatedAt,
  };
}

export function buildIriReports(assessment, previousAssessment = null) {
  const gate = validateIriAssessment(assessment);
  if (!gate.ok) throw new Error(gate.errors.join(' · '));
  const s = assessment.sections;
  const comparison = compareIriAssessments(assessment, previousAssessment);
  const shared = {
    assessmentId: assessment.id,
    clientId: assessment.clientId,
    protocolVersion: assessment.protocolVersion,
    evaluatedAt: assessment.evaluatedAt,
    score: gate.scoring.score,
    deltaFc: gate.deltaFc,
    classification: s.interpretacion.clasificacion,
    dataQuality: gate.scoring.dataQuality,
    priorities: [s.planAccion.prioridad1, s.planAccion.prioridad2, s.planAccion.prioridad3].filter(Boolean),
    comparison,
    methodology: gate.scoring.methodology,
  };
  return {
    coach: {
      id: uuid(),
      title: 'Informe IRI · Revisión Coach',
      type: 'iri',
      sourceType: 'iri',
      sourceId: assessment.id,
      clientId: assessment.clientId,
      audience: 'coach',
      status: 'aprobado',
      revision: 0,
      summary: `${s.interpretacion.clasificacion} · ${gate.scoring.score}/100. ${s.interpretacion.criterio}`,
      detail: { ...shared, sections: assessment.sections, strengthPatterns: strengthSnapshot(assessment), limits: s.interpretacion.limitadores },
      sections: [
        { title: 'Lectura IBERFIT', body: s.interpretacion.criterio },
        { title: 'Fortalezas', body: s.interpretacion.fortalezas },
        { title: 'Limitadores', body: s.interpretacion.limitadores },
        { title: 'Prioridades', body: shared.priorities.join(' · ') },
        { title: 'Método', body: shared.methodology },
      ],
    },
    client: {
      id: uuid(),
      title: 'Informe de Rendimiento IRI',
      type: 'iri',
      sourceType: 'iri',
      sourceId: assessment.id,
      clientId: assessment.clientId,
      audience: 'cliente',
      status: 'aprobado',
      revision: 0,
      summary: `${s.interpretacion.clasificacion} · ${gate.scoring.score}/100. Próximo paso: ${s.planAccion.prioridad1}.`,
      detail: { ...shared, strengths: s.interpretacion.fortalezas, nextReview: s.planAccion.reevaluacion },
      sections: [
        { title: 'Tu punto de partida', body: `${s.interpretacion.clasificacion} · ${gate.scoring.score}/100` },
        { title: 'Fortalezas', body: s.interpretacion.fortalezas },
        { title: 'Lectura IBERFIT', body: s.interpretacion.criterio },
        { title: 'Próximo paso', body: s.planAccion.prioridad1 },
        { title: 'Reevaluación', body: s.planAccion.reevaluacion },
      ],
    },
  };
}

export function mapRemoteIriAssessment(remote = {}) {
  return createIriAssessment({
    id: remote.id,
    clientId: remote.client_id,
    assessmentType: remote.assessment_type || 'inicial',
    protocolVersion: remote.protocol_version || IRI_PROTOCOL_VERSION,
    currentStep: remote.current_step || 'contexto',
    status: remote.status,
    revision: remote.revision,
    evaluatedAt: remote.evaluated_at || String(remote.created_at || '').slice(0, 10),
    startedAt: remote.started_at || remote.created_at,
    completedAt: remote.completed_at || null,
    approvedAt: remote.approved_at || null,
    approvedBy: remote.approved_by || null,
    publishedAt: remote.published_at || null,
    sections: remote.sections || {},
    updatedAt: remote.updated_at || remote.created_at,
    remote: true,
    remoteSavedAt: remote.updated_at || remote.created_at,
  });
}

export function iriRemotePayload(assessment, actorUserId = null) {
  const score = calculateIriScore(assessment);
  return {
    id: assessment.id,
    client_id: assessment.clientId,
    assessment_type: assessment.assessmentType || 'inicial',
    protocol_version: assessment.protocolVersion || IRI_PROTOCOL_VERSION,
    current_step: assessment.currentStep || 'contexto',
    evaluated_at: assessment.evaluatedAt || null,
    started_at: assessment.startedAt || null,
    completed_at: assessment.completedAt || null,
    sections: assessment.sections,
    score: score.score,
    classification: assessment.sections.interpretacion.clasificacion || score.classification || null,
    data_quality: score.dataQuality,
    status: assessment.status || 'borrador',
    revision: Number(assessment.revision || 0),
    approved_at: assessment.approvedAt || null,
    approved_by: assessment.approvedBy || null,
    published_at: assessment.publishedAt || null,
    created_by: actorUserId || assessment.createdBy || null,
    updated_at: assessment.updatedAt || new Date().toISOString(),
  };
}
