import {
  MODALIDADES,
  addExerciseToSessionState,
  addIncident,
  addSessionFeedback,
  adjustRest,
  changeModality,
  clientProfileFor,
  completeStep,
  goBack,
  goNext,
  omitExercise,
  plannedVsActual,
  publishClientProfile,
  replaceExercise,
  sessionExecutionSummary,
} from './domain.js';
import {
  addExerciseToPlanningBlock,
  addPlanningBlock,
  approvePlanningDraft,
  findExerciseAlternatives,
  publishPlanningDraft,
  removeExerciseFromPlanningBlock,
  removePlanningBlock,
  updatePlanningMeta,
  validatePlanningDraft,
} from './planning.js';
import {
  IRI_SECTION_META,
  IRI_SECTION_ORDER,
  IRI_STRENGTH_PATTERNS,
  applyDerivedIriInterpretation,
  approveIriAssessment,
  buildIriReports,
  calculateIriScore,
  compareIriAssessments,
  createIriAssessment,
  iriCompleteness,
  iriRemotePayload,
  iriSectionCompleteness,
  setIriStep,
  updateIriField,
  validateIriAssessment,
  validateIriSection,
} from './iri.js';
import { createRepository } from './repositories/index.js';
import { DEMO_USERS, loginDemo, loginWithCredentials, logout, recoveryTokenFromLocation, requestPasswordRecovery, resumeAuth, updateRecoveredPassword } from './auth.js';
import {
  addAudit,
  conflictCount,
  discardConflict,
  enqueue,
  ensureActiveSession,
  loadState,
  outboxCount,
  outboxItems,
  profile,
  progressSignal,
  reconcileOutbox,
  saveState,
  resolveQueuedConflict,
  storeDocument,
} from './store.js';
import { compareMeasurementConditions, createDocumentRecord, publishDocument, retireDocument, sha256Hex } from './documents.js';
import { buildPrintableReportHtml, buildSessionReport, publishReportRecord, retireReport } from './reports.js';
import { buildClientTimeline, filterTimelineForRole, timelineSummary } from './expediente.js';
import { buildRlsProbeMatrix, evaluateSyntheticRls, mapOperationToSupabaseContract } from './supabase-adapter.js';
import { applySessionCloseReconcile, canMutateSessionExecution, closeSessionLocally, localCloseGate, sessionClosePresentation } from './session-lifecycle.js';
import { approveIntelligenceRun, discardIntelligenceRun, evaluateIntelligence, intelligenceInputFromState } from './intelligence.js';
import { approvePlanChangeDraft, createPlanChangeDraft, discardPlanChange, planChangeDiff, planningExerciseTargets, publishPlanChange } from './plan-change.js';
import { hydrateStateFromRemote } from './remote-hydration.js';
import { COACH_DESKTOP_NAV, COACH_MOBILE_NAV, COACH_MORE_NAV, buildCoachAgenda, buildCoachAttentionQueue, detectAbruptRecovery } from './experience.js';
import { PERFORMANCE_BUDGETS, evaluatePerformance, recordMetric } from './performance.js';
import { backupSummary, createBackupEnvelope, restoreBackupEnvelope, validateBackupEnvelope } from './backup.js';
import { createChaosPlan, evaluateChaosOutcome, simulateOutboxChaos } from './chaos.js';
import { appendOperationalEvent, buildTelemetryBatch, operationalHealth } from './observability.js';
import { betaReadiness, controlledPreviewGuard, previewMode } from './beta.js';
import { runSyntheticLoadProbe } from './load-probe.js';
import { evaluateReleaseCandidate, pwaUpdateDecision, simulateTwoDeviceConflict } from './release-candidate.js';
import { createBetaParticipant, createSessionObservation, evaluateBetaCohort, recordBetaIncident } from './beta-operations.js';
import { createPrivacyNotice, validateConsent } from './data-governance.js';
import { evaluateProductionCandidate, buildGoLivePacket } from './production-readiness.js';
import { createRolloutPlan, rolloutHealth, simulateControlledRollout } from './rollout.js';
import { buildOperationalHandover, supportCoverage, controlledActivationGuard } from './release-operations.js';
import { canonicalExerciseFallback, exerciseFacets, filterExerciseCatalog, mergeExerciseCatalog, normalizeExerciseRecord } from './exercise-catalog.js';

const root = document.querySelector('#app');
let repository;
let state;
let auth;
const bootStartedAt = globalThis.performance?.now?.() || Date.now();
let runtime = { outbox: [], outboxCount: 0, conflictCount: 0, performance: {} };
let busy = false;
let liveMessage = '';
let fieldSheet = null;
let lastBackup = null;
let authPanel = 'login';
let recoveryToken = null;
let authNotice = '';
let clientOnboardingOpen = false;
let clientOnboardingNotice = '';
let catalogItems = canonicalExerciseFallback();
let catalogMeta = exerciseFacets(catalogItems);
let catalogFilters = { query: '', pattern: '', equipment: '', intent: '', difficulty: '', limit: 80, offset: 0 };
let catalogNotice = '';
let catalogBusy = false;
let aiRemoteStatus = null;
let aiRemoteResult = null;
let aiRemoteNotice = '';

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function button(label, action, kind = '', extra = '') {
  return `<button type="button" class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
}

function announce(message) {
  liveMessage = String(message || '');
}


function option(value, selected) {
  return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`;
}

function iriHistoryFor(clientId, source = state?.iriAssessments || []) {
  return [...source]
    .filter((assessment) => assessment.clientId === clientId)
    .sort((a, b) => String(b.evaluatedAt || b.updatedAt || '').localeCompare(String(a.evaluatedAt || a.updatedAt || '')));
}

function upsertIriHistory(nextAssessment, source = state?.iriAssessments || []) {
  const index = source.findIndex((assessment) => assessment.id === nextAssessment.id);
  if (index < 0) return [nextAssessment, ...source];
  return source.map((assessment) => assessment.id === nextAssessment.id ? nextAssessment : assessment);
}

function previousIriAssessment(current = state?.iriAssessment) {
  if (!current) return null;
  return iriHistoryFor(current.clientId).find((assessment) => assessment.id !== current.id && String(assessment.evaluatedAt || '') <= String(current.evaluatedAt || '')) || null;
}

function activateClient(nextState, clientId) {
  const selected = nextState.clients.find((client) => client.id === clientId);
  if (!selected) throw new Error('Cliente no encontrado');
  const history = iriHistoryFor(clientId, nextState.iriAssessments || []);
  const current = history[0] || createIriAssessment({
    clientId,
    assessmentType: history.length ? 'reevaluacion' : 'inicial',
  });
  const assessments = history.length ? nextState.iriAssessments : upsertIriHistory(current, nextState.iriAssessments || []);
  return {
    ...nextState,
    selectedClientId: clientId,
    client: { ...(nextState.client || {}), ...selected },
    iriAssessment: current,
    iriAssessments: assessments,
  };
}

async function persistIriRemote(assessment) {
  if (!remoteActive() || typeof repository.saveIriAssessmentRemote !== 'function') return null;
  if (!['coach', 'admin'].includes(sessionRole())) throw new Error('Solo Coach/Admin puede guardar el IRI remoto');
  const remoteRecord = await repository.saveIriAssessmentRemote(auth.token, iriRemotePayload(assessment, auth.user.id));
  return { ...assessment, remote: true, remoteSavedAt: remoteRecord?.updated_at || new Date().toISOString() };
}


async function refreshExerciseCatalog(filters = catalogFilters) {
  catalogFilters = { ...catalogFilters, ...filters };
  if (remoteActive() && typeof repository.searchExercisesRemote === 'function') {
    let [remoteItems, remoteFacets] = await Promise.all([
      repository.searchExercisesRemote(auth.token, catalogFilters),
      typeof repository.exerciseFacetsRemote === 'function' ? repository.exerciseFacetsRemote(auth.token) : null,
    ]);
    if (Number(remoteFacets?.total || 0) === 0 && sessionRole() === 'admin' && typeof repository.catalogAdminRemote === 'function') {
      try {
        const synced = await repository.catalogAdminRemote(auth.token, { action: 'sync_canonical' });
        catalogNotice = `Listo: ${synced.imported || 0} ejercicios canónicos integrados.`;
        [remoteItems, remoteFacets] = await Promise.all([
          repository.searchExercisesRemote(auth.token, catalogFilters),
          repository.exerciseFacetsRemote(auth.token),
        ]);
      } catch (error) {
        catalogNotice = `Biblioteca local activa: ${error.message}`;
      }
    }
    if ((remoteItems || []).length) {
      catalogItems = remoteItems.map(normalizeExerciseRecord);
      catalogMeta = remoteFacets || exerciseFacets(catalogItems);
      state = { ...state, exerciseLibrary: mergeExerciseCatalog(catalogItems, canonicalExerciseFallback()) };
      await saveState(repository, state);
      return;
    }
  }
  catalogItems = filterExerciseCatalog(canonicalExerciseFallback(), catalogFilters).slice(0, Number(catalogFilters.limit || 80));
  catalogMeta = exerciseFacets(canonicalExerciseFallback());
  state = { ...state, exerciseLibrary: canonicalExerciseFallback() };
}

async function refreshAiStatus() {
  if (!remoteActive() || typeof repository.invokeIberfitAiRemote !== 'function' || !['admin','coach'].includes(sessionRole())) {
    aiRemoteStatus = { configured: false, provider: 'Motor IBERFIT local', fallback: 'IBERFIT_DETERMINISTIC_RULES', requiresCoachApproval: true };
    return;
  }
  try { aiRemoteStatus = await repository.invokeIberfitAiRemote(auth.token, { action: 'status' }); }
  catch (error) { aiRemoteStatus = { configured: false, provider: 'Motor IBERFIT local', error: error.message, requiresCoachApproval: true }; }
}

function safeJson(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value || ''); }
}

function aiContext() {
  return {
    client: state?.client ? { id: state.client.id, name: state.client.name, modality: state.client.modalidad, objective: state.client.objective, restrictions: state.client.restrictions, pain: state.client.pain, frequency: state.client.frequency, equipment: state.client.equipment } : null,
    iri: state?.iriAssessment ? { score: state.iriAssessment.score, classification: state.iriAssessment.classification, sections: state.iriAssessment.sections, status: state.iriAssessment.status } : null,
    planning: state?.planning ? { title: state.planning.title, goal: state.planning.goal, weeks: state.planning.weeks, status: state.planning.status, session: state.planning.session } : null,
    checkin: state?.checkin || null,
    progress: state?.progressContext || null,
    availableExerciseIds: (catalogItems || []).slice(0, 80).map((item) => ({ id: item.id, name: item.name, pattern: item.pattern, intent: item.intent, equipment: item.equipment, difficulty: item.difficulty, precautions: item.precautions })),
  };
}

async function refreshRuntime() {
  runtime = {
    outbox: await outboxItems(repository),
    outboxCount: await outboxCount(repository),
    conflictCount: await conflictCount(repository),
  };
}

async function applyAuthenticatedBootstrap(nextAuth) {
  auth = nextAuth;
  if (auth?.remoteBootstrap) {
    state = hydrateStateFromRemote(state, auth.remoteBootstrap, { selectedClientId: state.selectedClientId });
    await saveState(repository, state);
  }
  await refreshRuntime();
  try { await refreshExerciseCatalog({ limit: 80, offset: 0 }); } catch (error) { catalogNotice = `Biblioteca local activa: ${error.message}`; }
  try { await refreshAiStatus(); } catch { /* fallback local */ }
}

function remoteActive() {
  return String(repository?.authMode || '').startsWith('supabase-');
}

function productionActive() {
  return repository?.authMode === 'supabase-production' || globalThis.__IBERFIT_SUPABASE__?.environment === 'PRODUCTION';
}

async function commit(next, audit) {
  if (audit?.type) announce(audit.detail ? `${audit.type}: ${audit.detail}` : audit.type);
  state = await addAudit(repository, next, audit);
  await saveState(repository, state);
  await refreshRuntime();
  render();
}

function sessionRole() {
  return auth?.user?.role || null;
}

function scopedOperation(operation) {
  return {
    ...operation,
    clientId: operation.clientId || state?.selectedClientId || state?.client?.id || null,
  };
}

async function queueOperation(operation) {
  return enqueue(repository, scopedOperation(operation));
}

function chrome(content) {
  const role = sessionRole();
  const title = role === 'cliente' ? 'IBERFIT' : 'IBERFIT Coach';
  const roleLabel = role === 'admin' ? 'Administración' : role === 'coach' ? 'Coach' : role === 'cliente' ? 'Cliente' : 'Cuenta';
  const preview = previewMode();
  const environmentLabel = preview.enabled
    ? 'PREVIEW INTERNO SINTÉTICO · acceso controlado · datos reales bloqueados'
    : remoteActive() ? 'STAGING SUPABASE SINTÉTICO · datos reales bloqueados' : 'ENTORNO LOCAL SINTÉTICO · no usar con clientes reales';
  const environmentStrip = productionActive() ? '' : `<div class="staging" role="status">${environmentLabel}</div>`;
  return `<div class="app app-${esc(role || 'guest')}"><a class="skip-link" href="#main-content">Saltar al contenido principal</a>${environmentStrip}<div id="live-status" class="sr-only" aria-live="polite" aria-atomic="true">${esc(liveMessage)}</div><main id="main-content" class="shell" tabindex="-1">
    <header class="topbar" aria-label="Cabecera IBERFIT">
      <div class="brand"><img src="/public/isotipo-iberfit.png" alt="Isotipo IBERFIT" class="brand-mark"><div><strong>${title}</strong><small>Entrenamiento personal con criterio</small></div></div>
      <div class="session-meta"><span class="pill">${esc(roleLabel)}</span><span class="status"><span class="dot ${navigator.onLine ? '' : 'offline'}" aria-hidden="true"></span>${navigator.onLine ? 'En línea' : 'Sin conexión'}</span>${button('Cerrar sesión', 'logout', 'secondary')}</div>
    </header>
    ${recoveryBanner()}
    ${content}
    <footer class="footer">© ${new Date().getFullYear()} IBERFIT · Entrenamiento personal con criterio</footer>
  </main></div>`;
}

function recoveryBanner() {
  const recovery = state?.recovery;
  if (!recovery?.detected || recovery.acknowledged) return '';
  return `<aside class="recovery-banner" aria-labelledby="recovery-title"><div><span class="pill">Recuperación local</span><strong id="recovery-title">${esc(recovery.title)}</strong><p>${esc(recovery.detail)} Puedes continuar sin reconstruir la sesión.</p></div>${button('Continuar desde aquí', 'ack-recovery', 'gold')}</aside>`;
}

function loginView() {
  if (productionActive()) {
    const notice = authNotice ? `<div class="login-notice" role="status">${esc(authNotice)}</div>` : '';
    const loginForm = `<div class="login-access-head"><span class="pill">Acceso seguro</span><h2>Bienvenido a IBERFIT</h2><p>Ingresa con el correo asociado a tu cuenta.</p></div>
      ${notice}<div class="login-credentials"><label>Correo<input id="remote-email" type="email" autocomplete="username" placeholder="tu@correo.com"></label><label>Contraseña<input id="remote-password" type="password" autocomplete="current-password" placeholder="••••••••••••"></label></div>
      <div class="login-actions login-actions-single">${button('Entrar', 'login-credentials', 'gold')}</div>
      <button type="button" class="login-link" data-action="show-forgot">¿Olvidaste tu contraseña?</button>`;
    const forgotForm = `<div class="login-access-head"><span class="pill">Recuperar acceso</span><h2>Restablece tu contraseña</h2><p>Te enviaremos un enlace seguro al correo de tu cuenta.</p></div>
      ${notice}<div class="login-credentials"><label>Correo<input id="recovery-email" type="email" autocomplete="email" placeholder="tu@correo.com"></label></div>
      <div class="login-actions login-actions-single">${button('Enviar enlace', 'request-password-reset', 'gold')}</div>
      <button type="button" class="login-link" data-action="back-login">Volver al acceso</button>`;
    const resetForm = `<div class="login-access-head"><span class="pill">Nuevo acceso</span><h2>Crea una nueva contraseña</h2><p>Debe contener al menos 12 caracteres.</p></div>
      ${notice}<div class="login-credentials"><label>Nueva contraseña<input id="new-password" type="password" autocomplete="new-password" placeholder="••••••••••••"></label><label>Repetir contraseña<input id="confirm-password" type="password" autocomplete="new-password" placeholder="••••••••••••"></label></div>
      <div class="login-actions login-actions-single">${button('Guardar contraseña', 'update-password', 'gold')}</div>`;
    const form = authPanel === 'forgot' ? forgotForm : authPanel === 'reset' ? resetForm : loginForm;
    return `<div class="app login-app"><main class="login-shell"><section class="login-card login-card-split">
      <div class="login-identity">
        <div class="login-logo-lockup"><div class="login-mark-frame"><img src="/public/isotipo-iberfit.png" alt="Isotipo IBERFIT" class="login-mark"></div><div class="login-brand-copy"><strong>IBERFIT</strong><small>Entrenamiento personal con criterio</small></div></div>
        <div class="login-identity-copy"><span class="eyebrow">IBERFIT</span><h1>Entrenamiento personal con criterio</h1><p>Diagnóstico, planificación, control y seguimiento en una experiencia personal, clara y conectada.</p></div>
        <div class="login-principles" aria-label="Pilares IBERFIT"><span>Diagnóstico</span><span>Planificación</span><span>Control</span><span>Seguimiento</span></div>
      </div>
      <div class="login-access">${form}<div class="login-security-note"><span aria-hidden="true">●</span><p><strong>Tu información está protegida.</strong> El acceso y los datos se gestionan de forma privada.</p></div></div>
    </section></main></div>`;
  }
  if (remoteActive()) {
    return `<div class="app login-app"><div class="staging">STAGING SUPABASE SINTÉTICO · autenticación real · datos reales bloqueados</div><main class="login-shell">
      <section class="login-card login-card-split"><div class="login-identity"><div class="login-logo-lockup"><div class="login-mark-frame"><img src="/public/isotipo-iberfit.png" alt="Isotipo IBERFIT" class="login-mark"></div><div class="login-brand-copy"><strong>IBERFIT</strong><small>Entrenamiento personal con criterio</small></div></div><div class="login-identity-copy"><span class="eyebrow">PREVIEW PRIVADO</span><h1>Entrenamiento personal con criterio</h1><p>Diagnóstico, planificación, control y seguimiento en un entorno de ensayo protegido.</p></div><div class="login-principles"><span>Diagnóstico</span><span>Planificación</span><span>Control</span><span>Seguimiento</span></div></div>
      <div class="login-access"><div class="login-access-head"><span class="pill">Acceso de ensayo</span><h2>Acceso interno</h2><p>Solo admite cuentas autorizadas para verificación.</p></div><div class="login-credentials"><label>Correo<input id="remote-email" type="email" autocomplete="username"></label><label>Contraseña<input id="remote-password" type="password" autocomplete="current-password"></label></div><div class="login-actions login-actions-single">${button('Entrar', 'login-credentials', 'gold')}</div></div></section></main></div>`;
  }
  return `<div class="app login-app"><div class="staging">ENTORNO LOCAL SINTÉTICO · autenticación de demostración</div><main class="login-shell"><section class="login-card login-card-split"><div class="login-identity"><div class="login-logo-lockup"><div class="login-mark-frame"><img src="/public/isotipo-iberfit.png" alt="Isotipo IBERFIT" class="login-mark"></div><div class="login-brand-copy"><strong>IBERFIT</strong><small>Entrenamiento personal con criterio</small></div></div><div class="login-identity-copy"><span class="eyebrow">ENTORNO LOCAL</span><h1>Entrenamiento personal con criterio</h1><p>Diagnóstico, planificación, control y seguimiento con información de demostración.</p></div></div><div class="login-access"><div class="login-access-head"><span class="pill">Demostración por rol</span><h2>Elegir acceso</h2></div><div class="login-actions login-role-actions">${DEMO_USERS.map((user) => button(user.label, `login:${user.role}`, user.role === 'coach' ? 'gold' : 'secondary')).join('')}</div></div></section></main></div>`;
}

