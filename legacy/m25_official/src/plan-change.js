const ALLOWED_FIELDS = Object.freeze(['sets', 'reps', 'load', 'seconds', 'meters', 'rest']);
const STATUSES = Object.freeze(['borrador', 'aprobado', 'publicado', 'descartado']);

function assertCoach(role) {
  if (!['coach', 'admin'].includes(role)) throw new Error('Solo Coach o administrador puede gestionar cambios de planificación');
}

function findExercise(plan, blockId, exerciseId) {
  const block = (plan?.session?.blocks || []).find((item) => item.id === blockId);
  if (!block) throw new Error('Bloque de planificación no encontrado');
  const exercise = (block.exercises || []).find((item) => item.id === exerciseId);
  if (!exercise) throw new Error('Ejercicio de planificación no encontrado');
  return { block, exercise };
}

function normalizeValue(field, value) {
  if (!ALLOWED_FIELDS.includes(field)) throw new Error(`Campo de prescripción no permitido: ${field}`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('El valor propuesto debe ser numérico');
  if (number < 0) throw new Error('El valor propuesto no puede ser negativo');
  if (field === 'sets' && number < 1) throw new Error('Debe existir al menos una serie');
  return number;
}

export function planningExerciseTargets(plan) {
  return (plan?.session?.blocks || []).flatMap((block) => (block.exercises || []).map((exercise) => ({
    blockId: block.id,
    blockTitle: block.title,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    prescription: Object.fromEntries(ALLOWED_FIELDS.map((field) => [field, Number(exercise[field] || 0)])),
  })));
}

export function createPlanChangeDraft({ run, plan, target, field, proposedValue, reason, actorId = 'unknown', at = new Date().toISOString() } = {}) {
  if (!run || run.status !== 'aprobada') throw new Error('La propuesta de inteligencia debe estar aprobada antes de preparar un cambio');
  if (!plan?.id) throw new Error('No existe planificación canónica');
  if (plan.status !== 'publicado') throw new Error('El plan base debe estar publicado antes de preparar un cambio');
  if (!target?.blockId || !target?.exerciseId) throw new Error('Selecciona un ejercicio de la planificación');
  const { block, exercise } = findExercise(plan, target.blockId, target.exerciseId);
  const next = normalizeValue(field, proposedValue);
  const previous = Number(exercise[field] || 0);
  if (previous === next) throw new Error('El cambio debe modificar el valor actual');
  const rationale = String(reason || run.coachDecision?.finalAction || run.recommendation?.action || '').trim();
  if (!rationale) throw new Error('El cambio necesita un fundamento Coach');
  return {
    id: globalThis.crypto?.randomUUID?.() || `CHG-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    clientId: plan.clientId,
    planId: plan.id,
    sessionId: plan.session.id,
    basePlanningRevision: Number(plan.revision || 0),
    sourceRunId: run.runId,
    sourceSignalCode: run.code,
    sourceRulesetVersion: run.rulesetVersion,
    status: 'borrador',
    target: {
      blockId: block.id,
      blockTitle: block.title,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      field,
    },
    previousValue: previous,
    proposedValue: next,
    rationale,
    evidence: structuredClone(run.evidence || []),
    coachDecision: structuredClone(run.coachDecision || null),
    createdBy: actorId,
    createdAt: at,
    approvedBy: null,
    approvedAt: null,
    publishedBy: null,
    publishedAt: null,
    publicationBlocked: true,
  };
}

export function planChangeDiff(change) {
  if (!change?.target) return [];
  return [{
    path: `session.blocks.${change.target.blockId}.exercises.${change.target.exerciseId}.${change.target.field}`,
    label: `${change.target.exerciseName} · ${change.target.field}`,
    before: change.previousValue,
    after: change.proposedValue,
  }];
}

export function validatePlanChange(change, plan) {
  const errors = [];
  if (!change || !STATUSES.includes(change.status)) errors.push('Estado de cambio inválido');
  if (!change?.sourceRunId) errors.push('Falta propuesta de origen');
  if (!change?.rationale?.trim()) errors.push('Falta fundamento Coach');
  if (Number(plan?.revision || 0) !== Number(change?.basePlanningRevision || 0)) errors.push('La planificación cambió desde que se preparó la propuesta');
  try {
    const { exercise } = findExercise(plan, change?.target?.blockId, change?.target?.exerciseId);
    if (Number(exercise?.[change.target.field] || 0) !== Number(change?.previousValue || 0)) errors.push('El valor de origen ya no coincide con la planificación actual');
  } catch (error) {
    errors.push(error.message);
  }
  return { ok: errors.length === 0, errors, differences: planChangeDiff(change) };
}

export function approvePlanChangeDraft(change, plan, { actorRole, actorId = 'unknown', at = new Date().toISOString() } = {}) {
  assertCoach(actorRole);
  if (change?.status !== 'borrador') throw new Error('Solo un cambio en borrador puede aprobarse');
  const gate = validatePlanChange(change, plan);
  if (!gate.ok) throw new Error(gate.errors.join(' · '));
  return { ...change, status: 'aprobado', approvedBy: actorId, approvedAt: at, publicationBlocked: true };
}

export function discardPlanChange(change, { actorRole, actorId = 'unknown', reason = '', at = new Date().toISOString() } = {}) {
  assertCoach(actorRole);
  if (!change || !['borrador', 'aprobado'].includes(change.status)) throw new Error('El cambio no está disponible para descarte');
  if (!String(reason).trim()) throw new Error('Indica el motivo del descarte');
  return { ...change, status: 'descartado', discardedBy: actorId, discardedAt: at, discardReason: String(reason).trim(), publicationBlocked: true };
}

export function publishPlanChange(change, plan, { actorRole, actorId = 'unknown', at = new Date().toISOString() } = {}) {
  assertCoach(actorRole);
  if (change?.status !== 'aprobado') throw new Error('El cambio debe estar aprobado antes de publicarse');
  const gate = validatePlanChange(change, plan);
  if (!gate.ok) throw new Error(gate.errors.join(' · '));
  const blocks = plan.session.blocks.map((block) => block.id !== change.target.blockId ? block : {
    ...block,
    exercises: block.exercises.map((exercise) => exercise.id !== change.target.exerciseId ? exercise : {
      ...exercise,
      [change.target.field]: change.proposedValue,
    }),
  });
  const nextRevision = Number(plan.revision || 0) + 1;
  const publishedChange = {
    ...change,
    status: 'publicado',
    publishedBy: actorId,
    publishedAt: at,
    publicationBlocked: false,
    appliedPlanningRevision: nextRevision,
  };
  const nextPlan = {
    ...plan,
    status: 'publicado',
    revision: nextRevision,
    updatedAt: at,
    publishedAt: at,
    session: {
      ...plan.session,
      revision: Number(plan.session.revision || 0) + 1,
      blocks,
    },
    changeHistory: [publishedChange, ...(plan.changeHistory || [])].slice(0, 100),
  };
  return { plan: nextPlan, change: publishedChange, differences: gate.differences };
}

export { ALLOWED_FIELDS as PLAN_CHANGE_FIELDS, STATUSES as PLAN_CHANGE_STATUSES };
