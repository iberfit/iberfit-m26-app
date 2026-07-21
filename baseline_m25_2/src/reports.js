import { sessionExecutionSummary } from './domain.js';

const REPORT_AUDIENCES = new Set(['coach', 'cliente']);

function now() {
  return new Date().toISOString();
}

export function normalizeReport(report = {}) {
  const audience = report.audience || (String(report.id || '').includes('CLIENT') ? 'cliente' : 'coach');
  if (!REPORT_AUDIENCES.has(audience)) throw new Error('Audiencia de informe inválida');
  return {
    id: report.id || `INF-${Date.now()}`,
    clientId: report.clientId || null,
    title: report.title || 'Informe IBERFIT',
    type: report.type || 'general',
    audience,
    status: report.status || 'borrador',
    revision: Number(report.revision || 0),
    summary: report.summary || '',
    sections: Array.isArray(report.sections) ? report.sections : [],
    createdAt: report.createdAt || now(),
    approvedAt: report.approvedAt || null,
    publishedAt: report.publishedAt || null,
    retiredAt: report.retiredAt || null,
  };
}

export function buildSessionReport(sessionState, options = {}) {
  const closedStatuses = new Set(['cerrada', 'cerrada_confirmada']);
  if (!sessionState || !closedStatuses.has(sessionState.status)) throw new Error('La sesión debe tener cierre confirmado');
  const summary = sessionExecutionSummary(sessionState);
  const completed = sessionState.steps.filter((step) => step.status === 'completada');
  const changes = completed.flatMap((step) => {
    const fields = ['load', 'reps', 'seconds', 'meters'];
    return fields
      .filter((field) => Number(step.planned[field] || 0) !== Number(step.actual[field] || 0))
      .map((field) => `${step.exerciseName}: ${field} ${step.planned[field]} → ${step.actual[field]}`);
  });
  return normalizeReport({
    id: options.id || `INF-SES-${sessionState.sessionId}-${Date.now()}`,
    clientId: options.clientId || null,
    title: options.title || 'Informe de sesión',
    type: 'sesión',
    audience: options.audience || 'coach',
    status: 'aprobado',
    summary: `${summary.completada} series completadas, ${summary.omitida} omitidas y ${summary.incidents} incidencias.`,
    sections: [
      { title: 'Planificado vs. realizado', body: changes.length ? changes.join('\n') : 'Sin diferencias relevantes respecto de lo planificado.' },
      { title: 'Incidencias', body: sessionState.incidents?.length ? sessionState.incidents.map((item) => item.note || item.type).join('\n') : 'Sin incidencias registradas.' },
      { title: 'Feedback', body: sessionState.feedback ? JSON.stringify(sessionState.feedback) : 'Sin feedback registrado.' },
    ],
  });
}

export function approveReport(report, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede aprobar informes');
  const normalized = normalizeReport(report);
  return { ...normalized, status: 'aprobado', revision: normalized.revision + 1, approvedAt: now() };
}

export function publishReportRecord(report, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede publicar informes');
  const normalized = normalizeReport(report);
  if (normalized.status !== 'aprobado') throw new Error('El informe debe estar aprobado');
  return { ...normalized, status: 'publicado', revision: normalized.revision + 1, publishedAt: now() };
}

export function retireReport(report, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede retirar informes');
  const normalized = normalizeReport(report);
  return { ...normalized, status: 'retirado', revision: normalized.revision + 1, retiredAt: now() };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

export function buildPrintableReportHtml(report, context = {}) {
  const normalized = normalizeReport(report);
  const clientName = context.clientName || 'Cliente IBERFIT';
  const sections = normalized.sections.length
    ? normalized.sections.map((section) => `<section><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body).replace(/\n/g, '<br>')}</p></section>`).join('')
    : `<section><h2>Lectura IBERFIT</h2><p>${escapeHtml(normalized.summary)}</p></section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(normalized.title)}</title><style>
  :root{--forest:#10271c;--gold:#b8973a;--cream:#f7f4ee;--ink:#13231a}*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font-family:Arial,sans-serif}.page{max-width:820px;margin:auto;padding:48px}.head{border-bottom:4px solid var(--gold);padding-bottom:22px;margin-bottom:28px}.brand{color:var(--forest);font-weight:800;letter-spacing:.18em}.head h1{font-family:Georgia,serif;font-size:38px;margin:14px 0 8px}.meta{color:#667168}.summary{background:white;border-left:5px solid var(--gold);padding:18px;margin:24px 0}section{margin:26px 0}h2{color:var(--forest)}footer{border-top:1px solid #d5cbb8;margin-top:40px;padding-top:16px;color:#667168;font-size:12px}@media print{button{display:none}.page{padding:20mm}}</style></head><body><main class="page"><header class="head"><div class="brand">IBERFIT</div><h1>${escapeHtml(normalized.title)}</h1><div class="meta">${escapeHtml(clientName)} · ${escapeHtml(normalized.audience)} · revisión ${normalized.revision}</div></header><div class="summary"><strong>Lectura IBERFIT</strong><p>${escapeHtml(normalized.summary)}</p></div>${sections}<footer>Entrenamiento personal con criterio: diagnóstico, planificación, control y seguimiento.</footer></main><script>window.addEventListener('load',()=>window.print())<\/script></body></html>`;
}
