export const MODALIDADES = Object.freeze(['Presencial', 'Híbrido', 'Online']);
export const REPORT_STATES = Object.freeze(['borrador', 'revisión', 'aprobado', 'publicado', 'retirado']);
export const BLOCK_TYPES = Object.freeze(['simple', 'biserie', 'superserie', 'triserie', 'gigante', 'circuito', 'intervalos', 'emom', 'amrap']);
export const SESSION_STATUSES = Object.freeze(['activa', 'pausada', 'cerrada', 'cerrada_local_pendiente_sync', 'cerrada_confirmada', 'cierre_conflicto', 'cierre_rechazado']);

export function assertModalidad(value) {
  if (!MODALIDADES.includes(value)) throw new Error(`Modalidad inválida: ${value}`);
  return value;
}

export function assertBlockType(value) {
  if (!BLOCK_TYPES.includes(value)) throw new Error(`Tipo de bloque inválido: ${value}`);
  return value;
}

export function defaultProfileModules(modalidad) {
  assertModalidad(modalidad);
  const shared = ['progreso', 'informes', 'mensajes'];
  if (modalidad === 'Presencial') return ['agenda', 'próxima sesión', ...shared, 'tareas publicadas'];
  if (modalidad === 'Híbrido') return ['mi plan', 'próxima sesión', 'check-in', 'registro post-sesión', ...shared, 'tareas'];
  return ['mi plan', 'próxima sesión', 'check-in', 'registro post-sesión', ...shared, 'objetivos'];
}

export function clientProfileFor(modalidad, overrides = {}) {
  assertModalidad(modalidad);
  const defaults = {
    Presencial: { home: 'Próxima sesión presencial', guidedByDefault: false },
    Híbrido: { home: 'Tu semana presencial y guiada', guidedByDefault: true },
    Online: { home: 'Tu plan y próxima sesión guiada', guidedByDefault: true },
  }[modalidad];
  return {
    modalidad,
    version: Number(overrides.version || 1),
    revision: Number(overrides.revision || 0),
    status: overrides.status || 'borrador',
    home: overrides.home || defaults.home,
    modules: overrides.modules || defaultProfileModules(modalidad),
    guidedByDefault: overrides.guidedByDefault ?? defaults.guidedByDefault,
    publishedAt: overrides.publishedAt || null,
  };
}

export function publishClientProfile(profile, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede publicar el perfil');
  return {
    ...profile,
    status: 'publicado',
    version: Number(profile.version || 0) + 1,
    revision: Number(profile.revision || 0) + 1,
    publishedAt: new Date().toISOString(),
  };
}

export function changeModality(client, next, actor = 'coach') {
  assertModalidad(next);
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede cambiar la modalidad');
  if (client.modalidad === next) return { client: { ...client }, event: null };
  const previous = client.modalidad;
  const updated = {
    ...client,
    modalidad: next,
    profileVersion: Number(client.profileVersion || 1) + 1,
    revision: Number(client.revision || 0) + 1,
  };
  return {
    client: updated,
    event: {
      type: 'MODALIDAD_CAMBIADA',
      entityType: 'client',
      entityId: client.id,
      previous,
      next,
      actor,
      baseRevision: Number(client.revision || 0),
      conflictSensitive: true,
      at: new Date().toISOString(),
    },
  };
}

export function normalizeSession(session) {
  if (!session?.id || !Array.isArray(session.blocks)) throw new Error('Sesión inválida');
  return {
    ...session,
    revision: Number(session.revision || 0),
    blocks: session.blocks.map((block, blockIndex) => {
      const type = block.type || 'simple';
      assertBlockType(type);
      return {
        ...block,
        id: block.id || `B-${blockIndex + 1}`,
        type,
        rounds: Number(block.rounds || 1),
        restBetweenRounds: Number(block.restBetweenRounds || 0),
        durationSeconds: Number(block.durationSeconds || 0),
        exercises: (block.exercises || []).map((exercise, exerciseIndex) => ({
          ...exercise,
          id: exercise.id || `${block.id || `B-${blockIndex + 1}`}-E-${exerciseIndex + 1}`,
          sets: Math.max(1, Number(exercise.sets || 1)),
          reps: Number(exercise.reps || 0),
          load: Number(exercise.load || 0),
          seconds: Number(exercise.seconds || 0),
          meters: Number(exercise.meters || 0),
          rest: Number(exercise.rest || 60),
          unit: exercise.unit || (exercise.seconds ? 'segundos' : exercise.meters ? 'metros' : 'repeticiones'),
        })),
      };
    }),
  };
}

