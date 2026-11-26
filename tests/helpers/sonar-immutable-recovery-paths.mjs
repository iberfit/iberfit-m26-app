// Exact historical production source artifacts, not deployable runtime code.
// The central Sonar policy test verifies these paths against the M44 provenance
// inventory and validates their pinned source bytes.
export const M44_IMMUTABLE_CPD_ARCHIVES=Object.freeze([
  "scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261119/index.ts",
  "scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/index.ts",
  "scripts/ops/m44_legacy_edge_source/iberfit-iri-report-emission-v1-prod-20261115/index.ts",
  "scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/pdf-renderer.js",
  "scripts/ops/m44_legacy_edge_source/iberfit-evolution-report-emission-v1-prod-20261115/storage-recovery.js"
]);
export const HISTORICAL_CPD_EDGE_PATHS=Object.freeze([
  'scripts/ops/m44_legacy_edge_source/iberfit-admin-client-invite-v1-prod-20261117.ts',
  ...M44_IMMUTABLE_CPD_ARCHIVES,
]);
