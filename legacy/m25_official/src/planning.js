import { BLOCK_TYPES, assertBlockType, normalizeSession } from './domain.js';

export const PLAN_STATUSES = Object.freeze(['borrador', 'revisión', 'aprobado', 'publicado']);

export function createPlanningDraft(input = {}) {
  const weeks = Math.max(1, Number(input.weeks || 4));
  return {
    id: input.id || `PLAN-${Date.now()}`,
    clientId: input.clientId || null,
    title: input.title || 'Ciclo inicial IBERFIT',
    goal: input.goal || 'Adherencia, técnica y progresión sostenible',
    startDate: input.startDate || new Date().toISOString().slice(0, 10),
    weeks,
    status: input.status || 'borrador',
    revision: Number(input.revision || 0),
    activeWeek: Math.min(weeks, Math.max(1, Number(input.activeWeek || 1))),
    session: normalizeSession(input.session || {
      id: input.sessionId || `SES-PLAN-${Date.now()}`,
      revision: 0,
      title: 'Sesión en borrador',
      type: 'guiada_en_app',
      blocks: [],
    }),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function updatePlanningMeta(plan, patch = {}) {
  const weeks = patch.weeks == null ? plan.weeks : Math.max(1, Number(patch.weeks));
  return {
    ...plan,
    ...patch,
    weeks,
    activeWeek: Math.min(weeks, Math.max(1, Number(patch.activeWeek ?? plan.activeWeek))),
    revision: Number(plan.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function addPlanningBlock(plan, input = {}) {
  const type = input.type || 'simple';
  assertBlockType(type);
  const block = {
    id: input.id || `B-${Date.now()}`,
    title: input.title || `Bloque ${plan.session.blocks.length + 1}`,
    type,
    rounds: Math.max(1, Number(input.rounds || 1)),
    restBetweenRounds: Math.max(0, Number(input.restBetweenRounds || 0)),
    durationSeconds: Math.max(0, Number(input.durationSeconds || 0)),
    exercises: [],
  };
  return updatePlanningMeta(plan, {
    session: normalizeSession({ ...plan.session, blocks: [...plan.session.blocks, block] }),
  });
}

export function removePlanningBlock(plan, blockId) {
  return updatePlanningMeta(plan, {
    session: normalizeSession({ ...plan.session, blocks: plan.session.blocks.filter((block) => block.id !== blockId) }),
  });
}

export function addExerciseToPlanningBlock(plan, blockId, exercise, prescription = {}) {
  if (!exercise?.id || !exercise?.name) throw new Error('Ejercicio inválido');
  const found = plan.session.blocks.some((block) => block.id === blockId);
  if (!found) throw new Error('Bloque no encontrado');
  const item = {
    id: exercise.id,
    name: exercise.name,
    pattern: exercise.pattern,
    intent: exercise.intent,
    equipment: exercise.equipment,
    sets: Math.max(1, Number(prescription.sets || 3)),
    reps: Math.max(0, Number(prescription.reps || 8)),
    load: Math.max(0, Number(prescription.load || 0)),
    seconds: Math.max(0, Number(prescription.seconds || 0)),
    meters: Math.max(0, Number(prescription.meters || 0)),
    rest: Math.max(0, Number(prescription.rest || 60)),
    unit: prescription.unit || (prescription.seconds ? 'segundos' : prescription.meters ? 'metros' : 'repeticiones'),
    cues: exercise.cues || [],
    alternatives: exercise.alternatives || [],
  };
  const blocks = plan.session.blocks.map((block) => block.id === blockId
    ? { ...block, exercises: [...block.exercises.filter((current) => current.id !== item.id), item] }
    : block);
  return updatePlanningMeta(plan, { session: normalizeSession({ ...plan.session, blocks }) });
}

export function removeExerciseFromPlanningBlock(plan, blockId, exerciseId) {
  const blocks = plan.session.blocks.map((block) => block.id === blockId
    ? { ...block, exercises: block.exercises.filter((exercise) => exercise.id !== exerciseId) }
    : block);
  return updatePlanningMeta(plan, { session: normalizeSession({ ...plan.session, blocks }) });
}

export function validatePlanningDraft(plan) {
  const errors = [];
  if (!plan.clientId) errors.push('Falta cliente');
  if (!plan.title?.trim()) errors.push('Falta título del ciclo');
  if (!plan.goal?.trim()) errors.push('Falta objetivo del ciclo');
  if (!plan.session?.title?.trim()) errors.push('Falta título de la sesión');
  if (!plan.session?.blocks?.length) errors.push('La sesión no tiene bloques');
  for (const block of plan.session?.blocks || []) {
    if (!BLOCK_TYPES.includes(block.type)) errors.push(`Tipo de bloque inválido: ${block.type}`);
    if (!block.exercises?.length) errors.push(`${block.title || block.id} no tiene ejercicios`);
  }
  return { ok: errors.length === 0, errors };
}

export function approvePlanningDraft(plan, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede aprobar la planificación');
  const gate = validatePlanningDraft(plan);
  if (!gate.ok) throw new Error(gate.errors.join(' · '));
  return updatePlanningMeta(plan, { status: 'aprobado' });
}

export function publishPlanningDraft(plan, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede publicar la planificación');
  if (plan.status !== 'aprobado') throw new Error('La planificación debe estar aprobada');
  return updatePlanningMeta(plan, {
    status: 'publicado',
    publishedAt: new Date().toISOString(),
    session: { ...plan.session, revision: Number(plan.session.revision || 0) + 1 },
  });
}

function equipmentMatch(exercise, availableEquipment) {
  if (!exercise.equipment || exercise.equipment === 'sin equipo') return true;
  return availableEquipment.includes(exercise.equipment);
}

export function findExerciseAlternatives(library, current, context = {}) {
  const availableEquipment = context.availableEquipment || [];
  const limitations = context.limitations || [];
  return library
    .filter((candidate) => candidate.id !== current.id)
    .filter((candidate) => candidate.pattern === current.pattern)
    .filter((candidate) => !current.intent || candidate.intent === current.intent)
    .filter((candidate) => equipmentMatch(candidate, availableEquipment))
    .filter((candidate) => !(candidate.contraindications || []).some((item) => limitations.includes(item)))
    .map((candidate) => {
      let score = 100;
      if (candidate.difficulty === current.difficulty) score += 10;
      if (candidate.equipment === current.equipment) score += 5;
      return { ...candidate, matchScore: score, matchReason: 'Mismo patrón e intención; compatible con equipo y limitadores.' };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
}