function createPlannedStep(block, exercise, setIndex, roundIndex) {
  return {
    id: `${block.id}:${exercise.id}:R${roundIndex + 1}:S${setIndex + 1}`,
    blockId: block.id,
    blockType: block.type,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    setIndex,
    roundIndex,
    planned: {
      load: exercise.load,
      reps: exercise.reps,
      seconds: exercise.seconds,
      meters: exercise.meters,
      rest: exercise.rest,
      unit: exercise.unit,
    },
    actual: {
      load: exercise.load,
      reps: exercise.reps,
      seconds: exercise.seconds,
      meters: exercise.meters,
      rpe: null,
      rir: null,
      note: '',
    },
    status: 'pendiente',
  };
}

export function createSessionState(rawSession) {
  const session = normalizeSession(rawSession);
  const steps = [];
  for (const block of session.blocks) {
    const rounds = ['circuito', 'emom', 'amrap', 'intervalos'].includes(block.type) ? block.rounds : 1;
    for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
      for (const exercise of block.exercises) {
        const sets = rounds > 1 ? 1 : exercise.sets;
        for (let setIndex = 0; setIndex < sets; setIndex += 1) {
          steps.push(createPlannedStep(block, exercise, setIndex, roundIndex));
        }
      }
    }
  }
  return {
    sessionId: session.id,
    sourceRevision: session.revision,
    cursor: 0,
    steps,
    startedAt: new Date().toISOString(),
    closedAt: null,
    status: 'activa',
    restSeconds: steps[0]?.planned.rest || 60,
    incidents: [],
    changes: [],
    feedback: null,
    localRevision: 0,
  };
}

function bumpSession(state, patch = {}) {
  return { ...state, ...patch, localRevision: Number(state.localRevision || 0) + 1 };
}

export function updateActiveStep(state, patch) {
  if (state.status !== 'activa') throw new Error('La sesión no está activa');
  const current = state.steps[state.cursor];
  if (!current) throw new Error('No existe una serie activa');
  const actualPatch = patch.actual ? patch.actual : patch;
  const steps = state.steps.map((step, index) =>
    index === state.cursor ? { ...step, actual: { ...step.actual, ...actualPatch } } : step,
  );
  return bumpSession(state, { steps });
}

export function completeStep(state, actualPatch = {}) {
  const edited = updateActiveStep(state, actualPatch);
  const steps = edited.steps.map((step, index) =>
    index === edited.cursor ? { ...step, status: 'completada', completedAt: new Date().toISOString() } : step,
  );
  const unresolved = steps.findIndex((step, index) => index > edited.cursor && step.status === 'pendiente');
  const cursor = unresolved >= 0 ? unresolved : edited.cursor;
  const nextRest = steps[cursor]?.planned.rest ?? edited.restSeconds;
  return bumpSession(edited, { steps, cursor, restSeconds: nextRest });
}

export function goBack(state) {
  return bumpSession(state, { cursor: Math.max(0, state.cursor - 1) });
}

export function goNext(state) {
  return bumpSession(state, { cursor: Math.min(state.steps.length - 1, state.cursor + 1) });
}

export function adjustRest(state, delta) {
  return bumpSession(state, { restSeconds: Math.max(0, Number(state.restSeconds || 0) + Number(delta || 0)) });
}

export function omitExercise(state, exerciseId, reason) {
  if (!reason?.trim()) throw new Error('El motivo es obligatorio');
  const at = new Date().toISOString();
  return bumpSession(state, {
    steps: state.steps.map((step) =>
      step.exerciseId === exerciseId && step.status === 'pendiente'
        ? { ...step, status: 'omitida', actual: { ...step.actual, note: reason.trim() }, completedAt: at }
        : step,
    ),
    changes: [...state.changes, { type: 'EJERCICIO_OMITIDO', exerciseId, reason: reason.trim(), at }],
  });
}