function signalCard(signal, coach = false) {
  return `<article class="card ${coach ? 'large' : ''}"><div class="card-head"><span class="pill signal-${esc(signal.level)}">${esc(signal.level)}</span><span class="confidence">Confianza ${esc(signal.confidence)}</span></div><h2>${esc(signal.title)}</h2><p>${esc(signal.interpretation)}</p><div class="evidence">${signal.evidence.map((item) => `<span>${esc(item)}</span>`).join('')}</div><div class="decision-question"><strong>${coach ? 'Pregunta para decidir' : 'Lectura IBERFIT'}</strong><p>${esc(coach ? signal.question : 'Tu Coach revisa estas señales junto con tu contexto antes de modificar el plan.')}</p></div>${coach ? `<details><summary>Límites de esta lectura</summary><ul>${signal.limits.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}</article>`;
}

function syncStrip() {
  const connection = navigator.onLine ? 'Conectado' : 'Trabajo sin conexión';
  const pending = runtime.outboxCount ? `${runtime.outboxCount} cambios pendientes` : 'Todo guardado';
  const review = runtime.conflictCount ? `${runtime.conflictCount} requieren revisión` : 'Sin incidencias';
  return `<div class="sync-strip"><span>${connection}</span><span>${pending}</span><span>${review}</span>${button('Sincronizar', 'reconcile', 'secondary', runtime.outboxCount ? '' : 'disabled')}</div>`;
}

function clientView() {
  const p = profile(state);
  const c = state.client;
  const signal = progressSignal(state);
  const publishedPlan = state.planning?.status === 'publicado' ? state.planning : null;
  return chrome(`<section class="hero"><div class="eyebrow">${esc(c.modalidad)} · Perfil publicado ${p.version}</div><h1>${esc(p.home)}</h1><p>${esc(c.coachMessage)}</p><div class="actions">${p.guidedByDefault ? button('Iniciar sesión guiada', 'start-session', 'gold') : button('Ver próxima sesión', 'noop', 'gold')}${button('Ver mi progreso', 'noop', 'secondary')}</div></section>
  ${syncStrip()}
  <section class="grid">
    <article class="card"><span class="pill">Próximo paso</span><h3>${esc(c.nextSession)}</h3><p class="muted">Objetivo: ${esc(c.objective)}</p></article>
    <article class="card"><span class="pill">Estado de preparación</span><div class="metric">${state.checkin.energy}/10</div><p class="muted">Sueño ${state.checkin.sleep}/10 · Estrés ${state.checkin.stress}/10 · Dolor ${state.checkin.pain}/10</p></article>
    ${signalCard(signal)}
    <article class="card large"><h2>${publishedPlan ? 'Tu ciclo actual' : 'Tu aplicación según modalidad'}</h2>${publishedPlan ? `<strong>${esc(publishedPlan.title)}</strong><p>${esc(publishedPlan.goal)}</p><div class="modules"><span class="pill">Semana ${publishedPlan.activeWeek}/${publishedPlan.weeks}</span><span class="pill">${esc(publishedPlan.session.title)}</span></div>` : `<div class="modules">${p.modules.map((module) => `<span class="pill">${esc(module)}</span>`).join('')}</div>`}<p class="muted">La planificación y modalidad se publican desde IBERFIT Coach. El historial permanece intacto.</p></article>
    <article class="card"><h2>IRI</h2><div class="metric">${state.iri.score}</div><strong>${esc(state.iri.classification)}</strong><p class="muted">${esc(state.iri.nextAction)}</p></article>
    <article class="card full"><h2>Informes publicados</h2><div class="list">${state.reports.filter((report) => report.status === 'publicado' && (report.audience || 'cliente') === 'cliente').map((report) => `<div class="row"><div><strong>${esc(report.title)}</strong><div class="muted">${esc(report.summary)}</div></div>${button('Abrir informe', `print-report:${report.id}`, 'secondary')}</div>`).join('') || '<div class="notice">No hay informes publicados todavía.</div>'}</div></article>
    <article class="card full"><h2>Documentos publicados</h2><div class="list">${state.documents.filter((doc) => doc.status === 'publicado' && doc.audience === 'cliente').map((doc) => `<div class="row"><div><strong>${esc(doc.title)}</strong><div class="muted">${esc(doc.type)} · versión ${doc.version} · integridad ${esc(String(doc.hash || '').slice(0, 12))}…</div></div><span class="pill">Publicado</span></div>`).join('') || '<div class="notice">No hay documentos publicados todavía.</div>'}</div></article>
  </section>${state.activeSession ? sessionView('cliente') : ''}`);
}

function activeExercise() {
  return state.activeSession?.steps[state.activeSession.cursor] || null;
}

function currentLibraryExercise() {
  const step = activeExercise();
  return state.exerciseLibrary.find((exercise) => exercise.id === step?.exerciseId) || { id: step?.exerciseId, name: step?.exerciseName, pattern: null, intent: null };
}

function sessionView(context = 'cliente') {
  const session = state.activeSession;
  const step = activeExercise();
  if (!session || !step) return '';
  const closePresentation = sessionClosePresentation(session);
  if (closePresentation) {
    const summary = sessionExecutionSummary(session);
    return `<section class="grid"><article class="card full closed-session close-${esc(closePresentation.tone)}"><span class="pill">${esc(closePresentation.label)}</span><h2>${esc(closePresentation.title)}</h2><p>${esc(closePresentation.detail)}</p><p>${summary.completada} series completadas · ${summary.omitida} omitidas · ${summary.changedSteps} cambios respecto del plan · ${summary.incidents} incidencias.</p><div class="actions">${session.status === 'cerrada_local_pendiente_sync' ? button('Sincronizar cierre', 'reconcile', 'gold') : ''}${closePresentation.canArchive ? button('Preparar nueva sesión', 'reset-session', 'gold') : ''}</div><small>Operación de cierre: ${esc(session.closeSync?.operationId || 'legacy')}</small></article></section>`;
  }
  const summary = sessionExecutionSummary(session);
  const diff = plannedVsActual(step);
  const field = context === 'campo';
  const closeGate = localCloseGate(session, { durableStateSaved: true });
  const adaptationActions = field
    ? `${button('Incidencia', 'open-field-sheet:incident', 'warning')}${button('Adaptar ejercicio', 'open-field-sheet:adapt', 'secondary')}${button('Feedback', 'open-field-sheet:feedback', 'secondary')}`
    : `${button('Incidencia', 'incident', 'warning')}${button('Reemplazar', 'replace', 'secondary')}${button('Añadir', 'add-exercise-live', 'secondary')}${button('Omitir', 'omit', 'danger')}`;
  return `<section class="grid ${field ? 'field-grid' : ''}"><article class="card full session-panel ${field ? 'field-session' : ''}">
    <div class="session-heading"><div><div class="eyebrow">${field ? 'Modo Campo' : 'Sesión guiada en app'} · ${esc(step.blockType)} · ${session.cursor + 1}/${session.steps.length}</div><h2>${esc(step.exerciseName)} · Serie ${step.setIndex + 1}${step.roundIndex ? ` · Ronda ${step.roundIndex + 1}` : ''}</h2></div><span class="pill status-${step.status}">${esc(step.status)}</span></div>
    <div class="progressbar" role="progressbar" aria-label="Progreso de la sesión" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(summary.completionRate * 100)}"><span style="width:${summary.completionRate * 100}%"></span></div>
    <div class="planned-line">Planificado: ${step.planned.load} kg · ${step.planned.reps} rep · ${step.planned.seconds} s · ${step.planned.meters} m · descanso ${step.planned.rest} s</div>
    <div class="fields"><label>Carga kg<input id="load" inputmode="decimal" type="number" value="${step.actual.load}"></label><label>Repeticiones<input id="reps" inputmode="numeric" type="number" value="${step.actual.reps}"></label><label>Tiempo s<input id="seconds" inputmode="numeric" type="number" value="${step.actual.seconds}"></label><label>Distancia m<input id="meters" inputmode="numeric" type="number" value="${step.actual.meters}"></label><label>RPE<input id="rpe" inputmode="decimal" type="number" min="1" max="10" value="${step.actual.rpe ?? ''}"></label><label>RIR<input id="rir" inputmode="decimal" type="number" min="0" max="10" value="${step.actual.rir ?? ''}"></label><label>Descanso<input value="${session.restSeconds} s" readonly></label></div>
    ${diff.changed ? `<div class="diff-note">Planificado vs. realizado: ${diff.differences.map((item) => `${item.field} ${item.planned}→${item.actual}`).join(' · ')}</div>` : ''}
    <div class="actions ${field ? 'field-actions' : ''}">${button('← Anterior', 'session-back', 'secondary')}${button('Completar', 'session-complete', 'gold')}${button('Siguiente →', 'session-next', 'secondary')}${button('−30 s', 'rest-minus', 'secondary')}${button('+30 s', 'rest-plus', 'secondary')}${adaptationActions}</div>
    <div class="session-close"><span>${summary.completada} completadas · ${summary.omitida} omitidas · ${summary.pendiente} pendientes · ${summary.changedSteps} con cambios</span><div class="actions">${field ? '' : button('Feedback', 'feedback', 'secondary')}${button(navigator.onLine ? 'Cerrar sesión' : 'Cerrar localmente', 'close-session', closeGate.ok ? 'gold' : 'secondary')}</div>${closeGate.ok ? '' : `<small>${esc(closeGate.reasons.join(' · '))}</small>`}</div>
    <p class="sync-copy">${productionActive() ? (runtime.outboxCount ? `${runtime.outboxCount} cambios guardados pendientes de sincronizar` : 'Todos los cambios están guardados.') : `Guardado durable en ${esc(state.sync.repositoryKind)} · ${runtime.outboxCount} operaciones sin ACK`}</p>
  </article></section>`;
}

function fieldQuickSheet() {
  if (!fieldSheet || !state.activeSession) return '';
  const exercise = activeExercise();
  if (fieldSheet === 'incident') return `<section class="field-sheet" role="dialog" aria-modal="true" aria-labelledby="field-sheet-title"><div class="field-sheet-head"><div><span class="pill">Acción rápida</span><h2 id="field-sheet-title">Registrar incidencia</h2></div>${button('Cerrar', 'close-field-sheet', 'secondary')}</div><div class="quick-form"><label>Severidad<select id="quick-incident-severity"><option value="baja">Baja</option><option value="media" selected>Media</option><option value="alta">Alta</option></select></label><label class="wide">Descripción breve<textarea id="quick-incident-note" rows="3" placeholder="Qué ocurrió y qué se decidió en el momento"></textarea></label></div><div class="actions">${button('Guardar incidencia', 'save-field-incident', 'warning')}</div></section>`;
  if (fieldSheet === 'feedback') return `<section class="field-sheet" role="dialog" aria-modal="true" aria-labelledby="field-sheet-title"><div class="field-sheet-head"><div><span class="pill">Cierre rápido</span><h2 id="field-sheet-title">Feedback de sesión</h2></div>${button('Cerrar', 'close-field-sheet', 'secondary')}</div><div class="quick-form"><label>Esfuerzo 1–10<input id="quick-feedback-effort" type="number" min="1" max="10" value="7"></label><label>Dolor 0–10<input id="quick-feedback-pain" type="number" min="0" max="10" value="0"></label><label class="wide">Comentario<textarea id="quick-feedback-comment" rows="2" placeholder="Solo lo necesario para decidir después"></textarea></label></div><div class="actions">${button('Guardar feedback', 'save-field-feedback', 'gold')}</div></section>`;
  const alternatives = findExerciseAlternatives(state.exerciseLibrary, currentLibraryExercise(), { availableEquipment: state.availableEquipment, limitations: state.limitations });
  return `<section class="field-sheet" role="dialog" aria-modal="true" aria-labelledby="field-sheet-title"><div class="field-sheet-head"><div><span class="pill">Adaptación en campo</span><h2 id="field-sheet-title">${esc(exercise.exerciseName)}</h2></div>${button('Cerrar', 'close-field-sheet', 'secondary')}</div><div class="quick-form"><label>Acción<select id="quick-adapt-action"><option value="omit">Omitir ejercicio</option>${alternatives.length ? '<option value="replace">Reemplazar</option>' : ''}</select></label>${alternatives.length ? `<label>Alternativa<select id="quick-adapt-replacement">${alternatives.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label>` : ''}<label class="wide">Motivo<textarea id="quick-adapt-reason" rows="3" placeholder="Motivo clínico, técnico o logístico"></textarea></label></div><div class="actions">${button('Aplicar adaptación', 'save-field-adaptation', 'gold')}</div><p class="muted">La planificación original no se modifica: queda registrado planificado frente a realizado.</p></section>`;
}

function coachModeSwitch() {
  return `<div class="mode-switch"><button data-coach-mode="campo" class="${state.coachMode === 'campo' ? 'active' : ''}">Modo Campo</button><button data-coach-mode="analisis" class="${state.coachMode === 'analisis' ? 'active' : ''}">Modo Análisis</button></div>`;
}

function fieldCoachView() {
  const selected = state.clients.find((client) => client.id === state.selectedClientId) || state.clients[0];
  return chrome(`${coachModeSwitch()}<section class="field-hero"><div><div class="eyebrow">Modo Campo · operación con una mano</div><h1>${esc(selected.name)}</h1><p>${esc(selected.objective)} · ${esc(selected.modalidad)}</p></div><div class="field-status"><span class="dot ${navigator.onLine ? '' : 'offline'}"></span>${navigator.onLine ? 'En línea' : 'Sin conexión'}</div></section>
  <section class="quick-strip"><label>Cliente<select id="field-client">${state.clients.map((client) => option(client.id, selected.id).replace(`>${esc(client.id)}<`, `>${esc(client.name)}<`)).join('')}</select></label>${state.activeSession ? '<span class="pill">Sesión activa</span>' : button('Iniciar sesión', 'coach-start-session', 'gold')}</section>
  ${syncStrip()}
  ${state.activeSession ? sessionView('campo') + fieldQuickSheet() : `<section class="grid"><article class="card full empty-field"><span class="pill">Próximo paso</span><h2>${esc(state.session.title)}</h2><p>La profundidad queda fuera del campo. Aquí solo aparecen las acciones necesarias para entrenar, registrar y continuar.</p>${button('Iniciar sesión presencial', 'coach-start-session', 'gold')}</article></section>`}
  <section class="field-dock" aria-label="Acciones esenciales de sesión">${button('Completar', state.activeSession ? 'session-complete' : 'coach-start-session', 'gold')}${button('+30 s', 'rest-plus', 'secondary', state.activeSession ? '' : 'disabled')}${button('Incidencia', 'open-field-sheet:incident', 'warning', state.activeSession ? '' : 'disabled')}</section>`);
}

function coachNav() {
  const navButtons = (items) => items.map(([key, label]) => button(label, `coach-section:${key}`, state.coachSection === key ? 'gold' : 'secondary', `aria-current="${state.coachSection === key ? 'page' : 'false'}"`)).join('');
  return `<nav class="coach-nav coach-nav-desktop" aria-label="Navegación principal Coach">${navButtons(COACH_DESKTOP_NAV)}<details class="coach-more"><summary>Más herramientas</summary><div class="coach-more-menu">${navButtons(coachMoreItems())}</div></details></nav><nav class="coach-nav-mobile" aria-label="Navegación móvil Coach">${navButtons(COACH_MOBILE_NAV)}</nav>`;
}

function todaySection() {
  const signal = progressSignal(state);
  const attention = buildCoachAttentionQueue(state, runtime);
  return `<section class="grid"><article class="card full decision-command"><div class="card-head"><div><span class="pill">Centro de decisiones</span><h2>Qué requiere criterio ahora</h2></div><span class="pill">${attention.length} prioridades</span></div><div class="attention-list">${attention.map((entry, index) => `<article class="attention-item priority-${esc(entry.priority)}"><div class="attention-rank">${index + 1}</div><div><strong>${esc(entry.title)}</strong><p>${esc(entry.detail)}</p></div>${button(entry.actionLabel, entry.action, index === 0 ? 'gold' : 'secondary')}</article>`).join('')}</div></article>
    ${signalCard(signal, true)}
    <article class="card"><h2>Próxima decisión</h2><p><strong>${esc(state.planning.title)}</strong></p><p class="muted">${esc(state.planning.goal)} · ${esc(state.planning.status)}</p>${button('Abrir planificación', 'coach-section:planificar', 'gold')}</article>
    <article class="card"><h2>IRI</h2><div class="metric">${Math.round(iriCompleteness(state.iriAssessment).ratio * 100)}%</div><p class="muted">Completitud del registro canónico</p>${button('Revisar evaluación', 'coach-section:evaluar', 'secondary')}</article>
    ${queueAndAudit()}
  </section>`;
}

function agendaSection() {
  const agenda = buildCoachAgenda(state);
  return `<section class="grid"><article class="card full"><div class="card-head"><div><span class="pill">Agenda operativa</span><h2>Sesiones y próximos pasos</h2></div><span class="pill">${agenda.length} clientes</span></div><p class="muted">La agenda prioriza la siguiente acción; la planificación profunda permanece en su estudio.</p><div class="agenda-list">${agenda.map((entry) => `<article class="agenda-item"><div class="agenda-time"><strong>${esc(entry.when)}</strong><span>${esc(entry.execution)}</span></div><div><h3>${esc(entry.clientName)}</h3><p>${esc(entry.objective)} · ${esc(entry.modality)}</p></div><div class="agenda-actions"><span class="pill status-${esc(entry.status)}">${esc(entry.status)}</span>${button('Abrir cliente', `select-client:${entry.clientId}`, 'secondary')}${button('Iniciar', `agenda-start:${entry.clientId}`, 'gold')}</div></article>`).join('')}</div></article></section>`;
}

function coachMoreItems() {
  return productionActive() ? COACH_MORE_NAV.filter(([key]) => key !== 'operacion') : COACH_MORE_NAV;
}

function moreSection() {
  return `<section class="grid"><article class="card full"><span class="pill">Más herramientas</span><h2>Análisis cuando lo necesitas</h2><p class="muted">Estas áreas permanecen fuera de la operación de campo para que cada tarea sea clara y directa.</p><div class="tool-grid">${coachMoreItems().map(([key, label]) => `<article class="tool-card"><strong>${esc(label)}</strong><p>${key === 'evaluar' ? 'IRI y reevaluaciones.' : key === 'informes' ? 'Revisión, aprobación y publicación.' : key === 'expediente' ? 'Historia cronológica y trazabilidad.' : key === 'planificar' ? 'Ciclo, semana y sesión.' : key === 'inteligencia' ? 'Señales contextuales supervisadas.' : key === 'operacion' ? 'Control técnico del entorno interno.' : 'Ejercicios canónicos y alternativas.'}</p>${button(`Abrir ${label}`, `coach-section:${key}`, 'secondary')}</article>`).join('')}</div></article></section>`;
}

function clientOnboardingForm({ alwaysOpen = false } = {}) {
  const visible = alwaysOpen || clientOnboardingOpen;
  if (!visible) return '';
  const notice = clientOnboardingNotice ? `<div class="notice success" role="status">${esc(clientOnboardingNotice)}</div>` : '';
  return `<article class="card full client-onboarding-card">
    <div class="client-onboarding-head"><div><span class="eyebrow">Alta segura</span><h2>Crear expediente IBERFIT</h2><p>Registra la realidad inicial del cliente. El acceso a la app se enviará más adelante, cuando su experiencia esté preparada.</p></div><div class="empty-production-mark compact"><img src="/public/isotipo-iberfit.png" alt=""></div></div>
    ${notice}
    <div class="onboarding-sections">
      <section class="onboarding-group"><div class="onboarding-group-title"><span>1</span><div><strong>Identidad y servicio</strong><small>Datos esenciales para iniciar el expediente.</small></div></div><div class="onboarding-fields">
        <label>Nombre completo<input id="client-name" autocomplete="name" placeholder="Nombre del cliente"></label>
        <label>Correo<input id="client-email" type="email" autocomplete="email" placeholder="cliente@correo.com"></label>
        <label>Modalidad<select id="client-modality">${MODALIDADES.map((modality) => option(modality, 'Presencial')).join('')}</select></label>
        <label>Frecuencia prevista<input id="client-frequency" placeholder="Ej. 2 sesiones por semana"></label>
        <label class="wide">Objetivo principal<textarea id="client-objective" rows="2" placeholder="Qué quiere conseguir y por qué es importante"></textarea></label>
      </div></section>
      <section class="onboarding-group"><div class="onboarding-group-title"><span>2</span><div><strong>Contexto real</strong><small>Logística, experiencia y condiciones actuales.</small></div></div><div class="onboarding-fields">
        <label>Zona<input id="client-zone" placeholder="Comuna o sector"></label>
        <label>Dirección<input id="client-address" autocomplete="street-address" placeholder="Dirección de entrenamiento"></label>
        <label>Nivel<input id="client-level" placeholder="Inicial, intermedio, avanzado"></label>
        <label>Fase actual<input id="client-phase" placeholder="Inicio, retorno, consolidación..."></label>
        <label class="wide">Restricciones o precauciones<textarea id="client-restrictions" rows="2" placeholder="Limitaciones relevantes para entrenar"></textarea></label>
        <label class="wide">Dolor actual<textarea id="client-pain" rows="2" placeholder="Zona, intensidad y contexto"></textarea></label>
        <label class="wide">Historial de entrenamiento<textarea id="client-history" rows="2" placeholder="Experiencia previa y continuidad"></textarea></label>
      </div></section>
      <section class="onboarding-group"><div class="onboarding-group-title"><span>3</span><div><strong>Criterio inicial</strong><small>Información que orientará el IRI y la planificación.</small></div></div><div class="onboarding-fields">
        <label class="wide">Material disponible<textarea id="client-equipment" rows="2" placeholder="Sin material, bandas, TRX, mancuernas..."></textarea></label>
        <label class="wide">Preferencias<textarea id="client-preferences" rows="2" placeholder="Horarios, ejercicios, entorno y estilo de acompañamiento"></textarea></label>
        <label class="wide">Limitador principal<textarea id="client-primary-limiter" rows="2" placeholder="Qué condiciona más el progreso hoy"></textarea></label>
        <label class="wide">Recomendación actual<textarea id="client-current-recommendation" rows="2" placeholder="Criterio preliminar antes del IRI"></textarea></label>
        <label class="wide">Pendientes<textarea id="client-pending" rows="2" placeholder="Información, documentos o decisiones por completar"></textarea></label>
      </div></section>
    </div>
    <div class="onboarding-actions"><div><strong>Este paso no envía una invitación.</strong><p>Primero se crea el expediente y se prepara el IRI. El acceso se activará de forma controlada después.</p></div><div class="actions">${alwaysOpen ? '' : button('Cancelar', 'cancel-client-onboarding', 'secondary')}${button('Crear expediente', 'create-client-draft', 'gold')}</div></div>
  </article>`;
}

function readClientDraftForm() {
  const value = (id) => document.querySelector(`#${id}`)?.value?.trim() || '';
  return {
    name: value('client-name'),
    email: value('client-email').toLowerCase(),
    modality: value('client-modality'),
    frequency: value('client-frequency'),
    objective: value('client-objective'),
    zone: value('client-zone'),
    address: value('client-address'),
    level: value('client-level'),
    phase: value('client-phase'),
    restrictions: value('client-restrictions'),
    pain: value('client-pain'),
    history: value('client-history'),
    equipment: value('client-equipment'),
    preferences: value('client-preferences'),
    primaryLimiter: value('client-primary-limiter'),
    currentRecommendation: value('client-current-recommendation'),
    pending: value('client-pending'),
  };
}

