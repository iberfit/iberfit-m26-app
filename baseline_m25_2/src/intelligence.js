export const INTELLIGENCE_RULESET_VERSION = '2.0.0';
export const INTELLIGENCE_ENGINE = 'IBERFIT_DETERMINISTIC_RULES';

const priorityRank = Object.freeze({ crítica: 4, alta: 3, media: 2, baja: 1, informativa: 0 });

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedInput(input = {}) {
  const checkin = input.checkin || {};
  return {
    loadDelta: finiteOrNull(input.loadDelta),
    volumeDelta: finiteOrNull(input.volumeDelta),
    rpeDelta: finiteOrNull(input.rpeDelta),
    adherence: finiteOrNull(input.adherence),
    energy: finiteOrNull(checkin.energy),
    sleep: finiteOrNull(checkin.sleep),
    stress: finiteOrNull(checkin.stress),
    pain: finiteOrNull(checkin.pain),
    goal: String(input.goal || '').trim() || null,
    dataQuality: String(input.dataQuality || '').trim() || null,
    technicalQuality: finiteOrNull(input.technicalQuality),
    recentIncidents: finiteOrNull(input.recentIncidents) ?? 0,
    sessionsObserved: finiteOrNull(input.sessionsObserved),
  };
}

function missingFields(data) {
  const required = ['loadDelta', 'rpeDelta', 'adherence', 'energy', 'sleep', 'stress', 'pain', 'goal', 'dataQuality', 'sessionsObserved'];
  return required.filter((field) => data[field] === null || data[field] === '');
}

function evidence(data) {
  const rows = [
    ['Cambio de carga', data.loadDelta, '%', 'sesiones'],
    ['Cambio de volumen', data.volumeDelta, '%', 'sesiones'],
    ['Cambio de RPE', data.rpeDelta, '', 'sesiones'],
    ['Adherencia', data.adherence === null ? null : Math.round(data.adherence * 100), '%', 'plan'],
    ['Energía', data.energy, '/10', 'check-in'],
    ['Sueño', data.sleep, '/10', 'check-in'],
    ['Estrés', data.stress, '/10', 'check-in'],
    ['Dolor', data.pain, '/10', 'check-in'],
    ['Sesiones observadas', data.sessionsObserved, '', 'historial'],
  ];
  return rows.filter(([, value]) => value !== null).map(([label, value, unit, source]) => ({ label, value, unit, source }));
}