export function replaceExercise(state, exerciseId, replacement, reason) {
  if (!replacement?.id || !replacement?.name) throw new Error('Reemplazo inválido');
  if (!reason?.trim()) throw new Error('El motivo es obligatorio');
  const at = new Date().toISOString();
  return bumpSession(state, {
    steps: state.steps.map((step) =>
      step.exerciseId === exerciseId && step.status === 'pendiente'
        ? {
            ...step,
            exerciseId: replacement.id,
            exerciseName: replacement.name,
            actual: { ...step.actual, note: `Reemplazo: ${reason.trim()}` },
          }
        : step,
    ),
    changes: [...state.changes, { type: 'EJERCICIO_REEMPLAZADO', exerciseId, replacementId: replacement.id, reason: reason.trim(), at }],
  });
}


export function addExerciseToSessionState(state, exercise, prescription = {}, reason = 'Añadido por Coach') {
  if (!exercise?.id || !exercise?.name) throw new Error('Ejercicio inválido');
  if (!reason?.trim()) throw new Error('El motivo es obligatorio');
  const sets = Math.max(1, Number(prescription.sets || 1));
  const blockId = prescription.blockId || state.steps[state.cursor]?.blockId || 'B-ADDED';
  const blockType = prescription.blockType || state.steps[state.cursor]?.blockType || 'simple';
  const steps = Array.from({ length: sets }, (_, setIndex) => ({
    id: `${blockId}:${exercise.id}:R1:S${setIndex + 1}:${Date.now()}`,
    blockId,
    blockType,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    setIndex,
    roundIndex: 0,
    planned: {
      load: Math.max(0, Number(prescription.load || 0)),
      reps: Math.max(0, Number(prescription.reps || 0)),
      seconds: Math.max(0, Number(prescription.seconds || 0)),
      meters: Math.max(0, Number(prescription.meters || 0)),
      rest: Math.max(0, Number(prescription.rest || 60)),
      unit: prescription.unit || 'repeticiones',
    },
    actual: {
      load: Math.max(0, Number(prescription.load || 0)),
      reps: Math.max(0, Number(prescription.reps || 0)),
      seconds: Math.max(0, Number(prescription.seconds || 0)),
      meters: Math.max(0, Number(prescription.meters || 0)),
      rpe: null,
      rir: null,
      note: `Añadido: ${reason.trim()}`,
    },
    status: 'pendiente',
  }));
  const insertion = Math.min(state.steps.length, state.cursor + 1);
  return bumpSession(state, {
    steps: [...state.steps.slice(0, insertion), ...steps, ...state.steps.slice(insertion)],
    changes: [...state.changes, { type: 'EJERCICIO_AÑADIDO', exerciseId: exercise.id, reason: reason.trim(), at: new Date().toISOString() }],
  });
}

export function addIncident(state, incident) {
  const note = incident?.note?.trim();
  if (!note) throw new Error('La incidencia necesita una descripción');
  const severity = incident.severity || 'media';
  return bumpSession(state, {
    incidents: [
      ...state.incidents,
      {
        id: incident.id || `INC-${Date.now()}`,
        severity,
        note,
        exerciseId: incident.exerciseId || state.steps[state.cursor]?.exerciseId || null,
        at: new Date().toISOString(),
      },
    ],
  });
}

export function plannedVsActual(step) {
  const fields = ['load', 'reps', 'seconds', 'meters'];
  const differences = fields
    .map((field) => ({ field, planned: Number(step.planned[field] || 0), actual: Number(step.actual[field] || 0) }))
    .filter((item) => item.planned !== item.actual);
  return { changed: differences.length > 0, differences };
}

export function sessionExecutionSummary(state) {
  const counts = state.steps.reduce(
    (acc, step) => ({ ...acc, [step.status]: Number(acc[step.status] || 0) + 1 }),
    { pendiente: 0, completada: 0, omitida: 0 },
  );
  const diffs = state.steps.filter((step) => plannedVsActual(step).changed).length;
  return {
    total: state.steps.length,
    ...counts,
    changedSteps: diffs,
    incidents: state.incidents.length,
    completionRate: state.steps.length ? (counts.completada + counts.omitida) / state.steps.length : 0,
  };
}

export function addSessionFeedback(state, feedback) {
  const effort = Number(feedback?.effort || 0);
  if (effort < 1 || effort > 10) throw new Error('El esfuerzo debe estar entre 1 y 10');
  return bumpSession(state, {
    feedback: {
      effort,
      pain: Number(feedback.pain || 0),
      comment: String(feedback.comment || '').trim(),
      at: new Date().toISOString(),
    },
  });
}