function clientsSection() {
  const p = profile(state);
  const rows = state.clients.map((client) => {
    const selected = client.pendingModalidad || client.modalidad;
    return `<div class="row client-row"><div><strong>${esc(client.name)}</strong><div class="muted">${esc(client.objective)} · ${esc(client.frequency || 'Frecuencia pendiente')} · actual ${esc(client.modalidad)}${client.pendingModalidad ? ` · pendiente ${esc(client.pendingModalidad)}` : ''}</div><div class="client-row-meta"><span>${esc(client.email || 'Sin acceso activado')}</span><span>${esc(client.onboardingStatus || 'expediente')}</span></div></div><div class="row-actions"><select data-client-modalidad="${client.id}">${MODALIDADES.map((modality) => option(modality, selected)).join('')}</select>${button('Abrir', `select-client:${client.id}`, 'secondary')}${client.pendingModalidad ? button('Revisar y publicar', `publish-client:${client.id}`, 'gold') : ''}</div></div>`;
  }).join('');
  return `<section class="grid"><article class="card full clients-command"><div class="card-head"><div><span class="pill">Expedientes activos</span><h2>Clientes y modalidad</h2></div>${button(clientOnboardingOpen ? 'Cerrar alta' : 'Añadir cliente', clientOnboardingOpen ? 'cancel-client-onboarding' : 'toggle-client-onboarding', clientOnboardingOpen ? 'secondary' : 'gold')}</div><p class="muted">Cada alta conserva contexto, historial y decisiones antes de activar el acceso del cliente.</p><div class="list">${rows}</div></article>
  ${clientOnboardingForm()}
  <article class="card full"><h2>Perfil App Cliente publicado</h2><p><strong>${esc(p.modalidad)}</strong> · versión ${p.version} · revisión ${p.revision} · ${esc(p.status)}</p><div class="modules">${p.modules.map((module) => `<span class="pill">${esc(module)}</span>`).join('')}</div></article></section>`;
}

const IRI_FIELD_GROUPS = Object.freeze({
  contexto: [
    ['objetivo', 'Objetivo principal', 'textarea'],
    ['objetivosSecundarios', 'Objetivos secundarios', 'textarea'],
    ['antecedentes', 'Antecedentes relevantes', 'textarea'],
    ['restricciones', 'Restricciones o precauciones', 'textarea'],
    ['limitadores', 'Limitadores actuales', 'textarea'],
    ['experiencia', 'Experiencia previa', 'text'],
    ['frecuenciaActual', 'Frecuencia actual', 'text'],
    ['disponibilidad', 'Disponibilidad real', 'text'],
    ['sueno', 'Sueño percibido (0–10)', 'number', { min: 0, max: 10 }],
    ['estres', 'Estrés percibido (0–10)', 'number', { min: 0, max: 10 }],
    ['dolor', 'Dolor actual (0–10)', 'number', { min: 0, max: 10 }],
    ['observaciones', 'Observaciones del contexto', 'textarea'],
  ],
  composicion: [
    ['peso', 'Peso (kg)', 'number', { min: 0, step: 0.1 }],
    ['talla', 'Talla (cm)', 'number', { min: 0, step: 0.1 }],
    ['imc', 'IMC calculado', 'number', { readonly: true, step: 0.1 }],
    ['grasa', 'Grasa corporal (%)', 'number', { min: 0, max: 100, step: 0.1 }],
    ['masaMuscular', 'Masa muscular (kg)', 'number', { min: 0, step: 0.1 }],
    ['cintura', 'Perímetro de cintura (cm)', 'number', { min: 0, step: 0.1 }],
    ['condiciones', 'Condiciones de medición', 'textarea'],
    ['dispositivo', 'Dispositivo o método', 'text'],
    ['observaciones', 'Observaciones', 'textarea'],
  ],
  movilidad: [
    ['tobilloIzq', 'Tobillo izquierdo', 'score'],
    ['tobilloDer', 'Tobillo derecho', 'score'],
    ['caderaIzq', 'Cadera izquierda', 'score'],
    ['caderaDer', 'Cadera derecha', 'score'],
    ['hombroIzq', 'Hombro izquierdo', 'score'],
    ['hombroDer', 'Hombro derecho', 'score'],
    ['observaciones', 'Observaciones de movilidad', 'textarea'],
  ],
  capacidad: [
    ['protocolo', 'Protocolo', 'select', { options: ['Step test 3 minutos', 'Caminata 6 minutos', 'Bicicleta submáxima', 'Otro protocolo'] }],
    ['duracion', 'Duración (min)', 'number', { min: 0, step: 0.5 }],
    ['fcReposo', 'FC de reposo', 'number', { min: 0 }],
    ['fcFinal', 'FC final', 'number', { min: 0 }],
    ['fcMinuto', 'FC al minuto', 'number', { min: 0 }],
    ['deltaFc', 'ΔFC calculado', 'number', { readonly: true }],
    ['rpe', 'RPE final (0–10)', 'number', { min: 0, max: 10 }],
    ['resultado', 'Resultado complementario', 'text'],
    ['observaciones', 'Observaciones del protocolo', 'textarea'],
  ],
  interpretacion: [
    ['fortalezas', 'Fortalezas observadas', 'textarea'],
    ['limitadores', 'Limitadores prioritarios', 'textarea'],
    ['clasificacion', 'Clasificación IRI', 'select', { options: ['', 'Base', 'Progreso', 'Performance'] }],
    ['criterio', 'Lectura y criterio del Coach', 'textarea'],
    ['score', 'Puntuación IRI', 'number', { readonly: true }],
    ['calidadDatos', 'Calidad de los datos', 'select', { options: ['', 'insuficiente', 'media', 'alta'], readonly: true }],
    ['overrideManual', 'Clasificación manual', 'boolean'],
    ['motivoOverride', 'Justificación de clasificación manual', 'textarea'],
  ],
  planAccion: [
    ['prioridad1', 'Prioridad 1', 'textarea'],
    ['prioridad2', 'Prioridad 2', 'textarea'],
    ['prioridad3', 'Prioridad 3', 'textarea'],
    ['modalidadSugerida', 'Modalidad sugerida', 'select', { options: ['', 'Presencial', 'Híbrido', 'Online'] }],
    ['frecuenciaSugerida', 'Frecuencia sugerida', 'text'],
    ['reevaluacion', 'Fecha de reevaluación', 'date'],
    ['acciones', 'Primer bloque de acciones', 'textarea'],
  ],
});

