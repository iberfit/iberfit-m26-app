import { CANONICAL_EXERCISES_M25 } from './exercise-catalog-data.js';

export const EXERCISE_CATALOG_VERSION = 'M25-1.0.0';

function text(value = '') {
  return String(value ?? '').trim();
}

function array(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => text(item));
  return value ? [text(value)] : [];
}

export function normalizeExerciseRecord(raw = {}) {
  const id = text(raw.id || raw.exercise_id || raw.source_id);
  const name = text(raw.name_es || raw.name || raw.name_source);
  return {
    id,
    name,
    nameEs: name,
    sourceName: text(raw.name_source || raw.name || name),
    source: text(raw.source || 'IBERFIT_CANONICAL'),
    pattern: text(raw.pattern || 'sin clasificar'),
    intent: text(raw.intent || 'técnica'),
    equipment: text(raw.equipment || 'sin equipo'),
    difficulty: text(raw.difficulty || 'media'),
    primaryMuscles: array(raw.primary_muscles || raw.primaryMuscles),
    secondaryMuscles: array(raw.secondary_muscles || raw.secondaryMuscles),
    cues: array(raw.cues),
    instructions: array(raw.instructions_es || raw.instructions),
    precautions: array(raw.precautions),
    units: array(raw.units),
    tags: array(raw.tags),
    aliases: array(raw.aliases),
    mediaStatus: text(raw.media_status || raw.mediaStatus || 'pendiente'),
    reviewStatus: text(raw.review_status || raw.reviewStatus || 'pendiente'),
    active: raw.active !== false,
  };
}

export function canonicalExerciseFallback() {
  return CANONICAL_EXERCISES_M25.map(normalizeExerciseRecord);
}

export function filterExerciseCatalog(source = [], filters = {}) {
  const query = text(filters.query).toLocaleLowerCase('es');
  const pattern = text(filters.pattern);
  const equipment = text(filters.equipment);
  const intent = text(filters.intent);
  const difficulty = text(filters.difficulty);
  return source.filter((exercise) => {
    if (!exercise?.active) return false;
    if (pattern && exercise.pattern !== pattern) return false;
    if (equipment && exercise.equipment !== equipment) return false;
    if (intent && exercise.intent !== intent) return false;
    if (difficulty && exercise.difficulty !== difficulty) return false;
    if (!query) return true;
    const haystack = [exercise.name, exercise.sourceName, exercise.pattern, exercise.intent, exercise.equipment, ...(exercise.aliases || []), ...(exercise.tags || []), ...(exercise.primaryMuscles || [])].join(' ').toLocaleLowerCase('es');
    return haystack.includes(query);
  });
}

export function exerciseFacets(source = []) {
  const unique = (key) => [...new Set(source.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    patterns: unique('pattern'),
    equipment: unique('equipment'),
    intents: unique('intent'),
    difficulties: unique('difficulty'),
    total: source.filter((item) => item.active !== false).length,
  };
}

export function mergeExerciseCatalog(primary = [], secondary = []) {
  const map = new Map();
  for (const raw of [...secondary, ...primary]) {
    const item = normalizeExerciseRecord(raw);
    if (!item.id || !item.name) continue;
    map.set(item.id, { ...(map.get(item.id) || {}), ...item });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function exerciseForSession(exercise) {
  const normalized = normalizeExerciseRecord(exercise);
  return {
    id: normalized.id,
    name: normalized.name,
    pattern: normalized.pattern,
    intent: normalized.intent,
    equipment: normalized.equipment,
    difficulty: normalized.difficulty,
    contraindications: normalized.precautions,
    cues: normalized.cues,
  };
}
