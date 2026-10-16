import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleGenAI } from 'npm:@google/genai';

const ALLOWED_ACTIONS = new Set(['exercise_search','session_draft','iri_interpretation','progress_review','report_draft']);
const ALLOWED_ROLES = new Set(['coach','admin']);
const DEFAULT_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash';

function allowedOrigin(origin: string | null) {
  if (!origin) return '*';
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return '';
    if (['app.iberfit.cl','coach.iberfit.cl','iberfitapp.iberfit-cl.workers.dev'].includes(url.hostname)) return origin;
    if (url.hostname.endsWith('.iberfit-cl.workers.dev')) return origin;
  } catch { /* no-op */ }
  return '';
}

function cors(req: Request) {
  const origin = allowedOrigin(req.headers.get('origin'));
  return {
    'access-control-allow-origin': origin || 'null',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function publishableKey() {
  const modern = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      return parsed.default || Object.values(parsed)[0];
    } catch { /* fall through */ }
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
}

function clean(value: unknown, depth = 0): unknown {
  if (depth > 7) return '[límite]';
  if (value === null || ['string','number','boolean'].includes(typeof value)) return typeof value === 'string' ? value.slice(0, 4000) : value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      if (/password|token|secret|api.?key/i.test(key)) continue;
      output[key] = clean(item, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, 1000);
}

function parseGeminiJson(text: string) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

function baseInstructions(action: string) {
  return `Eres el motor supervisado de IBERFIT, una plataforma de entrenamiento personal. Acción: ${action}.
Reglas obligatorias:
1. Responde únicamente JSON válido, sin markdown.
2. No diagnostiques, no prescribas tratamiento médico y no inventes datos.
3. Toda salida es una propuesta para que el Coach revise, modifique y apruebe.
4. Nunca publiques ni apliques cambios automáticamente.
5. Usa lenguaje profesional, claro y en español.
6. Indica evidencia, supuestos, datos faltantes, límites y criterios de retirada.
7. Al elegir ejercicios usa exclusivamente los exercise_id entregados en el contexto.
8. Evita recomendaciones de riesgo ante dolor alto, síntomas no explicados o datos insuficientes.`;
}

function schemaFor(action: string) {
  const common = { title: 'string', summary: 'string', evidence: ['string'], missingData: ['string'], limitations: ['string'], requiresCoachApproval: true, publicationBlocked: true };
  if (action === 'exercise_search') return { ...common, exercises: [{ exerciseId: 'string', reason: 'string', suggestedUse: 'string', precautions: ['string'] }] };
  if (action === 'session_draft') return { ...common, session: { title: 'string', objective: 'string', estimatedMinutes: 0, blocks: [{ title: 'string', intent: 'string', exercises: [{ exerciseId: 'string', sets: 0, reps: 0, seconds: 0, meters: 0, loadGuidance: 'string', restSeconds: 0, tempo: 'string', alternativeExerciseId: 'string|null', rationale: 'string' }] }] }, guardrails: ['string'] };
  if (action === 'iri_interpretation') return { ...common, interpretation: { strengths: ['string'], priorities: ['string'], classification: 'string', actionPlan: ['string'], reevaluationCriteria: ['string'] } };
  if (action === 'progress_review') return { ...common, review: { observedChanges: ['string'], contextualReading: ['string'], suggestedDecision: 'string', nextChecks: ['string'] } };
  return { ...common, report: { headline: 'string', findings: [{ finding: 'string', interpretation: 'string', action: 'string' }], nextPeriod: ['string'] } };
}

async function fallbackProposal(action: string, input: any, supabase: any) {
  const context = input.context || {};
  if (action === 'exercise_search' || action === 'session_draft') {
    const filters = input.filters || {};
    const { data, error } = await supabase.rpc('iberfit_search_exercises', {
      p_query: filters.query || context.objective || null,
      p_pattern: filters.pattern || null,
      p_equipment: filters.equipment || null,
      p_intent: filters.intent || null,
      p_difficulty: filters.difficulty || null,
      p_limit: action === 'session_draft' ? 16 : 20,
      p_offset: 0,
    });
    if (error) throw error;
    const local = Array.isArray(context.availableExerciseIds) ? context.availableExerciseIds : [];
    const list = (data?.length ? data : local) || [];
    if (action === 'exercise_search') return {
      title: 'Selección basada en catálogo IBERFIT', summary: 'Resultado local explicable; Gemini no estaba disponible.',
      exercises: list.slice(0, 10).map((e: any) => ({ exerciseId: e.id, reason: `${e.pattern} · ${e.intent} · ${e.equipment}`, suggestedUse: 'Revisar dosis según IRI y objetivo.', precautions: e.precautions || [] })),
      evidence: ['Filtros del Coach','Biblioteca canónica'], missingData: [], limitations: ['Fallback determinista sin generación Gemini.'], requiresCoachApproval: true, publicationBlocked: true,
    };
    const selected = list.slice(0, 8);
    const blocks = [
      { title: 'Preparación', intent: 'movilidad y control', exercises: selected.slice(0,2) },
      { title: 'Fuerza principal', intent: 'fuerza', exercises: selected.slice(2,5) },
      { title: 'Complementario', intent: 'estabilidad y capacidad', exercises: selected.slice(5,8) },
    ].filter((b) => b.exercises.length).map((b) => ({ ...b, exercises: b.exercises.map((e: any) => ({ exerciseId: e.id, sets: 3, reps: e.intent === 'movilidad' ? 8 : 10, seconds: 0, meters: 0, loadGuidance: 'Carga técnica con 2–3 repeticiones en reserva.', restSeconds: b.title === 'Fuerza principal' ? 90 : 45, tempo: 'controlado', alternativeExerciseId: null, rationale: `${e.pattern} para ${context.objective || 'el objetivo definido'}.` })) }));
    return { title: 'Borrador de sesión IBERFIT', summary: 'Borrador local conservador para revisión.', session: { title: context.sessionTitle || 'Sesión propuesta', objective: context.objective || 'Objetivo por definir', estimatedMinutes: 50, blocks }, guardrails: ['Modificar una variable por vez','No publicar sin revisión Coach'], evidence: ['Biblioteca canónica','Contexto aportado'], missingData: context.objective ? [] : ['Objetivo específico'], limitations: ['Fallback determinista sin generación Gemini.'], requiresCoachApproval: true, publicationBlocked: true };
  }
  if (action === 'iri_interpretation') return { title: 'Lectura IRI supervisada', summary: 'Lectura conservadora basada en los datos aportados.', interpretation: { strengths: context.strengths || [], priorities: context.limiters || [], classification: context.classification || 'Pendiente de revisión', actionPlan: ['Confirmar prioridades con el Coach','Definir frecuencia y criterio de reevaluación'], reevaluationCriteria: ['Datos comparables','Mismas condiciones de medición'] }, evidence: ['IRI registrado'], missingData: [], limitations: ['Fallback local; no sustituye criterio profesional.'], requiresCoachApproval: true, publicationBlocked: true };
  if (action === 'progress_review') return { title: 'Revisión de progreso', summary: 'No se aplicarán cambios automáticos.', review: { observedChanges: context.observedChanges || [], contextualReading: ['Interpretar adherencia junto con carga, RPE y recuperación.'], suggestedDecision: 'Mantener o ajustar una sola variable tras revisión.', nextChecks: ['Tolerancia','Técnica','Adherencia'] }, evidence: ['Historial disponible'], missingData: [], limitations: ['Fallback local.'], requiresCoachApproval: true, publicationBlocked: true };
  return { title: 'Borrador de informe', summary: 'Borrador local para edición Coach.', report: { headline: context.title || 'Evolución IBERFIT', findings: [{ finding: 'Datos revisados', interpretation: 'La lectura final requiere criterio Coach.', action: 'Editar y aprobar antes de publicar.' }], nextPeriod: ['Definir próximo foco y criterio de seguimiento'] }, evidence: ['Datos aportados'], missingData: [], limitations: ['Fallback local.'], requiresCoachApproval: true, publicationBlocked: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido' }, 405);
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json(req, { error: 'Sesión no válida' }, 401);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const pubKey = publishableKey();
  const supabase = createClient(supabaseUrl, pubKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.slice(7));
  if (userError || !userData?.user) return json(req, { error: 'Sesión no válida' }, 401);
  const { data: profile, error: profileError } = await supabase.from('user_profiles').select('role,client_id,display_name').eq('user_id', userData.user.id).single();
  if (profileError || !profile || !ALLOWED_ROLES.has(profile.role)) return json(req, { error: 'Acceso reservado a IBERFIT Coach' }, 403);
  const input = await req.json().catch(() => ({}));
  const action = String(input.action || 'status');
  const key = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '';
  if (action === 'status') return json(req, { configured: Boolean(key), provider: key ? 'Gemini' : 'Motor IBERFIT local', model: key ? DEFAULT_MODEL : null, fallback: 'IBERFIT_DETERMINISTIC_RULES', requiresCoachApproval: true, publicationBlocked: true });
  if (!ALLOWED_ACTIONS.has(action)) return json(req, { error: 'Acción IA no válida' }, 400);
  const sanitized = clean(input);
  let proposal: any;
  let provider = 'IBERFIT_DETERMINISTIC_RULES';
  let model: string | null = null;
  if (key) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const prompt = `${baseInstructions(action)}\nEsquema esperado: ${JSON.stringify(schemaFor(action))}\nContexto y solicitud: ${JSON.stringify(sanitized)}`;
      const response = await ai.models.generateContent({ model: DEFAULT_MODEL, contents: prompt, config: { temperature: 0.15, responseMimeType: 'application/json', maxOutputTokens: 9000 } });
      proposal = parseGeminiJson(response.text || '');
      provider = 'Gemini'; model = DEFAULT_MODEL;
    } catch (error) {
      proposal = await fallbackProposal(action, input, supabase);
      proposal.limitations = [...(proposal.limitations || []), `Gemini no respondió; se usó respaldo local: ${String(error?.message || error).slice(0,180)}`];
    }
  } else proposal = await fallbackProposal(action, input, supabase);
  proposal.requiresCoachApproval = true;
  proposal.publicationBlocked = true;
  const { data: saved, error: saveError } = await supabase.from('ai_proposals').insert({ action, client_id: input.clientId || null, created_by: userData.user.id, provider, model, request_summary: sanitized, proposal, limitations: proposal.limitations || [], requires_coach_approval: true, status: 'propuesta' }).select('id,created_at').single();
  if (saveError) return json(req, { error: saveError.message }, 400);
  return json(req, { id: saved.id, createdAt: saved.created_at, provider, model, proposal, requiresCoachApproval: true, publicationBlocked: true });
});