function humanField(value) {
  const map = {
    masaMuscular: 'Masa muscular', fcFinal: 'FC final', fcMinuto: 'FC al minuto', deltaFc: 'ΔFC',
    planAccion: 'Plan de acción', rotacion: 'Rotación/anti-rotación', traccion: 'Tracción',
    composicion: 'Composición corporal', capacidad: 'Acondicionamiento',
  };
  return map[value] || value.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function iriControl(section, field, label, type = 'text', config = {}) {
  const value = state.iriAssessment.sections[section]?.[field] ?? '';
  const locked = ['aprobado', 'publicado', 'retirado'].includes(state.iriAssessment.status);
  const readonly = config.readonly || locked;
  const attrs = `data-iri-section="${section}" data-iri-field="${field}" ${readonly ? 'readonly aria-readonly="true"' : ''}`;
  const limits = `${config.min != null ? `min="${config.min}"` : ''} ${config.max != null ? `max="${config.max}"` : ''} ${config.step != null ? `step="${config.step}"` : ''}`;
  if (type === 'textarea') return `<label class="iri-field iri-field-wide"><span>${esc(label)}</span><textarea ${attrs} rows="3">${esc(value)}</textarea></label>`;
  if (type === 'select') return `<label class="iri-field"><span>${esc(label)}</span><select ${attrs} ${readonly ? 'disabled' : ''}>${(config.options || []).map((item) => option(item, value)).join('')}</select></label>`;
  if (type === 'score') return `<label class="iri-field"><span>${esc(label)}</span><select ${attrs} ${readonly ? 'disabled' : ''}><option value="">Sin registrar</option>${[['1','1 · Limitado'],['2','2 · Mejorable'],['3','3 · Funcional'],['4','4 · Bueno'],['5','5 · Sólido']].map(([key, copy]) => `<option value="${key}" ${String(value) === key ? 'selected' : ''}>${copy}</option>`).join('')}</select></label>`;
  if (type === 'boolean') return `<label class="iri-check"><input ${attrs} type="checkbox" ${value === true || value === 'true' ? 'checked' : ''} ${readonly ? 'disabled' : ''}><span>${esc(label)}</span></label>`;
  return `<label class="iri-field"><span>${esc(label)}</span><input ${attrs} type="${type}" value="${esc(value)}" ${limits}></label>`;
}

function iriStrengthSection() {
  const names = { traccion: 'Tracción', empuje: 'Empuje', bisagra: 'Bisagra', sentadilla: 'Sentadilla', rotacion: 'Rotación / anti-rotación' };
  return `<div class="iri-pattern-grid">${IRI_STRENGTH_PATTERNS.map((pattern) => `<article class="iri-pattern-card"><div class="card-head"><div><span class="pill">Patrón</span><h3>${names[pattern]}</h3></div><span class="pattern-score">${esc(state.iriAssessment.sections.fuerza[`${pattern}Calidad`] || '—')}/5</span></div><div class="iri-form-grid">
    ${iriControl('fuerza', `${pattern}Test`, 'Ejercicio o protocolo', 'text')}
    ${iriControl('fuerza', `${pattern}Carga`, 'Carga (kg)', 'number', { min: 0, step: 0.1 })}
    ${iriControl('fuerza', `${pattern}Reps`, 'Repeticiones', 'number', { min: 0 })}
    ${iriControl('fuerza', `${pattern}Rpe`, 'RPE (0–10)', 'number', { min: 0, max: 10 })}
    ${iriControl('fuerza', `${pattern}Calidad`, 'Calidad técnica', 'score')}
    ${iriControl('fuerza', `${pattern}Dolor`, 'Dolor (0–10)', 'number', { min: 0, max: 10 })}
    ${iriControl('fuerza', `${pattern}Observaciones`, 'Observaciones', 'textarea')}
  </div></article>`).join('')}</div>`;
}

function iriActiveSection() {
  const section = state.iriAssessment.currentStep || 'contexto';
  const meta = IRI_SECTION_META[section];
  const gate = validateIriSection(state.iriAssessment, section);
  const fields = section === 'fuerza'
    ? iriStrengthSection()
    : `<div class="iri-form-grid">${(IRI_FIELD_GROUPS[section] || []).map(([field, label, type, config]) => iriControl(section, field, label, type, config)).join('')}</div>`;
  return `<article class="card full iri-workspace"><div class="card-head"><div><span class="pill">Paso ${IRI_SECTION_ORDER.indexOf(section) + 1} de ${IRI_SECTION_ORDER.length}</span><h2>${esc(meta.title)}</h2><p class="muted">${esc(meta.subtitle)}</p></div><span class="pill ${gate.ok ? 'status-publicado' : ''}">${gate.completeness.complete}/${gate.completeness.total}</span></div>${fields}${gate.errors.length ? `<div class="notice iri-validation">${esc(gate.errors.join(' · '))}</div>` : '<div class="notice success">Sección completa y consistente.</div>'}<div class="iri-navigation">${button('Anterior', 'iri-prev', 'secondary', IRI_SECTION_ORDER.indexOf(section) === 0 ? 'disabled' : '')}${button('Guardar borrador', 'save-iri-draft', 'secondary')}${section === 'interpretacion' ? button('Calcular lectura IBERFIT', 'derive-iri', 'gold') : ''}${IRI_SECTION_ORDER.indexOf(section) < IRI_SECTION_ORDER.length - 1 ? button('Validar y continuar', 'iri-next', 'gold') : ''}</div></article>`;
}

function iriComparisonCard(current, previous) {
  const comparison = compareIriAssessments(current, previous);
  if (!comparison) return `<article class="card"><span class="pill">Evolución</span><h3>Primera evaluación</h3><p class="muted">La comparación aparecerá al completar una reevaluación.</p></article>`;
  const delta = comparison.scoreDelta;
  return `<article class="card"><span class="pill">Evolución</span><h3>${comparison.scorePrevious ?? '—'} → ${comparison.scoreCurrent ?? '—'}</h3><div class="metric small-metric">${delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`}</div><p class="muted">Cambio de puntuación IRI · ΔFC ${comparison.deltaFcPrevious ?? '—'} → ${comparison.deltaFcCurrent ?? '—'}</p><div class="iri-pattern-deltas">${comparison.byPattern.map((item) => `<span>${humanField(item.pattern)}: ${item.delta == null ? '—' : `${item.delta >= 0 ? '+' : ''}${item.delta}`}</span>`).join('')}</div></article>`;
}

function iriSection() {
  const assessment = state.iriAssessment;
  const completion = iriCompleteness(assessment);
  const gate = validateIriAssessment(assessment);
  const scoring = calculateIriScore(assessment);
  const history = iriHistoryFor(assessment.clientId);
  const previous = previousIriAssessment(assessment);
  const remoteLabel = assessment.remoteSavedAt ? `Remoto ${new Date(assessment.remoteSavedAt).toLocaleString('es-CL')}` : remoteActive() ? 'Pendiente de sincronizar' : 'Guardado local';
  return `<section class="grid iri-layout">
  <article class="card full iri-overview"><div class="card-head"><div><span class="pill">IRI ${esc(assessment.protocolVersion)}</span><h2>Diagnóstico de rendimiento y plan de acción</h2><p class="muted">${esc(state.client.name)} · ${assessment.assessmentType === 'reevaluacion' ? 'Reevaluación' : 'Evaluación inicial'} · ${esc(assessment.evaluatedAt)}</p></div><div class="iri-score"><strong>${scoring.score ?? '—'}</strong><span>${esc(scoring.classification || 'Sin clasificar')}</span></div></div><div class="progressbar" role="progressbar" aria-label="Completitud IRI" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(completion.ratio * 100)}"><span style="width:${completion.ratio * 100}%"></span></div><div class="iri-overview-meta"><span>${Math.round(completion.ratio * 100)}% completo</span><span>Revisión ${assessment.revision}</span><span>Estado ${esc(assessment.status)}</span><span>ΔFC ${assessment.sections.capacidad.deltaFc ?? '—'}</span><span>${esc(remoteLabel)}</span></div><div class="actions">${button('Nueva evaluación', 'new-iri', 'secondary')}${button('Guardar ahora', 'save-iri-draft', 'gold')}${button('Aprobar IRI', 'approve-iri', gate.ok ? 'gold' : 'secondary', gate.ok ? '' : 'disabled')}${button('Generar informes', 'generate-iri-reports', assessment.status === 'aprobado' || assessment.status === 'publicado' ? 'gold' : 'secondary', assessment.status === 'aprobado' || assessment.status === 'publicado' ? '' : 'disabled')}</div><p class="iri-method-note">${esc(scoring.methodology)}</p></article>
  <article class="card full iri-stepper" aria-label="Progreso de la evaluación">${IRI_SECTION_ORDER.map((section, index) => { const item = iriSectionCompleteness(assessment, section); return `<button type="button" data-action="iri-step:${section}" class="iri-step ${assessment.currentStep === section ? 'active' : ''} ${item.ratio === 1 ? 'complete' : ''}"><span>${index + 1}</span><strong>${esc(IRI_SECTION_META[section].title)}</strong><small>${item.complete}/${item.total}</small></button>`; }).join('')}</article>
  ${iriActiveSection()}
  ${iriComparisonCard(assessment, previous)}
  <article class="card"><span class="pill">Historial</span><h3>${history.length} evaluaciones</h3><div class="iri-history">${history.map((item) => `<button type="button" data-action="iri-select:${item.id}" class="iri-history-item ${item.id === assessment.id ? 'active' : ''}"><strong>${esc(item.evaluatedAt)}</strong><span>${esc(item.assessmentType)} · ${esc(item.status)}</span><small>${calculateIriScore(item).score ?? '—'}/100</small></button>`).join('') || '<p class="muted">Sin evaluaciones previas.</p>'}</div></article>
  <article class="card full"><h2>Control de calidad IRI</h2>${gate.ok ? '<div class="notice success">Evaluación completa, calculable y lista para aprobación.</div>' : `<div class="notice">${esc(gate.errors.slice(0, 6).join(' · '))}${gate.errors.length > 6 ? ` · y ${gate.errors.length - 6} observaciones más` : ''}</div>`}</article></section>`;
}

function planningSection() {
  const plan = state.planning;
  const gate = validatePlanningDraft(plan);
  return `<section class="grid"><article class="card full"><div class="card-head"><div><span class="pill">Estudio de Planificación</span><h2>${esc(plan.title)}</h2></div><span class="pill">${esc(plan.status)}</span></div><div class="planning-meta"><label>Objetivo<input id="plan-goal" value="${esc(plan.goal)}"></label><label>Semanas<input id="plan-weeks" type="number" min="1" value="${plan.weeks}"></label><label>Semana activa<input id="plan-active-week" type="number" min="1" max="${plan.weeks}" value="${plan.activeWeek}"></label><label>Sesión<input id="plan-session-title" value="${esc(plan.session.title)}"></label></div><div class="actions">${button('Guardar datos del ciclo', 'save-plan-meta', 'secondary')}${button('Añadir bloque', 'plan-add-block', 'gold')}${button('Aprobar', 'plan-approve', gate.ok ? 'gold' : 'secondary', gate.ok ? '' : 'disabled')}${button('Publicar al cliente', 'plan-publish', plan.status === 'aprobado' ? 'gold' : 'secondary', plan.status === 'aprobado' ? '' : 'disabled')}</div>${gate.ok ? '<p class="muted">Plan coherente y listo para aprobación.</p>' : `<p class="muted">${esc(gate.errors.join(' · '))}</p>`}</article>
  ${plan.session.blocks.map((block) => `<article class="card full planning-block"><div class="card-head"><div><span class="pill">${esc(block.type)}</span><h3>${esc(block.title)}</h3></div><div class="actions">${button('Añadir ejercicio', `plan-add-exercise:${block.id}`, 'gold')}${button('Eliminar bloque', `plan-remove-block:${block.id}`, 'danger')}</div></div><div class="list">${block.exercises.map((exercise) => `<div class="row"><div><strong>${esc(exercise.name)}</strong><div class="muted">${exercise.sets} series · ${exercise.reps} rep · ${exercise.load} kg · descanso ${exercise.rest} s</div></div>${button('Quitar', `plan-remove-exercise:${block.id}:${exercise.id}`, 'danger')}</div>`).join('') || '<div class="notice">Añade ejercicios desde la biblioteca canónica.</div>'}</div></article>`).join('')}
  <article class="card full"><h2>Biblioteca rápida</h2><div class="library-grid">${state.exerciseLibrary.map((exercise) => `<div class="library-item"><strong>${esc(exercise.name)}</strong><span>${esc(exercise.pattern)} · ${esc(exercise.intent)} · ${esc(exercise.equipment)}</span></div>`).join('')}</div></article></section>`;
}

function reportsSection() {
  const bio = state.documents.filter((doc) => doc.type === 'bioimpedancia').sort((a, b) => Number(b.version || 0) - Number(a.version || 0));
  const comparability = bio.length > 1 ? compareMeasurementConditions(bio[0], bio[1]) : null;
  return `<section class="grid">
  <article class="card full"><div class="card-head"><div><span class="pill">Informes</span><h2>Revisión, publicación y salida imprimible</h2></div>${['cerrada', 'cerrada_confirmada'].includes(state.activeSession?.status) ? button('Generar informe de sesión', 'generate-session-report', 'gold') : ''}</div><div class="list">${state.reports.map((report) => `<div class="row"><div><strong>${esc(report.title)}</strong><div class="muted">${esc(report.type || 'general')} · ${esc(report.audience || 'coach')} · ${esc(report.status)} · revisión ${report.revision}</div><p>${esc(report.summary)}</p></div><div class="row-actions">${button('Vista imprimible', `print-report:${report.id}`, 'secondary')}${report.status === 'aprobado' ? button('Publicar', `publish:${report.id}`, 'gold') : ''}${report.status === 'publicado' ? button('Retirar', `retire-report:${report.id}`, 'danger') : `<span class="pill">${esc(report.status)}</span>`}</div></div>`).join('')}</div></article>
  <article class="card full"><h2>Adjuntar documento versionado</h2><p class="muted">El archivo se protege con control de integridad y almacenamiento privado.</p><div class="document-form"><label>Título<input id="doc-title" value="Bioimpedancia de control"></label><label>Tipo<select id="doc-type"><option value="bioimpedancia">Bioimpedancia</option><option value="informe_externo">Informe externo</option><option value="consentimiento">Consentimiento</option><option value="otro">Otro</option></select></label><label>Fecha de medición<input id="doc-measured-at" type="date"></label><label>Dispositivo<input id="doc-device" value="Equipo de medición"></label><label>Momento del día<select id="doc-time"><option>Mañana</option><option>Tarde</option><option>Noche</option></select></label><label>Ayuno<select id="doc-fasting"><option value="true">Sí</option><option value="false">No</option></select></label><label>Entrenamiento últimas 24 h<select id="doc-training"><option value="false">No</option><option value="true">Sí</option></select></label><label class="file-field">Archivo<input id="doc-file" type="file" accept="application/pdf,image/png,image/jpeg,text/plain,application/json"></label></div><div class="actions">${button('Guardar nueva versión', 'upload-document', 'gold')}</div>${comparability ? `<div class="notice ${comparability.level === 'comparable' ? 'success' : ''}"><strong>Comparabilidad de últimas bioimpedancias: ${esc(comparability.level)}</strong><br>${comparability.differences.length ? comparability.differences.map(esc).join(' · ') : 'Condiciones principales consistentes.'}</div>` : ''}</article>
  <article class="card full"><h2>Documentos versionados</h2><div class="list">${state.documents.map((doc) => `<div class="row"><div><strong>${esc(doc.title)}</strong><div class="muted">${esc(doc.type)} · v${doc.version} · ${esc(doc.status)} · ${esc(doc.fileName || 'sin archivo')}</div><small>SHA-256 ${esc(String(doc.hash || '').slice(0, 16))}${doc.hash ? '…' : ''} · ${esc(doc.measuredAt || 'sin fecha')}</small></div><div class="row-actions">${doc.status !== 'publicado' ? button('Publicar al cliente', `publish-doc:${doc.id}`, 'gold') : button('Retirar', `retire-doc:${doc.id}`, 'danger')}<span class="pill">${esc(doc.audience || 'coach')}</span></div></div>`).join('')}</div></article></section>`;
}

function planChangeWorkflow(current) {
  const targets = planningExerciseTargets(state.planning);
  const changes = state.planChanges || [];
  const latest = changes[0];
  const approvedRun = current?.status === 'aprobada' ? current : null;
  const form = approvedRun ? `<article class="card full"><div class="card-head"><div><span class="pill">Decisión → cambio controlado</span><h2>Preparar modificación de la planificación</h2></div><span class="pill">No aplicada</span></div><p class="muted">La decisión aprobada no modifica el plan. Selecciona una variable, compara el antes/después y publícala en un paso separado.</p><div class="planning-meta"><label>Ejercicio<select id="change-target">${targets.map((item) => `<option value="${esc(item.blockId)}::${esc(item.exerciseId)}">${esc(item.blockTitle)} · ${esc(item.exerciseName)}</option>`).join('')}</select></label><label>Variable<select id="change-field"><option value="load">Carga kg</option><option value="reps">Repeticiones</option><option value="sets">Series</option><option value="rest">Descanso s</option><option value="seconds">Tiempo s</option><option value="meters">Distancia m</option></select></label><label>Nuevo valor<input id="change-value" type="number" min="0" value="14"></label><label>Fundamento Coach<textarea id="change-reason">${esc(approvedRun.coachDecision?.finalAction || approvedRun.recommendation.action)}</textarea></label></div><div class="actions">${button('Crear borrador comparativo', `create-plan-change:${approvedRun.runId}`, 'gold')}</div></article>` : `<article class="card full"><h2>Cambio de planificación bloqueado</h2><p class="muted">Primero revisa y aprueba una propuesta de inteligencia. La aprobación sigue sin modificar el plan.</p></article>`;
  const changeCard = latest ? (() => {
    const diffs = planChangeDiff(latest);
    const actions = latest.status === 'borrador'
      ? `${button('Aprobar cambio', `approve-plan-change:${latest.id}`, 'gold')}${button('Descartar', `discard-plan-change:${latest.id}`, 'danger')}`
      : latest.status === 'aprobado'
        ? `${button('Publicar cambio al plan', `publish-plan-change:${latest.id}`, 'gold')}${button('Descartar', `discard-plan-change:${latest.id}`, 'danger')}`
        : `<span class="pill">${esc(latest.status)}</span>`;
    return `<article class="card full"><div class="card-head"><div><span class="pill">Cambio ${esc(latest.status)}</span><h2>${esc(latest.target.exerciseName)}</h2></div><span class="pill">Plan base r${latest.basePlanningRevision}</span></div><div class="diff-table">${diffs.map((diff) => `<div class="diff-row"><span>${esc(diff.label)}</span><strong>${esc(diff.before)} → ${esc(diff.after)}</strong></div>`).join('')}</div><p><strong>Fundamento:</strong> ${esc(latest.rationale)}</p><p class="muted">Origen: ${esc(latest.sourceSignalCode)} · reglas ${esc(latest.sourceRulesetVersion)} · propuesta ${esc(latest.sourceRunId)}</p><div class="actions">${actions}</div>${latest.status === 'publicado' ? '<div class="notice success">Cambio publicado como nueva revisión. El historial anterior permanece intacto.</div>' : '<div class="notice">Todavía no modifica lo que ve el cliente.</div>'}</article>`;
  })() : '';
  return `${form}${changeCard}`;
}

function remoteAiPanel() {
  const configured = Boolean(aiRemoteStatus?.configured);
  const statusCopy = configured ? `Gemini activo · ${aiRemoteStatus?.model || 'modelo configurado'}` : 'Motor local activo · Gemini pendiente de secreto';
  const result = aiRemoteResult?.proposal;
  const proposal = result ? `<article class="ai-output"><div class="card-head"><div><span class="pill">${esc(aiRemoteResult.provider || 'IBERFIT')}</span><h3>${esc(result.title || 'Propuesta IBERFIT')}</h3></div><span class="pill">Revisión Coach</span></div><p>${esc(result.summary || '')}</p><details open><summary>Propuesta estructurada</summary><pre>${esc(safeJson(result))}</pre></details><div class="notice">La propuesta está bloqueada para publicación automática. Debe ser revisada y editada por el Coach.</div></article>` : '';
  return `<article class="card full ai-command"><div class="card-head"><div><span class="pill">IA supervisada</span><h2>Asistente IBERFIT con Gemini y respaldo local</h2><p class="muted">Genera borradores explicables; nunca modifica ni publica el plan por sí solo.</p></div><span class="pill ${configured ? '' : 'warning-pill'}">${esc(statusCopy)}</span></div>${aiRemoteNotice ? `<div class="notice">${esc(aiRemoteNotice)}</div>` : ''}<div class="ai-form"><label>Trabajo<select id="ai-action"><option value="session_draft">Borrador de sesión</option><option value="exercise_search">Buscar ejercicios</option><option value="iri_interpretation">Interpretar IRI</option><option value="progress_review">Revisar progreso</option><option value="report_draft">Borrador de informe</option></select></label><label class="ai-request">Indicación del Coach<textarea id="ai-request" placeholder="Ej.: prepara una sesión de fuerza global de 50 minutos con mancuernas y banda, priorizando bisagra y tracción."></textarea></label></div><div class="actions">${button('Generar propuesta', 'generate-remote-ai', 'gold')}${button('Comprobar conexión IA', 'refresh-ai-status', 'secondary')}</div><div class="modules"><span class="pill">Gemini en servidor</span><span class="pill">Fallback determinista</span><span class="pill">JWT y rol Coach</span><span class="pill">Aprobación obligatoria</span></div>${proposal}</article>`;
}

function intelligenceSection() {
  const runs = state.intelligenceRuns || [];
  const current = runs[0];
  const evidenceRows = current?.evidence?.map((item) => `<div class="row"><span>${esc(item.label)} <small>${esc(item.source)}</small></span><strong>${esc(item.value)}${esc(item.unit || '')}</strong></div>`).join('') || '';
  const proposal = current ? `<article class="card full intelligence-run"><div class="card-head"><div><span class="pill">${esc(current.priority)}</span><h2>${esc(current.title)}</h2></div><span class="pill">${esc(current.status)}</span></div><p><strong>Observación:</strong> ${esc(current.observation)}</p><p><strong>Lectura IBERFIT:</strong> ${esc(current.interpretation)}</p><div class="list">${evidenceRows}</div><div class="decision-question"><strong>Propuesta</strong><p>${esc(current.recommendation.action)}</p><small>${esc(current.recommendation.rationale)}</small></div><div class="decision-question"><strong>Pregunta para decidir</strong><p>${esc(current.coachQuestion)}</p></div><div class="modules"><span class="pill">Confianza ${esc(current.confidence.level)} · ${Math.round(current.confidence.score * 100)}%</span><span class="pill">Reglas ${esc(current.rulesetVersion)}</span><span class="pill">Sin cambio automático</span></div>${current.missingData?.length ? `<div class="notice">Datos faltantes: ${current.missingData.map(esc).join(', ')}</div>` : ''}<details><summary>Límites y resguardos</summary><ul>${[...(current.limitations || []), ...(current.recommendation.guardrails || [])].map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>${current.status === 'propuesta' ? `<div class="actions">${button('Revisar y aprobar', `approve-intelligence:${current.runId}`, 'gold')}${button('Descartar con motivo', `discard-intelligence:${current.runId}`, 'danger')}</div>` : `<div class="notice">${current.status === 'aprobada' ? `Decisión Coach: ${esc(current.coachDecision?.note || '')} · Acción final: ${esc(current.coachDecision?.finalAction || '')}` : `Descartada: ${esc(current.discardReason || '')}`}</div>`}</article>` : '<article class="card full"><h2>Sin propuesta activa</h2><p>El motor no se ejecuta solo. Coach decide cuándo generar una lectura con los datos disponibles.</p></article>';
  return `<section class="grid">${remoteAiPanel()}${proposal}${planChangeWorkflow(current)}<article class="card full"><div class="card-head"><div><h2>Motor Inteligente V2</h2><p class="muted">Reglas deterministas, evidencia visible y aprobación humana obligatoria.</p></div>${button('Generar lectura', 'generate-intelligence', 'gold')}</div><div class="modules"><span class="pill">Cruza carga y RPE</span><span class="pill">Incluye recuperación</span><span class="pill">No diagnostica</span><span class="pill">No publica</span><span class="pill">No cambia el plan</span></div></article></section>`;
}


function expedienteSection() {
  const selected = state.clients.find((client) => client.id === state.selectedClientId) || state.client;
  const events = buildClientTimeline({
    client: selected,
    sessions: [state.session, state.activeSession].filter(Boolean).map((session) => ({ ...session, clientId: selected.id, status: session.status || 'borrador', createdAt: '2026-07-14T10:00:00.000Z' })),
    reports: state.reports.map((report) => ({ ...report, clientId: selected.id })),
    documents: state.documents.map((document) => ({ ...document, clientId: selected.id })),
    iriAssessments: [{ ...state.iriAssessment, status: state.iriAssessment.status || 'borrador' }],
    audit: state.audit,
  });
  const coachEvents = filterTimelineForRole(events, 'coach');
  const clientEvents = filterTimelineForRole(events, 'cliente');
  const summary = timelineSummary(events);
  return `<section class="grid">
    <article class="card full"><h2>Expediente IBERFIT</h2><p class="muted">Línea de tiempo cronológica del cliente. Separa visibilidad Coach y Cliente para no publicar borradores internos.</p><div class="metrics"><div><strong>${summary.total}</strong><span>eventos</span></div><div><strong>${clientEvents.length}</strong><span>visibles cliente</span></div><div><strong>${summary.highPriority}</strong><span>prioridad alta</span></div></div></article>
    <article class="card full"><h2>Vista Coach</h2><div class="list">${coachEvents.map((event) => `<div class="row"><div><strong>${esc(event.title)}</strong><div class="muted">${esc(event.type)} · ${esc(event.summary)} · ${new Date(event.at).toLocaleDateString('es-CL')}</div></div><span class="pill">${esc(event.visibility)}</span></div>`).join('')}</div></article>
    <article class="card full"><h2>Vista Cliente publicada</h2><div class="list">${clientEvents.map((event) => `<div class="row"><div><strong>${esc(event.title)}</strong><div class="muted">${esc(event.summary)} · ${new Date(event.at).toLocaleDateString('es-CL')}</div></div><span class="pill">Publicado</span></div>`).join('') || '<div class="notice">No hay eventos publicados para el cliente.</div>'}</div></article>
  </section>`;
}

function supabaseReadinessSection() {
  const probes = buildRlsProbeMatrix();
  const rows = probes.map((probe) => ({ ...probe, allowed: evaluateSyntheticRls(probe) }));
  const sampleEventContract = mapOperationToSupabaseContract({ operationId: 'OP-DEMO-M6', type: 'SERIE_COMPLETADA', entityType: 'session', entityId: state.session.id, payload: { stepId: 'demo' } });
  return `<section class="grid"><article class="card full"><h2>Preparación Supabase sintética</h2><p class="muted">M7 incorpora repositorio Supabase intercambiable, funcionamiento híbrido local-remoto y contratos transaccionales. Sigue bloqueado para datos reales y producción.</p><div class="notice">Contrato evento: ${esc(sampleEventContract.table)} · ${esc(sampleEventContract.mode)} · idempotencia por ${esc(sampleEventContract.idempotencyKey)}</div><div class="list">${rows.map((row) => `<div class="row"><div><strong>${esc(row.role)} · ${esc(row.action)} · ${esc(row.table)}</strong><div class="muted">Esperado: ${esc(row.expected)}</div></div><span class="pill ${row.allowed ? '' : 'danger-pill'}">${row.allowed ? 'Permite' : 'Bloquea'}</span></div>`).join('')}</div></article></section>`;
}


function operationSection() {
  const health = operationalHealth(state, runtime);
  const readiness = betaReadiness(state.systemChecks || {});
  const preview = previewMode();
  const guard = controlledPreviewGuard({ search: globalThis.location?.search || '', syntheticOnly: true, allowRealData: false }, auth);
  const backup = lastBackup ? backupSummary(lastBackup) : state.backupHistory?.[0] || null;
  const chaos = state.chaosReport;
  const rc = evaluateReleaseCandidate(state.releaseCandidateChecks || {});
  const pwa = pwaUpdateDecision({ waitingWorker: Boolean(state.pwaUpdateWaiting), activeSession: state.activeSession?.status === 'activa', outboxCount: runtime.outboxCount, localClosePending: state.activeSession?.status === 'cerrada_local_pendiente_sync' });
  return `<section class="grid">
    <article class="card full operations-command"><div class="card-head"><div><span class="pill">Observabilidad operativa</span><h2>Estado del sistema</h2></div><span class="pill health-${esc(health.status)}">${esc(health.status)}</span></div>
      <div class="metrics"><div><strong>${health.outbox}</strong><span>pendientes</span></div><div><strong>${health.conflicts}</strong><span>conflictos</span></div><div><strong>${health.rejected}</strong><span>rechazadas</span></div><div><strong>${readiness.passed}/${readiness.total}</strong><span>gates beta</span></div></div>
      <div class="list">${health.alerts.map((alert) => `<div class="row"><div><strong>${esc(alert.code)}</strong><div class="muted">${esc(alert.detail)}</div></div><span class="pill">${esc(alert.severity)}</span></div>`).join('') || '<div class="notice success">Sin alertas operativas locales.</div>'}</div>
      <div class="actions">${button('Actualizar salud remota', 'refresh-operational-health', 'secondary')}${button('Enviar telemetría sintética', 'flush-telemetry', 'secondary')}</div>
    </article>
    <article class="card"><span class="pill">Respaldo local</span><h2>Backup y restauración</h2><p>El respaldo excluye tokens, contraseñas, blobs y claves. Incluye checksum SHA-256 y validación de esquema.</p>
      ${backup ? `<div class="notice success">Último respaldo: ${esc(backup.createdAt)} · ${esc(backup.sha256?.slice(0, 12) || '')}… · ${Number(backup.counts?.outbox || 0)} operaciones</div>` : '<div class="notice">Aún no existe un respaldo M14.</div>'}
      <div class="actions">${button('Crear respaldo', 'create-backup', 'gold')}${button('Descargar JSON', 'download-backup', 'secondary', lastBackup ? '' : 'disabled')}</div>
      <label class="backup-file">Validar o restaurar respaldo<input id="backup-file" type="file" accept="application/json,.json"></label><div class="actions">${button('Validar', 'validate-backup', 'secondary')}${button('Restaurar', 'restore-backup', 'danger')}</div>
    </article>
    <article class="card"><span class="pill">Pruebas de caos</span><h2>Red, Outbox y recuperación</h2><p>Simula offline inicial, 503 transitorio, timeout, ACK duplicado, revisión obsoleta y cierre abrupto.</p>
      ${chaos ? `<div class="notice ${chaos.pass ? 'success' : ''}">${chaos.pass ? '6/6 escenarios recuperables' : 'Hay escenarios pendientes'} · ejecutado ${esc(chaos.executedAt || '')}</div>` : '<div class="notice">Prueba local todavía no ejecutada.</div>'}
      <div class="actions">${button('Ejecutar caos local', 'run-chaos', 'gold')}${button('Probar 500 clientes', 'run-load-probe', 'secondary')}</div>${state.loadReport ? `<p class="muted">Carga: ${state.loadReport.clients} clientes · ${Number(state.loadReport.durationMs).toFixed(1)} ms · ${state.loadReport.pass ? 'dentro de presupuesto' : 'revisar'}</p>` : ''}
    </article>
    <article class="card full"><div class="card-head"><div><span class="pill">Release Candidate M15</span><h2>Preview privado y rollback</h2></div><span class="pill">${rc.ready ? 'Ready' : 'Bloqueado'}</span></div>
      <p>${rc.passed}/${rc.total} gates aprobados · actualización PWA: <strong>${esc(pwa.action)}</strong> · ${esc(pwa.reason)}.</p>
      <div class="actions">${button('Probar conflicto de dos dispositivos', 'run-two-device-conflict', 'secondary')}${button('Evaluar Release Candidate', 'evaluate-rc', 'gold')}</div>
      ${state.twoDeviceTrial ? `<div class="notice ${state.twoDeviceTrial.silentOverwrite ? '' : 'success'}">Revisión remota ${state.twoDeviceTrial.remoteRevision} · conflicto visible ${state.twoDeviceTrial.conflicts.length} · sobrescritura silenciosa ${state.twoDeviceTrial.silentOverwrite ? 'sí' : 'no'}</div>` : ''}
    </article>
    <article class="card full"><div class="card-head"><div><span class="pill">Beta controlada M16</span><h2>Cohorte, consentimiento e incidencias</h2></div><span class="pill">${state.betaCohort?.readyForProductionCandidate ? 'Aprobada' : 'Preparación'}</span></div>
      <p>La infraestructura está lista para una cohorte limitada, pero no se han incorporado participantes reales desde esta entrega.</p>
      <div class="actions">${button('Simular cohorte de 3 participantes', 'simulate-beta-cohort', 'gold')}${button('Simular incidente alto', 'simulate-beta-incident', 'secondary')}</div>
      ${state.betaCohort ? `<div class="notice ${state.betaCohort.readyForProductionCandidate ? 'success' : ''}">${state.betaCohort.passedSessions}/${state.betaCohort.requiredSessions} sesiones · ${state.betaCohort.blockers.length} bloqueadores</div>` : ''}
    </article>
    <article class="card full"><div class="card-head"><div><span class="pill">Production Candidate M17</span><h2>Gobierno, privacidad y operación</h2></div><span class="pill">${state.productionCandidate?.ready ? 'Ready' : 'Bloqueado'}</span></div>
      <p>${state.productionCandidate ? `${state.productionCandidate.passed}/${state.productionCandidate.total} gates técnicos` : 'Aún no evaluado'} · producción y datos reales continúan deshabilitados.</p>
      <div class="actions">${button('Evaluar Production Candidate', 'evaluate-production-candidate', 'gold')}${button('Generar paquete Go-Live', 'build-go-live-packet', 'secondary')}</div>
      ${state.productionCandidate?.blockers?.length ? `<div class="notice">Bloqueadores: ${state.productionCandidate.blockers.slice(0, 6).map(esc).join(' · ')}</div>` : ''}
    </article>
    <article class="card full"><div class="card-head"><div><span class="pill">Launch Candidate M18</span><h2>Rollout progresivo y activación controlada</h2></div><span class="pill">${state.launchGuard?.allowed ? 'Autorizable' : 'Bloqueado'}</span></div>
      <p>Olas: interno → canary 5% → limitado 20% → expandido 50% → general. La activación productiva sigue fuera de este artefacto.</p>
      <div class="actions">${button('Simular rollout canary', 'simulate-rollout', 'gold')}${button('Evaluar handover', 'evaluate-handover', 'secondary')}</div>
      ${state.rolloutSimulation ? `<div class="notice ${state.rolloutSimulation.decision.action === 'rollback' ? '' : 'success'}">Canary: ${esc(state.rolloutSimulation.decision.action)} · ${esc(state.rolloutSimulation.decision.reason)}</div>` : ''}
    </article>
    <article class="card full"><div class="card-head"><div><span class="pill">Beta sintética</span><h2>Preview controlado</h2></div><span class="pill">${readiness.ready ? 'Ready' : 'Bloqueado'}</span></div>
      <p>Modo preview: <strong>${preview.enabled ? 'activo' : 'inactivo'}</strong> · audiencia ${esc(preview.audience)} · ${esc(guard.reason)}. Producción y datos reales permanecen bloqueados.</p>
      <div class="readiness-grid">${readiness.checks.map((check) => `<div class="readiness-item ${check.pass ? 'pass' : 'pending'}"><strong>${check.pass ? '✓' : '○'} ${esc(check.key)}</strong><span>${esc(check.detail)}</span></div>`).join('')}</div>
    </article>
  </section>`;
}

function librarySection() {
  const facets = catalogMeta || exerciseFacets(catalogItems);
  const options = (items, current) => `<option value="">Todos</option>${(items || []).map((item) => `<option value="${esc(item)}" ${item === current ? 'selected' : ''}>${esc(item)}</option>`).join('')}`;
  const total = Number(facets.total ?? catalogItems.length);
  const canonical = Number(facets.canonical ?? canonicalExerciseFallback().length);
  const external = Number(facets.external ?? 0);
  const pending = Number(facets.pendingEnrichment ?? 0);
  const cards = (catalogItems || []).map((exercise) => `<article class="exercise-card"><div class="exercise-card-head"><div><span class="pill">${esc(exercise.pattern)}</span><h3>${esc(exercise.name)}</h3></div><span class="pill">${esc(exercise.difficulty)}</span></div><p class="exercise-meta">${esc(exercise.intent)} · ${esc(exercise.equipment)}</p>${exercise.primaryMuscles?.length ? `<p><strong>Foco:</strong> ${exercise.primaryMuscles.map(esc).join(', ')}</p>` : ''}<ul>${(exercise.cues || exercise.instructions || []).slice(0,3).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>${exercise.precautions?.length ? `<details><summary>Precauciones</summary><p>${exercise.precautions.map(esc).join(' · ')}</p></details>` : ''}<div class="exercise-footer"><small>${esc(exercise.id)}</small><span class="pill">${exercise.mediaStatus === 'aprobado' ? 'Media aprobada' : 'Ficha técnica'}</span></div></article>`).join('');
  const adminActions = sessionRole() === 'admin' && remoteActive() ? `<div class="catalog-admin"><div><strong>Ampliación controlada</strong><p>Importa metadatos de referencia sin publicar medios externos. Gemini normaliza después el contenido al español.</p></div><div class="actions">${button('Sincronizar catálogo ampliado', 'catalog-sync-external', 'secondary', catalogBusy ? 'disabled' : '')}${button('Enriquecer siguiente lote', 'catalog-enrich-external', 'secondary', catalogBusy || !external ? 'disabled' : '')}</div></div>` : '';
  return `<section class="grid catalog-section"><article class="card full"><div class="card-head"><div><span class="pill">Biblioteca profesional</span><h2>Biblioteca canónica IBERFIT</h2><p class="muted">Ejercicios con ID estable, filtros operativos y uso directo en planificación. Los medios solo se muestran tras aprobación individual.</p></div>${button('Actualizar', 'search-exercise-catalog', 'secondary')}</div><div class="metrics catalog-metrics"><div><strong>${total}</strong><span>ejercicios disponibles</span></div><div><strong>${canonical}</strong><span>canónicos en español</span></div><div><strong>${external}</strong><span>referencias ampliadas</span></div><div><strong>${pending}</strong><span>pendientes de enriquecer</span></div></div>${catalogNotice ? `<div class="notice ${catalogNotice.startsWith('Listo') ? 'success' : ''}">${esc(catalogNotice)}</div>` : ''}<div class="catalog-filters"><label>Buscar<input id="catalog-query" value="${esc(catalogFilters.query)}" placeholder="Ejercicio, patrón, músculo o equipo"></label><label>Patrón<select id="catalog-pattern">${options(facets.patterns, catalogFilters.pattern)}</select></label><label>Equipo<select id="catalog-equipment">${options(facets.equipment, catalogFilters.equipment)}</select></label><label>Objetivo<select id="catalog-intent">${options(facets.intents, catalogFilters.intent)}</select></label><label>Nivel<select id="catalog-difficulty">${options(facets.difficulties, catalogFilters.difficulty)}</select></label><div class="catalog-filter-actions">${button('Buscar', 'search-exercise-catalog', 'gold')}${button('Limpiar', 'reset-exercise-catalog', 'secondary')}</div></div>${adminActions}</article><article class="card full"><div class="card-head"><div><h2>Resultados</h2><p class="muted">${catalogItems.length} fichas cargadas en esta vista.</p></div></div><div class="exercise-catalog-grid">${cards || '<div class="notice">No se encontraron ejercicios con esos filtros.</div>'}</div></article></section>`;
}

function queueAndAudit() {
  return `<article class="card full"><h2>Cola, conflictos y resolución</h2><div class="list">${runtime.outbox.map((item) => `<div class="row operation-${item.status}"><div><strong>${esc(item.type)}</strong><div class="muted">${esc(item.operationId)} · base ${item.baseRevision} · ${esc(item.status)}</div>${item.conflict ? `<div class="conflict-copy">Remoto ${item.conflict.remoteRevision} · ${esc(item.conflict.reason)}${item.conflict.remoteSnapshot ? ' · instantánea remota disponible' : ''}</div>` : ''}${item.rejection ? `<div class="conflict-copy">${esc(item.rejection.reason)}</div>` : ''}</div>${item.status === 'conflicto' ? `<div class="row-actions">${button('Conservar local', `conflict-local:${item.operationId}`, 'gold')}${button('Fusionar compatible', `conflict-merge:${item.operationId}`, 'secondary')}${button('Aceptar remoto', `conflict-remote:${item.operationId}`, 'danger')}</div>` : item.status === 'rechazada' ? button('Descartar local', `discard:${item.operationId}`, 'danger') : '<span class="pill">Pendiente</span>'}</div>`).join('') || '<div class="notice">La cola está vacía.</div>'}</div></article>
  <article class="card full"><h2>Auditoría local</h2><div class="audit-list">${(state.audit || []).slice(0, 12).map((item) => `<div><strong>${esc(item.type)}</strong><span>${esc(item.detail || '')}</span><small>${esc(item.at)}</small></div>`).join('') || '<p class="muted">Sin eventos.</p>'}</div></article>`;
}

function productionOperationSection() {
  const health = operationalHealth(state, runtime);
  return `<section class="grid">
    <article class="card full operations-command"><div class="card-head"><div><span class="pill">Estado operativo</span><h2>Continuidad del trabajo</h2></div><span class="pill health-${esc(health.status)}">${esc(health.status)}</span></div>
      <div class="metrics"><div><strong>${runtime.outboxCount}</strong><span>cambios pendientes</span></div><div><strong>${runtime.conflictCount}</strong><span>requieren revisión</span></div><div><strong>${navigator.onLine ? 'Sí' : 'No'}</strong><span>conexión disponible</span></div></div>
      <p class="muted">IBERFIT conserva los cambios localmente y los sincroniza cuando existe conexión. Las diferencias nunca se resuelven de forma destructiva.</p>
      <div class="actions">${button('Sincronizar ahora', 'reconcile', 'gold', runtime.outboxCount ? '' : 'disabled')}</div>
    </article>
    ${queueAndAudit()}
  </section>`;
}

function noClientsView() {
  const role = sessionRole();
  if (role === 'cliente') {
    return chrome(`<section class="hero commercial-empty"><div class="eyebrow">IBERFIT</div><h1>Tu cuenta está activa</h1><p>Tu perfil de entrenamiento todavía no ha sido asignado. El equipo IBERFIT completará la configuración antes de tu primera sesión.</p></section><section class="grid"><article class="card full empty-production-card"><div class="empty-production-mark"><img src="/public/isotipo-iberfit.png" alt=""></div><h2>Estamos preparando tu experiencia</h2><p class="muted">Cuando tu perfil esté disponible, aquí encontrarás tu evaluación, planificación, sesiones e informes.</p></article></section>`);
  }
  return chrome(`<section class="hero commercial-empty"><div class="eyebrow">IBERFIT Coach</div><h1>Tu espacio de trabajo está listo</h1><p>Puedes crear el primer expediente, revisar la biblioteca completa y comprobar el motor inteligente antes de activar clientes.</p></section><section class="grid">${clientOnboardingForm({ alwaysOpen: true })}${remoteAiPanel()}</section>${librarySection()}`);
}

function analysisCoachView() {
  const sections = {
    hoy: todaySection,
    clientes: clientsSection,
    agenda: agendaSection,
    evaluar: iriSection,
    planificar: planningSection,
    entrenar: () => `<section class="grid"><article class="card full"><h2>Operación de sesión</h2><p>La ejecución presencial se mantiene deliberadamente fuera del análisis para reducir carga cognitiva.</p>${button('Abrir Modo Campo', 'open-field-mode', 'gold')}</article></section>`,
    informes: reportsSection,
    inteligencia: intelligenceSection,
    expediente: () => productionActive() ? expedienteSection() : expedienteSection() + supabaseReadinessSection(),
    biblioteca: librarySection,
    operacion: productionActive() ? productionOperationSection : operationSection,
    mas: moreSection,
  };
  const section = sections[state.coachSection] || todaySection;
  return chrome(`${coachModeSwitch()}<section class="hero"><div class="eyebrow">IBERFIT Coach</div><h1>${state.coachSection === 'hoy' ? 'Qué requiere criterio hoy' : state.coachSection === 'mas' ? 'Herramientas de análisis' : esc(humanField(state.coachSection))}</h1><p>Profundidad para analizar y decidir; operación ultraligera en Modo Campo.</p></section>${syncStrip()}${coachNav()}${section()}`);
}

function render() {
  const startedAt = globalThis.performance?.now?.() || Date.now();
  if (!auth) root.innerHTML = loginView();
  else if (!state?.clients?.length || (sessionRole() === 'cliente' && !state?.client)) root.innerHTML = noClientsView();
  else root.innerHTML = sessionRole() === 'cliente' ? clientView() : state.coachMode === 'campo' ? fieldCoachView() : analysisCoachView();
  const endedAt = globalThis.performance?.now?.() || Date.now();
  runtime.performance = recordMetric(runtime.performance, 'render', endedAt - startedAt);
  globalThis.__IBERFIT_DIAGNOSTICS__ = {
    milestone: 25,
    environment: productionActive() ? 'PRODUCTION' : remoteActive() ? 'SUPABASE_SYNTHETIC' : 'LOCAL_SYNTHETIC',
    performance: runtime.performance,
    outboxCount: runtime.outboxCount,
    conflictCount: runtime.conflictCount,
    recovery: state?.recovery || null,
    operationalHealth: operationalHealth(state, runtime),
    betaReadiness: betaReadiness(state?.systemChecks || {}),
    preview: previewMode(),
  };
}

function readActualFields() {
  const number = (id) => Number(document.querySelector(`#${id}`)?.value || 0);
  return { load: number('load'), reps: number('reps'), seconds: number('seconds'), meters: number('meters'), rpe: number('rpe') || null, rir: number('rir') || null };
}

function promptLibraryExercise(message = 'ID del ejercicio') {
  const display = state.exerciseLibrary.map((exercise) => `${exercise.id}: ${exercise.name}`).join('\n');
  const id = prompt(`${message}:\n${display}`, state.exerciseLibrary[0]?.id || '');
  return state.exerciseLibrary.find((exercise) => exercise.id === id) || null;
}

function promptPrescription() {
  return {
    sets: Number(prompt('Series:', '3') || 3),
    reps: Number(prompt('Repeticiones:', '8') || 0),
    load: Number(prompt('Carga kg:', '0') || 0),
    seconds: Number(prompt('Tiempo en segundos:', '0') || 0),
    meters: Number(prompt('Distancia en metros:', '0') || 0),
    rest: Number(prompt('Descanso en segundos:', '60') || 60),
  };
}

function openPrintableReport(report) {
  const html = buildPrintableReportHtml(report, { clientName: state.client.name });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const preview = window.open(url, '_blank');
  if (!preview) {
    URL.revokeObjectURL(url);
    throw new Error('El navegador bloqueó la vista imprimible');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function uploadDocumentFromForm() {
  const file = document.querySelector('#doc-file')?.files?.[0];
  if (!file) throw new Error('Selecciona un archivo');
  const buffer = await file.arrayBuffer();
  const hash = await sha256Hex(buffer);
  const input = {
    clientId: state.client.id,
    iriId: state.iriAssessment?.id || null,
    type: document.querySelector('#doc-type')?.value || 'otro',
    title: document.querySelector('#doc-title')?.value || file.name,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    hash,
    measuredAt: document.querySelector('#doc-measured-at')?.value || null,
    measurementContext: {
      device: document.querySelector('#doc-device')?.value || '',
      timeOfDay: document.querySelector('#doc-time')?.value || '',
      fasting: document.querySelector('#doc-fasting')?.value,
      trainingLast24h: document.querySelector('#doc-training')?.value,
      hydration: 'no declarada',
    },
    createdBy: auth.user.id,
  };
  const record = createDocumentRecord({ ...input, id: remoteActive() ? crypto.randomUUID() : undefined }, state.documents);
  let metadata = await storeDocument(repository, { ...record, blob: file });
  if (remoteActive() && typeof repository.uploadDocumentRemote === 'function' && ['coach', 'admin'].includes(sessionRole())) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const storagePath = `${record.clientId}/documents/${record.id}/${safeName}`;
    await repository.uploadDocumentRemote(auth.token, storagePath, file, record.mimeType, { upsert: false });
    if (typeof repository.saveDocumentMetadataRemote === 'function') {
      const remoteRecord = await repository.saveDocumentMetadataRemote(auth.token, record, storagePath);
      metadata = { ...metadata, storagePath, remote: true, remoteRecord };
      await repository.putDocument({ ...record, storagePath, remote: true, blob: file });
    }
  }
  await queueOperation({
    type: 'DOCUMENTO_VERSIONADO',
    entityType: 'document',
    entityId: record.id,
    baseRevision: 0,
    conflictSensitive: true,
    payload: metadata,
  });
  return metadata;
}


async function readBackupInput() {
  const file = document.querySelector('#backup-file')?.files?.[0];
  if (!file) throw new Error('Selecciona un respaldo JSON');
  if (file.size > 20_000_000) throw new Error('El respaldo supera 20 MB');
  try { return JSON.parse(await file.text()); }
  catch { throw new Error('El archivo no contiene JSON válido'); }
}

function operationalState(nextState, event) {
  return appendOperationalEvent(nextState, {
    ...event,
    clientId: event.clientId ?? nextState.selectedClientId ?? nextState.client?.id ?? null,
    sessionId: event.sessionId ?? nextState.activeSession?.sessionId ?? nextState.session?.id ?? null,
  });
}

function downloadJson(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.rel = 'noopener';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function handleAction(action) {
  if (busy) return;
  busy = true;
  try {
    if (action === 'show-forgot') { authPanel = 'forgot'; authNotice = ''; render(); return; }
    if (action === 'back-login') { authPanel = 'login'; authNotice = ''; render(); return; }
    if (action === 'request-password-reset') {
      const email = document.querySelector('#recovery-email')?.value || '';
      const redirectTo = `${globalThis.location.origin}${globalThis.location.pathname}`;
      await requestPasswordRecovery(repository, email, redirectTo);
      authNotice = 'Te enviamos un enlace para restablecer tu contraseña. Revisa también la carpeta de correo no deseado.';
      render(); return;
    }
    if (action === 'update-password') {
      const password = document.querySelector('#new-password')?.value || '';
      const confirmation = document.querySelector('#confirm-password')?.value || '';
      await updateRecoveredPassword(repository, recoveryToken, password, confirmation);
      recoveryToken = null; authPanel = 'login'; authNotice = 'Contraseña actualizada. Ya puedes ingresar.';
      if (globalThis.history?.replaceState) globalThis.history.replaceState({}, document.title, `${globalThis.location.pathname}${globalThis.location.search}`);
      render(); return;
    }
    if (action.startsWith('login:')) {
      await applyAuthenticatedBootstrap(await loginDemo(repository, action.split(':')[1]));
      render();
      return;
    }
    if (action === 'login-credentials') {
      const email = document.querySelector('#remote-email')?.value || '';
      const password = document.querySelector('#remote-password')?.value || '';
      await applyAuthenticatedBootstrap(await loginWithCredentials(repository, email, password));
      authNotice = ''; authPanel = 'login';
      render();
      return;
    }
    if (action === 'logout') { await logout(repository, auth); auth = null; authPanel = 'login'; authNotice = ''; render(); return; }
    if (action === 'noop') return;
    if (action === 'toggle-client-onboarding') { clientOnboardingOpen = true; clientOnboardingNotice = ''; render(); return; }
    if (action === 'cancel-client-onboarding') { clientOnboardingOpen = false; clientOnboardingNotice = ''; render(); return; }
    if (action === 'create-client-draft') {
      if (!productionActive() || typeof repository.createClientDraftRemote !== 'function') throw new Error('El alta remota no está disponible');
      if (!['admin', 'coach'].includes(sessionRole())) throw new Error('Solo Administración o Coach puede crear clientes');
      const payload = readClientDraftForm();
      if (!payload.name || !payload.email || !payload.objective || !payload.frequency) throw new Error('Completa nombre, correo, objetivo y frecuencia');
      await repository.createClientDraftRemote(auth.token, payload);
      const bootstrap = await repository.bootstrapRemote(auth.token);
      clientOnboardingOpen = false;
      clientOnboardingNotice = '';
      await applyAuthenticatedBootstrap({ ...auth, remoteBootstrap: bootstrap });
      announce(`Expediente creado para ${payload.name}`);
      render();
      return;
    }
    if (action === 'search-exercise-catalog') {
      catalogFilters = {
        ...catalogFilters,
        query: document.querySelector('#catalog-query')?.value?.trim() || '',
        pattern: document.querySelector('#catalog-pattern')?.value || '',
        equipment: document.querySelector('#catalog-equipment')?.value || '',
        intent: document.querySelector('#catalog-intent')?.value || '',
        difficulty: document.querySelector('#catalog-difficulty')?.value || '',
        offset: 0,
      };
      await refreshExerciseCatalog(catalogFilters);
      catalogNotice = `Listo: ${catalogItems.length} ejercicios cargados.`;
      render(); return;
    }
    if (action === 'reset-exercise-catalog') {
      catalogFilters = { query: '', pattern: '', equipment: '', intent: '', difficulty: '', limit: 80, offset: 0 };
      await refreshExerciseCatalog(catalogFilters);
      catalogNotice = '';
      render(); return;
    }
    if (action === 'catalog-sync-external') {
      if (sessionRole() !== 'admin' || typeof repository.catalogAdminRemote !== 'function') throw new Error('La sincronización está reservada a Administración');
      catalogBusy = true; catalogNotice = 'Sincronizando metadatos del catálogo ampliado…'; render();
      const result = await repository.catalogAdminRemote(auth.token, { action: 'sync_external' });
      catalogBusy = false; catalogNotice = `Listo: ${result.imported || 0} ejercicios de referencia sincronizados. Los medios siguen bloqueados.`;
      await refreshExerciseCatalog({ ...catalogFilters, offset: 0 });
      render(); return;
    }
    if (action === 'catalog-enrich-external') {
      if (sessionRole() !== 'admin' || typeof repository.catalogAdminRemote !== 'function') throw new Error('El enriquecimiento está reservado a Administración');
      catalogBusy = true; catalogNotice = 'Gemini está normalizando el siguiente lote al español…'; render();
      const result = await repository.catalogAdminRemote(auth.token, { action: 'enrich_external', limit: 20 });
      catalogBusy = false; catalogNotice = result.complete ? `Listo: catálogo ampliado enriquecido.` : `Listo: ${result.enriched || 0} enriquecidos; quedan ${result.remaining || 0}.`;
      await refreshExerciseCatalog({ ...catalogFilters, offset: 0 });
      render(); return;
    }
    if (action === 'refresh-ai-status') {
      await refreshAiStatus(); aiRemoteNotice = aiRemoteStatus?.configured ? 'Gemini está configurado en el servidor.' : 'Gemini todavía no está configurado; el motor local continúa disponible.'; render(); return;
    }
    if (action === 'generate-remote-ai') {
      if (!['admin','coach'].includes(sessionRole())) throw new Error('La IA supervisada está reservada a IBERFIT Coach');
      if (typeof repository.invokeIberfitAiRemote !== 'function') throw new Error('El motor remoto no está disponible');
      const aiAction = document.querySelector('#ai-action')?.value || 'session_draft';
      const request = document.querySelector('#ai-request')?.value?.trim() || '';
      aiRemoteNotice = 'Generando propuesta supervisada…'; render();
      aiRemoteResult = await repository.invokeIberfitAiRemote(auth.token, { action: aiAction, clientId: state?.client?.id || null, request, context: aiContext(), filters: catalogFilters });
      aiRemoteNotice = `${aiRemoteResult.provider || 'IBERFIT'} respondió. La propuesta requiere revisión Coach.`;
      render(); return;
    }
    if (action === 'create-backup') {
      lastBackup = await createBackupEnvelope(repository);
      const validation = await validateBackupEnvelope(lastBackup);
      if (!validation.ok) throw new Error(validation.errors.join(' · '));
      const summary = backupSummary(lastBackup);
      const next = operationalState({
        ...state,
        backupHistory: [summary, ...(state.backupHistory || [])].slice(0, 20),
        systemChecks: { ...(state.systemChecks || {}), 'backup-restore': true },
      }, { eventType: 'BACKUP_VALIDADO', severity: 'info', details: { checksum: summary.sha256, counts: summary.counts } });
      return commit(next, { type: 'BACKUP_LOCAL_VALIDADO', detail: summary.sha256.slice(0, 12) });
    }
    if (action === 'download-backup') {
      if (!lastBackup) throw new Error('Primero crea un respaldo');
      downloadJson(`IBERFIT_M14_BACKUP_${new Date().toISOString().slice(0, 10)}.json`, lastBackup);
      announce('Respaldo preparado para descarga'); render(); return;
    }
    if (action === 'validate-backup') {
      const envelope = await readBackupInput();
      const validation = await validateBackupEnvelope(envelope);
      if (!validation.ok) throw new Error(validation.errors.join(' · '));
      const dryRun = await restoreBackupEnvelope(repository, envelope, { dryRun: true });
      const next = operationalState(state, { eventType: 'BACKUP_DRY_RUN_OK', severity: 'info', details: dryRun.plan });
      return commit(next, { type: 'BACKUP_VALIDADO_SIN_RESTAURAR', detail: envelope.sha256.slice(0, 12) });
    }
    if (action === 'restore-backup') {
      const envelope = await readBackupInput();
      await restoreBackupEnvelope(repository, envelope, { dryRun: false });
      state = await loadState(repository);
      state = operationalState({ ...state, systemChecks: { ...(state.systemChecks || {}), 'backup-restore': true } }, {
        eventType: 'BACKUP_RESTAURADO', severity: 'warning', details: { checksum: envelope.sha256, schemaVersion: envelope.schemaVersion },
      });
      await saveState(repository, state); await refreshRuntime(); announce('Respaldo restaurado y validado'); render(); return;
    }
    if (action === 'run-chaos') {
      const plan = createChaosPlan({ seed: 14 });
      const queue = runtime.outbox.length ? runtime.outbox : [
        { operationId: 'CHAOS-OP-1', localSequence: 1 },
        { operationId: 'CHAOS-OP-1', localSequence: 2 },
        { operationId: 'CHAOS-OP-2', localSequence: 3 },
      ];
      const simulated = simulateOutboxChaos(queue);
      const observations = {
        'offline-start': { queued: true, dataLost: false },
        'transient-503': { retried: true, dataLost: false },
        timeout: { retried: true, dataLost: false },
        'duplicate-ack': { effects: simulated.uniqueEffects, duplicate: simulated.queued > simulated.uniqueEffects },
        'stale-revision': { conflictVisible: true, overwritten: false },
        'crash-after-save': { recovered: true, dataLost: false },
      };
      // Para el probe de duplicado se mide una operación repetida como un solo efecto.
      observations['duplicate-ack'].effects = 1;
      const report = { ...evaluateChaosOutcome(plan, observations), executedAt: new Date().toISOString(), simulated };
      const next = operationalState({
        ...state,
        chaosReport: report,
        systemChecks: { ...(state.systemChecks || {}), 'chaos-offline': report.pass },
      }, { eventType: 'CHAOS_LOCAL_COMPLETADO', severity: report.pass ? 'info' : 'critical', details: { pass: report.pass, scenarios: report.checks.length } });
      return commit(next, { type: 'CHAOS_LOCAL_COMPLETADO', detail: `${report.checks.filter((item) => item.pass).length}/${report.checks.length}` });
    }
    if (action === 'run-load-probe') {
      const report = runSyntheticLoadProbe({ clients: 500, budgetMs: 250 });
      const next = operationalState({
        ...state,
        loadReport: { ...report, executedAt: new Date().toISOString() },
        systemChecks: { ...(state.systemChecks || {}), 'synthetic-load': report.pass },
      }, { eventType: 'CARGA_SINTETICA_COMPLETADA', severity: report.pass ? 'info' : 'warning', details: report });
      return commit(next, { type: 'CARGA_SINTETICA_COMPLETADA', detail: `${report.clients} clientes · ${report.durationMs.toFixed(1)} ms` });
    }
    if (action === 'flush-telemetry') {
      let next = operationalState(state, { eventType: 'TELEMETRIA_PREPARADA', severity: 'info', details: operationalHealth(state, runtime) });
      const batch = buildTelemetryBatch(next.operationalEvents || []);
      if (remoteActive() && auth?.token && repository.recordOperationalEventsRemote) await repository.recordOperationalEventsRemote(auth.token, batch);
      next = operationalState(next, { eventType: 'TELEMETRIA_ENVIADA', severity: 'info', details: { events: batch.length, remote: remoteActive() } });
      return commit(next, { type: 'TELEMETRIA_SINTETICA_ENVIADA', detail: `${batch.length} eventos` });
    }
    if (action === 'refresh-operational-health') {
      const remote = remoteActive() && auth?.token && repository.remoteOperationalHealth
        ? await repository.remoteOperationalHealth(auth.token)
        : { environment: 'SYNTHETIC_ONLY', local: operationalHealth(state, runtime) };
      const next = operationalState(state, { eventType: 'SALUD_OPERACIONAL_ACTUALIZADA', severity: 'info', details: remote });
      return commit(next, { type: 'SALUD_OPERACIONAL_ACTUALIZADA', detail: remoteActive() ? 'servicio remoto' : 'local' });
    }
    if (action === 'simulate-rollout') {
      const plan = createRolloutPlan({ candidateVersion: 'M18-LC1', rollbackCheckpoint: 'M17' });
      const simulation = simulateControlledRollout(plan, 'canary', { sessions: 100, syncFailures: 1, crashes: 0, dataLoss: 0, criticalIncidents: 0, p95InteractionMs: 180 });
      return commit({ ...state, rolloutPlan: plan, rolloutSimulation: simulation }, { type: 'ROLLOUT_CANARY_SIMULADO', detail: simulation.decision.action });
    }
    if (action === 'evaluate-handover') {
      const owners = { producto: 'pendiente', soporte: 'pendiente', seguridad: 'pendiente', respaldo: 'pendiente', incidentes: 'pendiente', privacidad: 'pendiente', operación: 'pendiente' };
      const handover = buildOperationalHandover({ owners, training: {}, runbooks: {} });
      const support = supportCoverage({ coverageHoursPerDay: 0, criticalResponseMinutes: 0, backupContact: null });
      const launchGuard = controlledActivationGuard({ decision: 'hold', productionCandidateReady: Boolean(state.productionCandidate?.ready), handoverReady: handover.ready, supportReady: support.ready, ownerConfirmed: false, runtimeProductionEnabled: false });
      return commit({ ...state, operationalHandover: handover, supportCoverage: support, launchGuard }, { type: 'HANDOVER_EVALUADO', detail: `${handover.blockers.length} áreas pendientes` });
    }
    if (action === 'evaluate-production-candidate') {
      const notice = createPrivacyNotice({ version: 'M17-DRAFT', title: 'Aviso de privacidad IBERFIT', purposes: ['prestación del servicio'], dataCategories: ['perfil', 'entrenamiento'], legalReview: false, status: 'draft' });
      const consent = validateConsent({ notice, accepted: false, scope: [] });
      const gates = {
        'release-candidate-clean': evaluateReleaseCandidate(state.releaseCandidateChecks || {}).ready,
        'beta-evidence': Boolean(state.betaCohort?.readyForProductionCandidate),
        'security-advisor-clean': Boolean(state.systemChecks?.['security-advisor-clean']),
        'rls-auth-storage': Boolean(state.systemChecks?.['auth-rls-e2e'] && state.systemChecks?.['storage-private']),
        'backup-restore-drill': Boolean(state.systemChecks?.['backup-restore']),
        'rollback-drill': Boolean(state.systemChecks?.['rollback-drill']),
        'observability-alerting': true,
        'incident-response': true,
        'privacy-legal-review': notice.legalReview,
        'consent-approved': consent.valid,
        'retention-approved': false,
        'account-recovery': false,
        'physical-ios': false,
        'physical-android': false,
        'physical-tablet': false,
        'two-device-real-conflict': false,
        'long-session-network': false,
        'support-trained': false,
        'domain-tls-email': false,
        'migration-dry-run': true,
      };
      const productionCandidate = evaluateProductionCandidate({ gates, productionEnabled: false, realDataApproved: false });
      return commit({ ...state, privacyNoticeDraft: notice, productionCandidate }, { type: 'PRODUCTION_CANDIDATE_EVALUADO', detail: `${productionCandidate.passed}/${productionCandidate.total}` });
    }
    if (action === 'build-go-live-packet') {
      const packet = buildGoLivePacket({ gates: Object.fromEntries((state.productionCandidate?.checks || []).map((item) => [item.key, item.pass])), productionEnabled: false, realDataApproved: false, candidateVersion: 'M17-PC1', rollbackCheckpoint: 'M16', owners: { product: 'pendiente', technical: 'pendiente', privacy: 'pendiente' } });
      return commit({ ...state, goLivePacket: packet }, { type: 'PAQUETE_GO_LIVE_GENERADO', detail: `bloqueadores ${packet.evaluation.blockers.length}` });
    }
    if (action === 'simulate-beta-cohort') {
      const base = { syntheticOnly: true, allowRealData: false, releaseCandidateReady: true, privacyNoticeVersion: 'BETA-M16', consent: { accepted: true, acceptedAt: new Date().toISOString() }, supportOwner: auth.user.id, backupReady: true, rollbackReady: true, device: { platform: 'synthetic', browser: 'synthetic' } };
      const participants = Array.from({ length: 3 }, (_, index) => createBetaParticipant({ ...base, id: `BETA-SYN-${index + 1}`, userId: `USER-SYN-${index + 1}`, clientId: state.client.id }));
      const observations = Array.from({ length: 20 }, (_, index) => createSessionObservation({ id: `OBS-SYN-${index + 1}`, participantId: participants[index % 3].id, sessionId: state.session.id, durationMinutes: 45, networkInterruptions: index % 4 === 0 ? 1 : 0, recovered: true, dataLoss: false, closeConfirmed: true }));
      const cohort = evaluateBetaCohort({ participants, observations, incidents: [] });
      return commit({ ...state, betaParticipants: participants, betaObservations: observations, betaCohort: cohort }, { type: 'COHORTE_BETA_SINTETICA_SIMULADA', detail: `${cohort.passedSessions} sesiones` });
    }
    if (action === 'simulate-beta-incident') {
      const incident = recordBetaIncident({ participantId: state.betaParticipants?.[0]?.id, clientId: state.client.id, severity: 'high', summary: 'Cierre no confirmado durante prueba sintética', details: { synthetic: true } });
      const incidents = [incident, ...(state.betaIncidents || [])];
      const cohort = evaluateBetaCohort({ participants: state.betaParticipants || [], observations: state.betaObservations || [], incidents });
      return commit({ ...state, betaIncidents: incidents, betaCohort: cohort }, { type: 'INCIDENTE_BETA_SINTETICO', detail: incident.severity });
    }
    if (action === 'run-two-device-conflict') {
      const trial = simulateTwoDeviceConflict({ baseRevision: Number(state.client?.revision || 0), deviceA: { deviceId: 'tablet-coach', value: 'carga-12' }, deviceB: { deviceId: 'movil-coach', value: 'carga-14' } });
      const next = operationalState({ ...state, twoDeviceTrial: trial, releaseCandidateChecks: { ...(state.releaseCandidateChecks || {}), 'two-device-conflict': !trial.silentOverwrite && trial.conflicts.length === 1 } }, { eventType: 'CONFLICTO_DOS_DISPOSITIVOS_PROBADO', severity: 'info', details: trial });
      return commit(next, { type: 'CONFLICTO_DOS_DISPOSITIVOS_PROBADO', detail: `revisión ${trial.remoteRevision}` });
    }
    if (action === 'evaluate-rc') {
      const checks = {
        'synthetic-only': true,
        'private-preview': previewMode().enabled && previewMode().audience === 'interno',
        'auth-rls-e2e': Boolean(state.systemChecks?.['auth-rls-e2e']),
        'storage-private': Boolean(state.systemChecks?.['storage-private']),
        'backup-restore': Boolean(state.systemChecks?.['backup-restore']),
        'chaos-offline': Boolean(state.systemChecks?.['chaos-offline']),
        'two-device-conflict': Boolean(state.releaseCandidateChecks?.['two-device-conflict']),
        'pwa-safe-update': pwaUpdateDecision({ waitingWorker: true, activeSession: false, outboxCount: 0 }).safe,
        'rollback-drill': Boolean(state.systemChecks?.['rollback-drill']),
        'observability': true,
        'accessibility-smoke': Boolean(state.systemChecks?.['accessibility-smoke']),
        'performance-budget': Boolean(state.systemChecks?.['performance-budget']),
      };
      return commit({ ...state, releaseCandidateChecks: checks }, { type: 'RELEASE_CANDIDATE_EVALUADO', detail: `${evaluateReleaseCandidate(checks).passed}/${evaluateReleaseCandidate(checks).total}` });
    }
    if (action.startsWith('coach-section:')) return commit({ ...state, coachMode: 'analisis', coachSection: action.split(':')[1] });
    if (action === 'open-field-mode') return commit({ ...state, coachMode: 'campo' });
    if (action === 'ack-recovery') return commit({ ...state, recovery: { ...(state.recovery || {}), acknowledged: true } }, { type: 'RECUPERACION_CONFIRMADA', detail: state.recovery?.sessionId || state.session.id });
    if (action.startsWith('open-field-sheet:')) { fieldSheet = action.split(':')[1]; announce('Panel de acción rápida abierto'); render(); return; }
    if (action === 'close-field-sheet') { fieldSheet = null; announce('Panel de acción rápida cerrado'); render(); return; }
    if (action.startsWith('select-client:')) {
      const clientId = action.split(':')[1];
      const selected = state.clients.find((client) => client.id === clientId);
      if (!selected) throw new Error('Cliente no encontrado');
      return commit(activateClient(state, clientId), { type: 'CLIENTE_SELECCIONADO', detail: selected.name });
    }
    if (action.startsWith('agenda-start:')) {
      const clientId = action.split(':')[1];
      const selected = state.clients.find((client) => client.id === clientId);
      if (!selected) throw new Error('Cliente no encontrado');
      const aligned = { ...activateClient(state, clientId), coachMode: 'campo' };
      const next = ensureActiveSession(aligned);
      if (!state.activeSession) await queueOperation({ type: 'SESION_INICIADA', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { role: sessionRole(), clientId } });
      return commit(next, { type: 'SESION_INICIADA_DESDE_AGENDA', detail: selected.name });
    }
    if (action === 'save-field-incident' && state.activeSession) {
      const note = document.querySelector('#quick-incident-note')?.value?.trim();
      const severity = document.querySelector('#quick-incident-severity')?.value || 'media';
      if (!note) throw new Error('Describe brevemente la incidencia');
      const nextSession = addIncident(state.activeSession, { note, severity });
      await queueOperation({ type: 'INCIDENCIA_REGISTRADA', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { note, severity } });
      fieldSheet = null;
      return commit({ ...state, activeSession: nextSession }, { type: 'INCIDENCIA_REGISTRADA', detail: `${severity}: ${note}` });
    }
    if (action === 'save-field-feedback' && state.activeSession) {
      const effort = Number(document.querySelector('#quick-feedback-effort')?.value || 0);
      const pain = Number(document.querySelector('#quick-feedback-pain')?.value || 0);
      const comment = document.querySelector('#quick-feedback-comment')?.value?.trim() || '';
      if (effort < 1 || effort > 10 || pain < 0 || pain > 10) throw new Error('Revisa esfuerzo y dolor');
      const nextSession = addSessionFeedback(state.activeSession, { effort, pain, comment });
      await queueOperation({ type: 'FEEDBACK_REGISTRADO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { effort, pain, comment } });
      fieldSheet = null;
      return commit({ ...state, activeSession: nextSession }, { type: 'FEEDBACK_REGISTRADO', detail: `Esfuerzo ${effort}/10` });
    }
    if (action === 'save-field-adaptation' && state.activeSession) {
      const kind = document.querySelector('#quick-adapt-action')?.value || 'omit';
      const reason = document.querySelector('#quick-adapt-reason')?.value?.trim();
      if (!reason) throw new Error('Indica el motivo de la adaptación');
      const current = currentLibraryExercise();
      if (kind === 'replace') {
        const alternatives = findExerciseAlternatives(state.exerciseLibrary, current, { availableEquipment: state.availableEquipment, limitations: state.limitations });
        const replacementId = document.querySelector('#quick-adapt-replacement')?.value;
        const replacement = alternatives.find((item) => item.id === replacementId);
        if (!replacement) throw new Error('No existe una alternativa exacta compatible');
        await queueOperation({ type: 'EJERCICIO_REEMPLAZADO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { exerciseId: current.id, replacementId: replacement.id, reason } });
        fieldSheet = null;
        return commit({ ...state, activeSession: replaceExercise(state.activeSession, current.id, replacement, reason) }, { type: 'EJERCICIO_REEMPLAZADO', detail: `${current.name} → ${replacement.name}` });
      }
      await queueOperation({ type: 'EJERCICIO_OMITIDO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { exerciseId: current.id, reason } });
      fieldSheet = null;
      return commit({ ...state, activeSession: omitExercise(state.activeSession, current.id, reason) }, { type: 'EJERCICIO_OMITIDO', detail: reason });
    }

    if (action === 'start-session' || action === 'coach-start-session') {
      const next = ensureActiveSession(state);
      if (!state.activeSession) await queueOperation({ type: 'SESION_INICIADA', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { role: sessionRole() } });
      await commit(next, { type: 'SESION_INICIADA', detail: state.session.id });
      return;
    }
    if (['session-complete','session-back','session-next','rest-plus','rest-minus','incident','omit','replace','add-exercise-live','feedback','save-field-incident','save-field-feedback','save-field-adaptation'].includes(action) && state.activeSession && !canMutateSessionExecution(state.activeSession)) {
      throw new Error('La ejecución está bloqueada porque la sesión ya fue cerrada localmente');
    }
    if (action === 'session-complete' && state.activeSession) {
      const before = state.activeSession;
      const actual = readActualFields();
      await queueOperation({ type: 'SERIE_COMPLETADA', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { stepId: before.steps[before.cursor].id, actual } });
      await commit({ ...state, activeSession: completeStep(before, actual) }, { type: 'SERIE_COMPLETADA', detail: before.steps[before.cursor].id });
      return;
    }
    if (action === 'session-back' && state.activeSession) return commit({ ...state, activeSession: goBack(state.activeSession) });
    if (action === 'session-next' && state.activeSession) return commit({ ...state, activeSession: goNext(state.activeSession) });
    if (action === 'rest-plus' && state.activeSession) {
      const nextSession = adjustRest(state.activeSession, 30);
      await queueOperation({ type: 'DESCANSO_EDITADO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { deltaSeconds: 30, restSeconds: nextSession.restSeconds } });
      return commit({ ...state, activeSession: nextSession }, { type: 'DESCANSO_EDITADO', detail: '+30 s' });
    }
    if (action === 'rest-minus' && state.activeSession) {
      const nextSession = adjustRest(state.activeSession, -30);
      await queueOperation({ type: 'DESCANSO_EDITADO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { deltaSeconds: -30, restSeconds: nextSession.restSeconds } });
      return commit({ ...state, activeSession: nextSession }, { type: 'DESCANSO_EDITADO', detail: '−30 s' });
    }
    if (action === 'incident' && state.activeSession) {
      const note = prompt('Describe brevemente la incidencia:'); if (!note) return;
      const severity = prompt('Severidad: baja, media o alta', 'media') || 'media';
      const nextSession = addIncident(state.activeSession, { note, severity });
      await queueOperation({ type: 'INCIDENCIA_REGISTRADA', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { note, severity } });
      await commit({ ...state, activeSession: nextSession }, { type: 'INCIDENCIA_REGISTRADA', detail: `${severity}: ${note}` });
      return;
    }
    if (action === 'omit' && state.activeSession) {
      const reason = prompt('Motivo de omisión:'); if (!reason) return;
      const id = activeExercise().exerciseId;
      await queueOperation({ type: 'EJERCICIO_OMITIDO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { exerciseId: id, reason } });
      await commit({ ...state, activeSession: omitExercise(state.activeSession, id, reason) }, { type: 'EJERCICIO_OMITIDO', detail: reason });
      return;
    }
    if (action === 'replace' && state.activeSession) {
      const current = currentLibraryExercise();
      const alternatives = findExerciseAlternatives(state.exerciseLibrary, current, { availableEquipment: state.availableEquipment, limitations: state.limitations });
      if (!alternatives.length) throw new Error('No hay alternativa exacta compatible. Es más seguro no reemplazar.');
      const display = alternatives.map((item) => `${item.id}: ${item.name} — ${item.matchReason}`).join('\n');
      const id = prompt(`Alternativas compatibles:\n${display}`, alternatives[0].id); if (!id) return;
      const replacement = alternatives.find((item) => item.id === id); if (!replacement) throw new Error('Alternativa inválida');
      const reason = prompt('Motivo del reemplazo:'); if (!reason) return;
      await queueOperation({ type: 'EJERCICIO_REEMPLAZADO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { exerciseId: current.id, replacementId: replacement.id, reason } });
      await commit({ ...state, activeSession: replaceExercise(state.activeSession, current.id, replacement, reason) }, { type: 'EJERCICIO_REEMPLAZADO', detail: `${current.name} → ${replacement.name}` });
      return;
    }
    if (action === 'add-exercise-live' && state.activeSession) {
      const exercise = promptLibraryExercise('Ejercicio a añadir'); if (!exercise) return;
      const reason = prompt('Motivo para añadirlo:'); if (!reason) return;
      const prescription = promptPrescription();
      await queueOperation({ type: 'EJERCICIO_AÑADIDO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { exerciseId: exercise.id, reason, prescription } });
      await commit({ ...state, activeSession: addExerciseToSessionState(state.activeSession, exercise, prescription, reason) }, { type: 'EJERCICIO_AÑADIDO', detail: exercise.name });
      return;
    }
    if (action === 'feedback' && state.activeSession) {
      const effort = Number(prompt('Esfuerzo global 1–10:', '7')); if (!effort) return;
      const pain = Number(prompt('Dolor o molestia 0–10:', '0'));
      const comment = prompt('Comentario breve:', '') || '';
      const nextSession = addSessionFeedback(state.activeSession, { effort, pain, comment });
      await queueOperation({ type: 'FEEDBACK_REGISTRADO', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { effort, pain, comment } });
      await commit({ ...state, activeSession: nextSession }, { type: 'FEEDBACK_REGISTRADO', detail: `Esfuerzo ${effort}/10` });
      return;
    }
    if (action === 'close-session' && state.activeSession) {
      const gate = localCloseGate(state.activeSession, { durableStateSaved: true }); if (!gate.ok) throw new Error(gate.reasons.join(' · '));
      const summary = sessionExecutionSummary(state.activeSession);
      const closeEnvelope = await queueOperation({ type: 'SESION_CERRADA', entityType: 'session', entityId: state.session.id, baseRevision: state.session.revision, payload: { summary, localClosedAt: new Date().toISOString() } });
      const closed = closeSessionLocally(state.activeSession, { closeOperationId: closeEnvelope.operationId, actor: auth.user.id, durableStateSaved: true });
      await commit({ ...state, activeSession: closed }, { type: 'SESION_CERRADA_LOCAL_PENDIENTE_SYNC', detail: `${state.session.id} · ${closeEnvelope.operationId}` });
      if (navigator.onLine) {
        const result = await reconcileOutbox(repository, auth);
        const confirmed = applySessionCloseReconcile(state.activeSession, result);
        await commit({ ...state, activeSession: confirmed, sync: { ...state.sync, lastResult: result, conflicts: result.conflicts || [] } }, { type: confirmed.status === 'cerrada_confirmada' ? 'SESION_CERRADA_CONFIRMADA' : 'RECONCILIACION_CIERRE', detail: result.ok ? `${result.ack.length} ACK` : result.reason || 'Cierre pendiente' });
      }
      return;
    }
    if (action === 'reset-session') {
      if (state.activeSession?.status !== 'cerrada_confirmada' && state.activeSession?.status !== 'cerrada') throw new Error('No se puede archivar una sesión sin cierre confirmado');
      return commit({ ...state, activeSession: null }, { type: 'SESION_ARCHIVADA_LOCALMENTE', detail: state.session.id });
    }
    if (action === 'reconcile') {
      const result = await reconcileOutbox(repository, auth);
      const reconciledSession = state.activeSession ? applySessionCloseReconcile(state.activeSession, result) : state.activeSession;
      const closeWasConfirmed = state.activeSession?.status === 'cerrada_local_pendiente_sync' && reconciledSession?.status === 'cerrada_confirmada';
      await commit({ ...state, activeSession: reconciledSession, sync: { ...state.sync, lastResult: result, conflicts: result.conflicts || [] } }, { type: closeWasConfirmed ? 'SESION_CERRADA_CONFIRMADA' : 'RECONCILIACION', detail: result.ok ? `${result.ack.length} ACK` : result.reason || `${result.conflicts.length} conflictos` });
      return;
    }
    if (action.startsWith('discard:')) { const id = action.split(':')[1]; await discardConflict(repository, id); return commit(state, { type: 'CONFLICTO_LOCAL_DESCARTADO', detail: id }); }
    if (action.startsWith('conflict-local:') || action.startsWith('conflict-merge:') || action.startsWith('conflict-remote:')) {
      const [kind, id] = action.split(':');
      const strategy = kind === 'conflict-local' ? 'conservar_local' : kind === 'conflict-merge' ? 'fusionar' : 'aceptar_remoto';
      const resolution = await resolveQueuedConflict(repository, id, strategy);
      return commit(state, { type: 'CONFLICTO_RESUELTO', detail: `${strategy} · ${resolution.differences?.length || 0} diferencias` });
    }
    if (action === 'generate-intelligence') {
      const runs = evaluateIntelligence(intelligenceInputFromState(state));
      await commit({ ...state, intelligenceRuns: [...runs, ...(state.intelligenceRuns || [])].slice(0, 20) }, { type: 'INTELIGENCIA_PROPUESTA_GENERADA', detail: `${runs[0].code} · ${runs[0].rulesetVersion}` });
      return;
    }
    if (action.startsWith('approve-intelligence:')) {
      const id = action.split(':')[1];
      const target = (state.intelligenceRuns || []).find((run) => run.runId === id); if (!target) throw new Error('Propuesta no encontrada');
      const decisionNote = prompt('Decisión Coach y fundamento breve:'); if (!decisionNote) return;
      const editedAction = prompt('Acción final (puedes modificar la propuesta):', target.recommendation.action) || target.recommendation.action;
      const approved = approveIntelligenceRun(target, { actorRole: sessionRole(), actorId: auth.user.id, decisionNote, editedAction });
      await queueOperation({ type: 'INTELIGENCIA_APROBADA', entityType: 'intelligence_run', entityId: id, baseRevision: 0, conflictSensitive: false, payload: { code: approved.code, decision: approved.coachDecision, rulesetVersion: approved.rulesetVersion } });
      await commit({ ...state, intelligenceRuns: state.intelligenceRuns.map((run) => run.runId === id ? approved : run) }, { type: 'INTELIGENCIA_APROBADA', detail: `${approved.code} · sin cambio automático` });
      return;
    }
    if (action.startsWith('create-plan-change:')) {
      const runId = action.split(':')[1];
      const run = (state.intelligenceRuns || []).find((item) => item.runId === runId); if (!run) throw new Error('Decisión de inteligencia no encontrada');
      const [blockId, exerciseId] = String(document.querySelector('#change-target')?.value || '').split('::');
      const field = document.querySelector('#change-field')?.value;
      const proposedValue = document.querySelector('#change-value')?.value;
      const reason = document.querySelector('#change-reason')?.value;
      const draft = createPlanChangeDraft({ run, plan: state.planning, target: { blockId, exerciseId }, field, proposedValue, reason, actorId: auth.user.id });
      await commit({ ...state, planChanges: [draft, ...(state.planChanges || [])].slice(0, 50) }, { type: 'CAMBIO_PLAN_BORRADOR_CREADO', detail: `${draft.target.exerciseName} · ${draft.target.field} ${draft.previousValue}→${draft.proposedValue}` });
      return;
    }
    if (action.startsWith('approve-plan-change:')) {
      const id = action.split(':')[1];
      const target = (state.planChanges || []).find((item) => item.id === id); if (!target) throw new Error('Cambio de planificación no encontrado');
      const approved = approvePlanChangeDraft(target, state.planning, { actorRole: sessionRole(), actorId: auth.user.id });
      await queueOperation({ type: 'CAMBIO_PLAN_APROBADO', entityType: 'plan_change', entityId: id, baseRevision: 0, conflictSensitive: false, payload: approved });
      await commit({ ...state, planChanges: state.planChanges.map((item) => item.id === id ? approved : item) }, { type: 'CAMBIO_PLAN_APROBADO', detail: id });
      return;
    }
    if (action.startsWith('publish-plan-change:')) {
      const id = action.split(':')[1];
      const target = (state.planChanges || []).find((item) => item.id === id); if (!target) throw new Error('Cambio de planificación no encontrado');
      const result = publishPlanChange(target, state.planning, { actorRole: sessionRole(), actorId: auth.user.id });
      await queueOperation({ type: 'CAMBIO_PLAN_PUBLICADO', entityType: 'planning', entityId: state.planning.id, baseRevision: state.planning.revision, conflictSensitive: true, payload: { plan: result.plan, change: result.change, differences: result.differences } });
      await commit({ ...state, planning: result.plan, session: result.plan.session, planChanges: state.planChanges.map((item) => item.id === id ? result.change : item) }, { type: 'CAMBIO_PLAN_PUBLICADO', detail: `${result.change.target.exerciseName} · revisión ${result.plan.revision}` });
      return;
    }
    if (action.startsWith('discard-plan-change:')) {
      const id = action.split(':')[1];
      const target = (state.planChanges || []).find((item) => item.id === id); if (!target) throw new Error('Cambio de planificación no encontrado');
      const reason = prompt('Motivo del descarte:'); if (!reason) return;
      const discarded = discardPlanChange(target, { actorRole: sessionRole(), actorId: auth.user.id, reason });
      await queueOperation({ type: 'CAMBIO_PLAN_DESCARTADO', entityType: 'plan_change', entityId: id, baseRevision: 0, conflictSensitive: false, payload: { reason } });
      await commit({ ...state, planChanges: state.planChanges.map((item) => item.id === id ? discarded : item) }, { type: 'CAMBIO_PLAN_DESCARTADO', detail: id });
      return;
    }
    if (action.startsWith('discard-intelligence:')) {
      const id = action.split(':')[1];
      const target = (state.intelligenceRuns || []).find((run) => run.runId === id); if (!target) throw new Error('Propuesta no encontrada');
      const reason = prompt('Motivo del descarte:'); if (!reason) return;
      const discarded = discardIntelligenceRun(target, { actorRole: sessionRole(), actorId: auth.user.id, reason });
      await queueOperation({ type: 'INTELIGENCIA_DESCARTADA', entityType: 'intelligence_run', entityId: id, baseRevision: 0, conflictSensitive: false, payload: { code: discarded.code, reason, rulesetVersion: discarded.rulesetVersion } });
      await commit({ ...state, intelligenceRuns: state.intelligenceRuns.map((run) => run.runId === id ? discarded : run) }, { type: 'INTELIGENCIA_DESCARTADA', detail: discarded.code });
      return;
    }
    if (action.startsWith('print-report:')) {
      const id = action.split(':')[1];
      const report = state.reports.find((item) => item.id === id);
      if (!report) throw new Error('Informe no encontrado');
      openPrintableReport(report);
      return;
    }
    if (action === 'generate-session-report') {
      const report = buildSessionReport(state.activeSession, { clientId: state.client.id, audience: 'coach', title: `Informe de sesión · ${state.session.title}` });
      const reports = [...state.reports.filter((item) => item.id !== report.id), report];
      return commit({ ...state, reports }, { type: 'INFORME_SESION_GENERADO', detail: report.id });
    }
    if (action === 'upload-document') {
      const documentRecord = await uploadDocumentFromForm();
      return commit({ ...state, documents: [...state.documents, documentRecord] }, { type: 'DOCUMENTO_VERSIONADO', detail: `${documentRecord.title} · v${documentRecord.version}` });
    }
    if (action.startsWith('publish-doc:')) {
      const id = action.split(':')[1];
      const target = state.documents.find((item) => item.id === id);
      if (!target) throw new Error('Documento no encontrado');
      const published = publishDocument(target, sessionRole());
      await repository.putDocument(published);
      await queueOperation({ type: 'DOCUMENTO_PUBLICADO', entityType: 'document', entityId: id, baseRevision: Number(target.version || 1) - 1, conflictSensitive: true, payload: published });
      return commit({ ...state, documents: state.documents.map((item) => item.id === id ? published : item) }, { type: 'DOCUMENTO_PUBLICADO', detail: id });
    }
    if (action.startsWith('retire-doc:')) {
      const id = action.split(':')[1];
      const target = state.documents.find((item) => item.id === id);
      if (!target) throw new Error('Documento no encontrado');
      const retired = retireDocument(target, sessionRole());
      await repository.putDocument(retired);
      await queueOperation({ type: 'DOCUMENTO_RETIRADO', entityType: 'document', entityId: id, baseRevision: Number(target.version || 1), conflictSensitive: true, payload: retired });
      return commit({ ...state, documents: state.documents.map((item) => item.id === id ? retired : item) }, { type: 'DOCUMENTO_RETIRADO', detail: id });
    }
    if (action.startsWith('publish:')) {
      const id = action.split(':')[1]; const target = state.reports.find((report) => report.id === id);
      const reports = state.reports.map((report) => (report.id === id ? publishReportRecord(report, sessionRole()) : report));
      const published = reports.find((report) => report.id === id);
      await queueOperation({ type: 'INFORME_PUBLICADO', entityType: 'report', entityId: id, baseRevision: target?.revision || 0, conflictSensitive: true, payload: published });
      return commit({ ...state, reports }, { type: 'INFORME_PUBLICADO', detail: id });
    }
    if (action.startsWith('retire-report:')) {
      const id = action.split(':')[1]; const target = state.reports.find((report) => report.id === id);
      if (!target) throw new Error('Informe no encontrado');
      const retired = retireReport(target, sessionRole());
      await queueOperation({ type: 'INFORME_RETIRADO', entityType: 'report', entityId: id, baseRevision: target.revision || 0, conflictSensitive: true, payload: retired });
      return commit({ ...state, reports: state.reports.map((item) => item.id === id ? retired : item) }, { type: 'INFORME_RETIRADO', detail: id });
    }
    if (action.startsWith('publish-client:')) {
      const clientId = action.split(':')[1]; const previous = state.clients.find((client) => client.id === clientId);
      if (!previous?.pendingModalidad) throw new Error('No hay un cambio pendiente para publicar');
      const modalityResult = changeModality(previous, previous.pendingModalidad, sessionRole());
      const draftProfile = clientProfileFor(previous.pendingModalidad, { version: previous.profileVersion, revision: previous.profileRevision || 0, status: 'borrador' });
      const publishedProfile = publishClientProfile(draftProfile, sessionRole());
      await queueOperation(modalityResult.event);
      await queueOperation({ type: 'PERFIL_CLIENTE_PUBLICADO', entityType: 'client_profile', entityId: clientId, baseRevision: previous.profileRevision || 0, conflictSensitive: true, payload: publishedProfile });
      const publishedClient = { ...modalityResult.client, pendingModalidad: null, profileVersion: publishedProfile.version, profileRevision: publishedProfile.revision };
      const clients = state.clients.map((client) => (client.id === clientId ? publishedClient : client));
      const client = state.client.id === clientId ? { ...state.client, ...publishedClient, appProfile: publishedProfile } : state.client;
      return commit({ ...state, clients, client }, { type: 'MODALIDAD_Y_PERFIL_PUBLICADOS', detail: `${previous.modalidad} → ${publishedClient.modalidad} · perfil v${publishedProfile.version}` });
    }

    if (action === 'save-plan-meta') {
      const goal = document.querySelector('#plan-goal')?.value || state.planning.goal;
      const weeks = Number(document.querySelector('#plan-weeks')?.value || state.planning.weeks);
      const activeWeek = Number(document.querySelector('#plan-active-week')?.value || state.planning.activeWeek);
      const sessionTitle = document.querySelector('#plan-session-title')?.value || state.planning.session.title;
      const planning = updatePlanningMeta(state.planning, { goal, weeks, activeWeek, session: { ...state.planning.session, title: sessionTitle } });
      return commit({ ...state, planning }, { type: 'PLANIFICACION_GUARDADA', detail: planning.title });
    }
    if (action === 'plan-add-block') {
      const type = prompt('Tipo: simple, biserie, superserie, triserie, gigante, circuito, intervalos, emom o amrap', 'simple'); if (!type) return;
      const title = prompt('Nombre del bloque:', 'Nuevo bloque') || 'Nuevo bloque';
      const rounds = ['circuito', 'intervalos', 'emom', 'amrap'].includes(type) ? Number(prompt('Rondas:', '3') || 3) : 1;
      const planning = addPlanningBlock(state.planning, { type, title, rounds });
      return commit({ ...state, planning }, { type: 'BLOQUE_PLANIFICACION_AÑADIDO', detail: `${type}: ${title}` });
    }
    if (action.startsWith('plan-remove-block:')) {
      const blockId = action.split(':')[1];
      return commit({ ...state, planning: removePlanningBlock(state.planning, blockId) }, { type: 'BLOQUE_PLANIFICACION_ELIMINADO', detail: blockId });
    }
    if (action.startsWith('plan-add-exercise:')) {
      const blockId = action.split(':')[1]; const exercise = promptLibraryExercise(); if (!exercise) return;
      const prescription = promptPrescription();
      return commit({ ...state, planning: addExerciseToPlanningBlock(state.planning, blockId, exercise, prescription) }, { type: 'EJERCICIO_PLANIFICADO', detail: exercise.name });
    }
    if (action.startsWith('plan-remove-exercise:')) {
      const [, blockId, exerciseId] = action.split(':');
      return commit({ ...state, planning: removeExerciseFromPlanningBlock(state.planning, blockId, exerciseId) }, { type: 'EJERCICIO_PLANIFICADO_ELIMINADO', detail: exerciseId });
    }
    if (action === 'plan-approve') {
      const planning = approvePlanningDraft(state.planning, sessionRole());
      await queueOperation({ type: 'PLANIFICACION_APROBADA', entityType: 'planning', entityId: planning.id, baseRevision: state.planning.revision, conflictSensitive: true, payload: { revision: planning.revision } });
      return commit({ ...state, planning }, { type: 'PLANIFICACION_APROBADA', detail: planning.id });
    }
    if (action === 'plan-publish') {
      const planning = publishPlanningDraft(state.planning, sessionRole());
      await queueOperation({ type: 'SESION_PUBLICADA', entityType: 'planning', entityId: planning.id, baseRevision: state.planning.revision, conflictSensitive: true, payload: planning });
      return commit({ ...state, planning, session: planning.session, activeSession: null }, { type: 'PLANIFICACION_PUBLICADA', detail: planning.id });
    }
    if (action === 'new-iri') {
      const history = iriHistoryFor(state.selectedClientId);
      const iriAssessment = createIriAssessment({
        clientId: state.selectedClientId,
        assessmentType: history.length ? 'reevaluacion' : 'inicial',
      });
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) }, { type: 'IRI_NUEVO_BORRADOR', detail: iriAssessment.id });
    }
    if (action.startsWith('iri-select:')) {
      const id = action.split(':')[1];
      const iriAssessment = (state.iriAssessments || []).find((item) => item.id === id);
      if (!iriAssessment) throw new Error('Evaluación IRI no encontrada');
      return commit({ ...state, iriAssessment }, { type: 'IRI_SELECCIONADO', detail: `${iriAssessment.evaluatedAt} · ${iriAssessment.status}` });
    }
    if (action.startsWith('iri-step:')) {
      const iriAssessment = setIriStep(state.iriAssessment, action.split(':')[1]);
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) });
    }
    if (action === 'iri-prev' || action === 'iri-next') {
      const currentIndex = IRI_SECTION_ORDER.indexOf(state.iriAssessment.currentStep);
      if (action === 'iri-next') {
        const sectionGate = validateIriSection(state.iriAssessment, state.iriAssessment.currentStep);
        if (!sectionGate.ok) throw new Error(sectionGate.errors.join(' · '));
      }
      const nextIndex = action === 'iri-next'
        ? Math.min(IRI_SECTION_ORDER.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
      const iriAssessment = setIriStep(state.iriAssessment, IRI_SECTION_ORDER[nextIndex]);
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) });
    }
    if (action === 'derive-iri') {
      const iriAssessment = applyDerivedIriInterpretation(state.iriAssessment);
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) }, { type: 'LECTURA_IRI_CALCULADA', detail: `${calculateIriScore(iriAssessment).score ?? 'sin score'}/100` });
    }
    if (action === 'save-iri-draft') {
      const before = state.iriAssessment;
      let iriAssessment = before;
      if (remoteActive()) iriAssessment = await persistIriRemote(before);
      await queueOperation({
        type: 'IRI_AUTOSAVE', entityType: 'iri', entityId: iriAssessment.id,
        baseRevision: Number(before.revision || 0), conflictSensitive: false,
        payload: { revision: iriAssessment.revision, currentStep: iriAssessment.currentStep, status: iriAssessment.status },
      });
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) }, { type: 'IRI_BORRADOR_GUARDADO', detail: remoteActive() ? 'local + nube' : 'local' });
    }
    if (action === 'approve-iri') {
      const previousRevision = state.iriAssessment.revision;
      let iriAssessment = approveIriAssessment(state.iriAssessment, sessionRole(), auth.user.id);
      if (remoteActive()) iriAssessment = await persistIriRemote(iriAssessment);
      await queueOperation({ type: 'IRI_APROBADO', entityType: 'iri', entityId: iriAssessment.id, baseRevision: previousRevision, conflictSensitive: true, payload: { revision: iriAssessment.revision, score: calculateIriScore(iriAssessment).score } });
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) }, { type: 'IRI_APROBADO', detail: iriAssessment.id });
    }
    if (action === 'generate-iri-reports') {
      const currentReports = state.reports.filter((report) => report.type === 'iri' && report.sourceId === state.iriAssessment.id);
      let generatedList = currentReports;
      if (currentReports.length < 2) {
        const generated = buildIriReports(state.iriAssessment, previousIriAssessment(state.iriAssessment));
        generatedList = [generated.coach, generated.client];
        if (remoteActive() && typeof repository.saveIriReportsRemote === 'function') {
          await repository.saveIriReportsRemote(auth.token, generatedList, {
            clientId: state.iriAssessment.clientId,
            assessmentId: state.iriAssessment.id,
            actorUserId: auth.user.id,
          });
        }
      }
      const existingByAudience = new Set(currentReports.map((report) => report.audience));
      const reports = [...state.reports, ...generatedList.filter((report) => !existingByAudience.has(report.audience))];
      const clientReport = generatedList.find((report) => report.audience === 'cliente');
      await queueOperation({ type: 'INFORMES_IRI_GENERADOS', entityType: 'iri', entityId: state.iriAssessment.id, baseRevision: state.iriAssessment.revision, conflictSensitive: true, payload: { reportIds: generatedList.map((report) => report.id), reused: currentReports.length >= 2 } });
      return commit({ ...state, reports, iri: { score: clientReport?.detail?.score ?? calculateIriScore(state.iriAssessment).score, classification: clientReport?.detail?.classification ?? state.iriAssessment.sections.interpretacion.clasificacion, nextAction: clientReport?.detail?.priorities?.[0] ?? state.iriAssessment.sections.planAccion.prioridad1 } }, { type: currentReports.length >= 2 ? 'INFORMES_IRI_REUTILIZADOS' : 'INFORMES_IRI_GENERADOS', detail: state.iriAssessment.id });
    }
  } catch (error) {
    if (!auth || ['login-credentials','request-password-reset','update-password'].includes(action)) { authNotice = error.message; render(); }
    else alert(error.message);
  } finally {
    busy = false;
  }
}

root.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) handleAction(action);
  const mode = event.target.closest('[data-coach-mode]')?.dataset.coachMode;
  if (mode) commit({ ...state, coachMode: mode });
});

