export const DEFAULT_CI_GATES_M10 = [
  'syntax',
  'unit',
  'http-e2e',
  'visual-smoke',
  'rls-static',
  'no-destructive-sql',
  'synthetic-only',
  'no-service-role-browser',
  'pwa-cache',
  'zip-integrity'
];

export function evaluateCiGates(results = {}) {
  const gates = DEFAULT_CI_GATES_M10.map((name) => {
    const result = results[name];
    return {
      name,
      status: result === true ? 'pass' : result === false ? 'fail' : 'missing'
    };
  });
  const failed = gates.filter((gate) => gate.status !== 'pass');
  return {
    ok: failed.length === 0,
    gates,
    failed,
    releaseAllowed: false,
    reason: failed.length ? 'No se permite avanzar sin todos los gates en verde.' : 'Apto solo para staging sintético; producción sigue bloqueada.'
  };
}

export function buildCodexHandoff({ milestone, packageName, checksum, blockers = [] } = {}) {
  if (!milestone || !packageName || !checksum) {
    throw new Error('milestone, packageName y checksum son obligatorios');
  }
  return {
    milestone,
    packageName,
    checksum,
    codexMode: 'audit_and_extend_without_regression',
    allowed: [
      'ejecutar pruebas',
      'auditar RLS',
      'agregar casos E2E',
      'refactorizar sin cambiar contratos',
      'proponer mejoras con diff revisable'
    ],
    forbidden: [
      'usar datos reales',
      'publicar producción',
      'activar servicios pagados',
      'borrar capacidades existentes',
      'exponer service_role'
    ],
    blockers
  };
}
