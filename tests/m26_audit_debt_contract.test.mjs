import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/continuous-app-audit.yml',import.meta.url),'utf8');
const actionAudit=await readFile(new URL('../scripts/audit/action_registry_audit.mjs',import.meta.url),'utf8');
const deepAudit=await readFile(new URL('../scripts/audit/deep_product_audit.mjs',import.meta.url),'utf8');

test('continuous audit corre en la rama canónica y conserva gates read-only',()=>{
  assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- canary\/rc74-4/u);
  assert.doesNotMatch(workflow,/prep\/final-production-rc74-4/u);
  assert.match(workflow,/action_registry_audit\.mjs/u);
  assert.match(workflow,/continuous_app_audit\.mjs/u);
  assert.match(workflow,/deep_product_audit\.mjs/u);
  assert.match(workflow,/M26_AUDIT_APP_URL:\s*https:\/\/app\.iberfit\.cl/u);
  assert.match(workflow,/persist-credentials:\s*false/u);
  assert.match(workflow,/cache:\s*'npm'/u);
});

test('action registry audit valida roles, dominios y acciones renderizadas',()=>{
  assert.match(actionAudit,/M26_ACTION_REGISTRY/u);
  assert.match(actionAudit,/MARKUP_ACTION_UNREGISTERED/u);
  assert.match(actionAudit,/REGISTRY_ROLES_INVALID/u);
  assert.match(actionAudit,/REGISTRY_ROLE_UNKNOWN/u);
  assert.match(actionAudit,/REGISTRY_DOMAIN_MISSING/u);
  assert.match(actionAudit,/IBERFIT_ACTION_REGISTRY_AUDIT=PASS/u);
});

test('deep product audit cubre rutas, privacidad, fuente desplegable y LIVE sin mutar producción',()=>{
  for(const marker of [
    'ROLE_AREA_ICON_MISSING',
    'INTERACTIVE_MARKUP_CONTRACT_FAILED',
    'CLIENT_CROSS_TENANT_CLIENT_LEAK',
    'CLIENT_DRAFT_PUBLICATION_LEAK',
    'SUPABASE_SECRET_KEY',
    'LIVE_RUNTIME_NOT_PROD',
    'LIVE_RUNTIME_QA_LEAK',
    'PWA_MANIFEST_VALID',
    'LIVE_PUBLIC_SURFACE_READ_ONLY_PASS',
    'IBERFIT_DEEP_AUDIT=',
  ]) assert.ok(deepAudit.includes(marker),`deep audit marker missing: ${marker}`);
  assert.match(deepAudit,/method:'GET'/u);
  assert.match(deepAudit,/Read-only: no autentica cuentas reales, no ejecuta comandos de dominio y no modifica producción/u);
});