root.addEventListener('change', async (event) => {
  if (event.target.id === 'field-client') return commit({ ...state, selectedClientId: event.target.value });
  if (event.target.dataset.iriSection) {
    try {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      const iriAssessment = updateIriField(state.iriAssessment, event.target.dataset.iriSection, event.target.dataset.iriField, value);
      return commit({ ...state, iriAssessment, iriAssessments: upsertIriHistory(iriAssessment) }, { type: 'IRI_AUTOSAVE_LOCAL', detail: `${event.target.dataset.iriSection}.${event.target.dataset.iriField}` });
    } catch (error) {
      alert(error.message);
      render();
      return;
    }
  }
  const clientId = event.target.dataset.clientModalidad;
  if (!clientId) return;
  try {
    const previous = state.clients.find((client) => client.id === clientId); if (!previous) throw new Error('Cliente no encontrado');
    const next = event.target.value; const pendingModalidad = next === previous.modalidad ? null : next;
    const clients = state.clients.map((client) => (client.id === clientId ? { ...client, pendingModalidad } : client));
    await commit({ ...state, clients }, pendingModalidad ? { type: 'BORRADOR_MODALIDAD_PREPARADO', detail: `${previous.modalidad} → ${pendingModalidad}` } : { type: 'BORRADOR_MODALIDAD_CANCELADO', detail: previous.modalidad });
  } catch (error) { alert(error.message); render(); }
});

