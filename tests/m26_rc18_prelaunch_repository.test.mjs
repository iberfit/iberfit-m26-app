import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required=[
  '.github/workflows/ci.yml','.github/workflows/remote-gates.yml','.github/pull_request_template.md',
  'SECURITY.md','CONTRIBUTING.md','CODEOWNERS','.env.example',
  'scripts/remote-gates/supabase_readonly_preflight.sql','scripts/remote-gates/run_authenticated_readonly_gate.mjs',
  'docs/operations/CANARY_RUNBOOK_RC18.md','docs/operations/ROLLBACK_RUNBOOK_RC18.md','docs/REMOTE_GATE_MATRIX_RC18.md'
];
test('RC18 contiene el kit completo de repositorio y prelaunch',()=>{for(const file of required)assert.equal(existsSync(file),true,file);});
test('workflows no despliegan ni escriben en Supabase',()=>{const content=required.filter(x=>x.startsWith('.github/workflows')).map(x=>readFileSync(x,'utf8')).join('\n');assert.doesNotMatch(content,/wrangler\s+(?:deploy|pages deploy)/i);assert.doesNotMatch(content,/service[_-]?role/i);assert.match(content,/READ_ONLY_REMOTE_GATE/);});
test('preflight SQL es solo lectura',()=>{const sql=readFileSync('scripts/remote-gates/supabase_readonly_preflight.sql','utf8');assert.doesNotMatch(sql,/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i);assert.match(sql,/domain_command_registry_v26/);});
test('runbooks mantienen producción protegida',()=>{const text=readFileSync('docs/operations/CANARY_RUNBOOK_RC18.md','utf8')+readFileSync('docs/operations/ROLLBACK_RUNBOOK_RC18.md','utf8');assert.match(text,/m26-canary\.iberfit\.cl/);assert.match(text,/M25\.1/);assert.match(text,/cross-client/i);});
