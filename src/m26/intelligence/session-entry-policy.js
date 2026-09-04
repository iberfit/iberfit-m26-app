const REVIEW_LEVELS = new Set(['simplified', 'reduced', 'hold']);

export function buildSessionEntryDecision(adaptiveContext) {
  const decision = adaptiveContext?.decision;
  const rawLevel = String(decision?.level || '').trim().toLowerCase();
  const known = rawLevel === 'normal' || REVIEW_LEVELS.has(rawLevel);
  const level = known ? rawLevel : 'unknown';
  const directStartAllowed = level === 'normal';

  return Object.freeze({
    level,
    directStartAllowed,
    reviewRequired: !directStartAllowed,
    actionLabel: directStartAllowed ? 'Iniciar entrenamiento' : 'Revisar antes de entrenar',
    reasonCode: known ? (decision?.reasonCode || decision?.reason || null) : null
  });
}