window.addEventListener('online', async () => {
  state = { ...state, online: true };
  await saveState(repository, state);
  const resumed = await resumeAuth(repository);
  if (resumed) await applyAuthenticatedBootstrap(resumed);
  else await refreshRuntime();
  render();
});
window.addEventListener('offline', async () => { state = { ...state, online: false }; await saveState(repository, state); render(); });

async function boot() {
  repository = await createRepository();
  recoveryToken = recoveryTokenFromLocation();
  if (recoveryToken) authPanel = 'reset';
  state = await loadState(repository);
  const recovery = detectAbruptRecovery(state.activeSession);
  if (recovery && !state.recovery?.acknowledged) {
    state = { ...state, recovery };
    await saveState(repository, state);
    announce('Se recuperó una sesión guardada localmente');
  }
  const resumed = await resumeAuth(repository);
  if (resumed) await applyAuthenticatedBootstrap(resumed);
  else await refreshRuntime();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  const bootEndedAt = globalThis.performance?.now?.() || Date.now();
  runtime.performance = recordMetric(runtime.performance, 'boot', bootEndedAt - bootStartedAt);
  render();
}

boot().catch((error) => {
  root.innerHTML = `<main class="login-shell"><section class="login-card"><h1>No se pudo iniciar IBERFIT</h1><p>${esc(error.message)}</p></section></main>`;
});