function ruleResult(code, data, missing, spec) {
  const completeness = Math.max(0, 1 - missing.length / 10);
  const qualityPenalty = data.dataQuality === 'baja' ? 0.2 : data.dataQuality === 'media' ? 0.08 : 0;
  const score = Math.max(0.2, Math.min(0.95, (spec.baseConfidence ?? 0.75) * completeness - qualityPenalty));
  return {
    runId: globalThis.crypto?.randomUUID?.() || `INT-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rulesetVersion: INTELLIGENCE_RULESET_VERSION,
    engine: INTELLIGENCE_ENGINE,
    status: 'propuesta',
    code,
    priority: spec.priority,
    title: spec.title,
    observation: spec.observation,
    interpretation: spec.interpretation,
    evidence: evidence(data),
    missingData: missing,
    recommendation: {
      action: spec.action,
      rationale: spec.rationale,
      guardrails: spec.guardrails || ['No modificar ni publicar el plan automáticamente.', 'Revisión humana obligatoria.'],
    },
    coachQuestion: spec.coachQuestion,
    confidence: {
      level: score >= 0.8 ? 'alta' : score >= 0.6 ? 'media' : 'baja',
      score: Number(score.toFixed(2)),
      reasons: spec.confidenceReasons || [],
    },
    limitations: spec.limitations || ['La lectura depende de la calidad y completitud de los datos disponibles.'],
    requiresCoachApproval: true,
    publicationBlocked: true,
    planChangeApplied: false,
    input: data,
    createdAt: new Date().toISOString(),
  };
}

export function evaluateIntelligence(input = {}) {
  const data = normalizedInput(input);
  const missing = missingFields(data);
  const rules = [];

  if (data.pain !== null && data.pain >= 6) rules.push(ruleResult('DOLOR_PRIORITARIO', data, missing, {
    priority: 'crítica', title: 'Revisión prioritaria por dolor',
    observation: `Dolor declarado ${data.pain}/10${data.recentIncidents ? ` y ${data.recentIncidents} incidencia(s) reciente(s)` : ''}.`,
    interpretation: 'No corresponde inferir progresión ni aumentar carga hasta que el Coach revise el contexto.',
    action: 'Revisar ejercicio, dosis, tolerancia y necesidad de evaluación profesional.',
    rationale: 'La seguridad y la tolerancia tienen prioridad sobre la progresión.',
    coachQuestion: '¿Qué modificación o derivación corresponde antes de la próxima exposición?',
    baseConfidence: 0.92,
    limitations: ['La aplicación no diagnostica la causa del dolor.', 'La urgencia clínica no puede determinarse solo con este dato.'],
  }));

  if (missing.length >= 4 || (data.sessionsObserved !== null && data.sessionsObserved < 2)) rules.push(ruleResult('DATOS_INSUFICIENTES', data, missing, {
    priority: 'alta', title: 'Datos insuficientes para decidir',
    observation: `Faltan ${missing.length} campos relevantes o existe poco historial comparable.`,
    interpretation: 'Emitir una recomendación de progresión sería poco fiable.',
    action: 'Completar datos y mantener una decisión conservadora hasta disponer de evidencia suficiente.',
    rationale: 'IBERFIT prefiere no recomendar antes que sugerir una acción sin soporte.',
    coachQuestion: '¿Qué dato mínimo necesitamos recoger antes de ajustar el plan?',
    baseConfidence: 0.88,
  }));

  const recoveryLimited = (data.stress !== null && data.stress >= 8) || (data.sleep !== null && data.sleep <= 4) || (data.energy !== null && data.energy <= 4);
  if (recoveryLimited && (data.pain === null || data.pain < 6)) rules.push(ruleResult('RECUPERACION_LIMITANTE', data, missing, {
    priority: 'alta', title: 'Semana condicionada por recuperación',
    observation: `Energía ${data.energy ?? '—'}/10 · sueño ${data.sleep ?? '—'}/10 · estrés ${data.stress ?? '—'}/10.`,
    interpretation: 'El rendimiento puede estar limitado por el contexto y no debe etiquetarse como falta de progreso.',
    action: 'Valorar mantener, descargar o priorizar calidad técnica.',
    rationale: 'La respuesta de entrenamiento debe interpretarse junto con recuperación y estrés.',
    coachQuestion: '¿Conviene mantener la dosis, descargar o cambiar el foco de esta semana?',
    baseConfidence: 0.86,
  }));

  const overloadPattern = data.loadDelta !== null && data.loadDelta >= 5 && data.rpeDelta !== null && data.rpeDelta >= 1
    && ((data.sleep !== null && data.sleep <= 5) || (data.energy !== null && data.energy <= 5) || (data.stress !== null && data.stress >= 7));
  if (overloadPattern && (data.pain === null || data.pain < 6)) rules.push(ruleResult('TOLERANCIA_EN_REVISION', data, missing, {
    priority: 'alta', title: 'Aumento de demanda con recuperación limitada',
    observation: `La carga subió ${data.loadDelta}% y el RPE aumentó ${data.rpeDelta}.`,
    interpretation: 'La combinación sugiere revisar tolerancia antes de seguir progresando.',
    action: 'Revisar dosis, descanso y técnica antes de una nueva progresión.',
    rationale: 'Carga y esfuerzo aumentan mientras la recuperación no acompaña.',
    coachQuestion: '¿La dosis actual está generando adaptación útil o fatiga acumulada?',
    baseConfidence: 0.82,
  }));

  const consolidation = data.loadDelta !== null && Math.abs(data.loadDelta) <= 2 && data.rpeDelta !== null && data.rpeDelta <= -1
    && data.adherence !== null && data.adherence >= 0.85 && !recoveryLimited && (data.pain === null || data.pain <= 2);
  if (consolidation) rules.push(ruleResult('CONSOLIDACION_TECNICA', data, missing, {
    priority: 'media', title: 'Consolidación técnica probable',
    observation: `Carga estable (${data.loadDelta}%) con RPE ${data.rpeDelta} y adherencia ${Math.round(data.adherence * 100)}%.`,
    interpretation: 'La misma tarea se realiza con menor esfuerzo percibido; esto puede representar eficiencia o consolidación, no estancamiento.',
    action: 'Decidir entre mantener para consolidar o progresar de forma pequeña según el objetivo del periodo.',
    rationale: 'La menor percepción de esfuerzo con buena adherencia es una señal favorable.',
    coachQuestion: '¿Estamos consolidando técnica o corresponde progresar según el objetivo del periodo?',
    baseConfidence: 0.84,
  }));

  const progressionOpportunity = data.loadDelta !== null && Math.abs(data.loadDelta) <= 2 && data.rpeDelta !== null && data.rpeDelta <= -1
    && data.adherence !== null && data.adherence >= 0.9 && data.energy !== null && data.energy >= 7 && data.sleep !== null && data.sleep >= 7
    && data.stress !== null && data.stress <= 5 && data.pain !== null && data.pain <= 2 && data.sessionsObserved !== null && data.sessionsObserved >= 3;
  if (progressionOpportunity) rules.push(ruleResult('OPORTUNIDAD_PROGRESION', data, missing, {
    priority: 'media', title: 'Oportunidad de progresión controlada',
    observation: 'El esfuerzo disminuye, la adherencia es alta y la recuperación es favorable.',
    interpretation: 'Existe una ventana razonable para considerar una progresión pequeña, siempre que la técnica y el objetivo lo respalden.',
    action: 'Proponer un incremento mínimo de una sola variable y observar respuesta.',
    rationale: 'La convergencia de varias señales es más sólida que una métrica aislada.',
    guardrails: ['Cambiar una sola variable.', 'No superar el criterio de cambio del ejercicio.', 'No publicar sin aprobación Coach.'],
    coachQuestion: '¿Qué variable única conviene progresar y cuál será el criterio de retirada?',
    baseConfidence: 0.8,
  }));

  if (data.adherence !== null && data.adherence < 0.7 && (data.pain === null || data.pain < 6)) rules.push(ruleResult('ADHERENCIA_EN_CONTEXTO', data, missing, {
    priority: 'media', title: 'Adherencia menor a la prevista',
    observation: `Se completó aproximadamente ${Math.round(data.adherence * 100)}% de lo planificado.`,
    interpretation: 'La adherencia es una señal para comprender barreras, no para culpabilizar al cliente.',
    action: 'Explorar disponibilidad, fricción, recuperación y ajuste de la dosis.',
    rationale: 'Un plan inviable no se corrige solo aumentando exigencia.',
    coachQuestion: '¿Qué barrera concreta impidió cumplir y qué ajuste mínimo mejora viabilidad?',
    baseConfidence: 0.78,
  }));

  if (!rules.length) rules.push(ruleResult('SIN_CAMBIO_RELEVANTE', data, missing, {
    priority: 'informativa', title: 'Sin señal suficiente para cambiar',
    observation: 'Los datos disponibles no muestran una razón clara para modificar el plan.',
    interpretation: 'Mantener y seguir observando puede ser la mejor decisión.',
    action: 'Mantener la prescripción y revisar después de más datos comparables.',
    rationale: 'No toda medición exige una intervención.',
    coachQuestion: '¿Existe información cualitativa que justifique una decisión distinta?',
    baseConfidence: 0.7,
  }));

  return rules.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);
}

export function approveIntelligenceRun(run, {
  actorRole,
  actorId = 'unknown',
  decisionNote = '',
  editedAction = null,
  at = new Date().toISOString(),
} = {}) {
  if (!['coach', 'admin'].includes(actorRole)) throw new Error('Solo Coach o administrador puede aprobar una propuesta');
  if (!run || run.status !== 'propuesta') throw new Error('La propuesta no está disponible para aprobación');
  if (!String(decisionNote).trim()) throw new Error('La decisión Coach necesita una nota breve');
  return {
    ...run,
    status: 'aprobada',
    approvedAt: at,
    approvedBy: actorId,
    coachDecision: {
      note: String(decisionNote).trim(),
      finalAction: String(editedAction || run.recommendation.action).trim(),
      modified: Boolean(editedAction && editedAction !== run.recommendation.action),
    },
    requiresCoachApproval: false,
    publicationBlocked: true,
    planChangeApplied: false,
  };
}

export function discardIntelligenceRun(run, {
  actorRole,
  actorId = 'unknown',
  reason = '',
  at = new Date().toISOString(),
} = {}) {
  if (!['coach', 'admin'].includes(actorRole)) throw new Error('Solo Coach o administrador puede descartar una propuesta');
  if (!run || run.status !== 'propuesta') throw new Error('La propuesta no está disponible');
  if (!String(reason).trim()) throw new Error('Indica el motivo del descarte');
  return { ...run, status: 'descartada', discardedAt: at, discardedBy: actorId, discardReason: String(reason).trim(), publicationBlocked: true, planChangeApplied: false };
}

export function intelligenceInputFromState(state) {
  return {
    ...(state?.progressContext || {}),
    checkin: state?.checkin || {},
    recentIncidents: state?.activeSession?.incidents?.length || 0,
    sessionsObserved: Number(state?.progressContext?.sessionsObserved ?? 3),
    technicalQuality: Number(state?.progressContext?.technicalQuality ?? 8),
    volumeDelta: Number(state?.progressContext?.volumeDelta ?? 0),
  };
}