export function canCloseSession(state, pendingOperationCount = 0) {
  const summary = sessionExecutionSummary(state);
  const unresolved = summary.pendiente > 0;
  return {
    ok: !unresolved && Boolean(state.feedback) && pendingOperationCount === 0,
    reasons: [
      unresolved ? `${summary.pendiente} series siguen pendientes` : null,
      !state.feedback ? 'Falta feedback post-sesión' : null,
      pendingOperationCount > 0 ? `${pendingOperationCount} operaciones aún no tienen ACK` : null,
    ].filter(Boolean),
  };
}

export function closeSession(state, pendingOperationCount = 0) {
  const gate = canCloseSession(state, pendingOperationCount);
  if (!gate.ok) throw new Error(gate.reasons.join(' · '));
  return bumpSession(state, { status: 'cerrada', closedAt: new Date().toISOString() });
}

export function publishReport(report, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Publicación no autorizada');
  if (!['aprobado', 'publicado'].includes(report.status)) throw new Error('El informe debe estar aprobado');
  return { ...report, status: 'publicado', revision: Number(report.revision || 0) + 1, publishedAt: new Date().toISOString() };
}

export function contextualProgressSignal({ loadDelta = 0, rpeDelta = 0, adherence = 1, checkin = {}, goal = 'general', dataQuality = 'media' }) {
  const energy = Number(checkin.energy ?? 7);
  const sleep = Number(checkin.sleep ?? 7);
  const stress = Number(checkin.stress ?? 4);
  const pain = Number(checkin.pain ?? 0);
  const evidence = [
    `Cambio de carga: ${loadDelta > 0 ? '+' : ''}${loadDelta}%`,
    `Cambio de RPE: ${rpeDelta > 0 ? '+' : ''}${rpeDelta}`,
    `Adherencia: ${Math.round(adherence * 100)}%`,
    `Energía ${energy}/10 · Sueño ${sleep}/10 · Estrés ${stress}/10 · Dolor ${pain}/10`,
    `Calidad del dato: ${dataQuality}`,
  ];

  if (pain >= 6) return {
    level: 'atención',
    title: 'Revisión prioritaria por dolor',
    interpretation: 'La carga no debe progresar automáticamente mientras exista esta señal.',
    evidence,
    question: '¿Corresponde modificar el ejercicio, la dosis o derivar para evaluación?',
    confidence: 'alta',
    limits: ['La aplicación no diagnostica la causa del dolor.'],
  };

  if (stress >= 8 || sleep <= 4 || energy <= 4) return {
    level: 'contexto',
    title: 'Semana condicionada por recuperación',
    interpretation: 'El rendimiento puede estar limitado por el contexto; no se interpreta como falta de progreso.',
    evidence,
    question: '¿Conviene mantener, descargar o priorizar calidad técnica esta semana?',
    confidence: dataQuality === 'alta' ? 'media-alta' : 'media',
    limits: ['El check-in es subjetivo y debe contrastarse con la conversación del Coach.'],
  };

  if (loadDelta <= 0 && rpeDelta < 0 && adherence >= 0.8) return {
    level: 'consolidación',
    title: 'Consolidación técnica probable',
    interpretation: 'La carga no aumentó, pero el esfuerzo percibido bajó con buena adherencia.',
    evidence,
    question: `¿Estamos consolidando técnica o corresponde progresar según el objetivo ${goal}?`,
    confidence: 'media-alta',
    limits: ['No considera por sí sola velocidad, rango de movimiento ni calidad técnica observada.'],
  };

  if (loadDelta <= 0 && rpeDelta >= 0 && adherence < 0.7) return {
    level: 'revisión',
    title: 'Señal de continuidad para revisar',
    interpretation: 'La combinación de menor adherencia y esfuerzo estable o mayor requiere contexto antes de ajustar.',
    evidence,
    question: '¿Existe una barrera de agenda, recuperación, comprensión o tolerancia?',
    confidence: 'media',
    limits: ['No atribuye una causa sin revisión humana.'],
  };

  return {
    level: 'estable',
    title: 'Progreso compatible con el plan',
    interpretation: 'No aparecen señales que justifiquen un cambio automático.',
    evidence,
    question: '¿Se mantiene la progresión prevista o existe un criterio técnico para modificarla?',
    confidence: 'media',
    limits: ['La decisión final depende de la observación y criterio del Coach.'],
  };
}
