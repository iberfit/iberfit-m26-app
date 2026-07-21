export const BETA_REQUIRED_GATES = Object.freeze([
  'synthetic-only', 'security-advisor-clean', 'auth-rls-e2e', 'storage-private', 'backup-restore',
  'chaos-offline', 'synthetic-load', 'visual-mobile', 'visual-tablet', 'visual-desktop', 'accessibility-smoke',
]);

export function previewMode(search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search);
  return {
    enabled: params.get('preview') === '1',
    staging: params.get('staging') === '1',
    audience: params.get('audience') || 'interno',
  };
}

export function betaReadiness(gates = {}) {
  const checks = BETA_REQUIRED_GATES.map((key) => ({ key, pass: gates[key] === true, detail: gates[key] === true ? 'Aprobado' : 'Pendiente' }));
  return {
    ready: checks.every((item) => item.pass),
    passed: checks.filter((item) => item.pass).length,
    total: checks.length,
    checks,
  };
}

export function controlledPreviewGuard(config = {}, auth = null) {
  const mode = previewMode(config.search || '');
  if (!mode.enabled) return { allowed: true, reason: 'Modo estándar' };
  if (config.syntheticOnly !== true || config.allowRealData === true) return { allowed: false, reason: 'Gate 0 bloqueó el preview' };
  if (mode.audience !== 'interno') return { allowed: false, reason: 'Preview público no autorizado' };
  if (mode.staging && !auth) return { allowed: false, reason: 'Preview staging requiere autenticación' };
  return { allowed: true, reason: 'Preview interno sintético' };
}
