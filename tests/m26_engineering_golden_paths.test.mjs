import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const text=fs.readFileSync('docs/operations/ENGINEERING_GOLDEN_PATHS.md','utf8');

test('golden path conserva Wrangler Windows probado',()=>{
  assert.match(text,/cmd\.exe \/d \/s \/c npx --yes wrangler@4\.120\.0/u);
  assert.match(text,/preflights que ocurren \*\*antes del clone\*\*/u);
  assert.match(text,/spawnSync <exe> ENOENT/u);
  assert.match(text,/causa estructural confirmada fue el `cwd`/u);
});
test('golden path conserva parser porcelain probado',()=>{
  assert.match(text,/git status --porcelain --untracked-files=all/u);
  assert.match(text,/Git puede resumir `\?\? scripts\/prelaunch\/`/u);
  assert.match(text,/V15 falló por este comportamiento/u);
  assert.match(text,/No aplicar `\.trim\(\)` a la salida completa/u);
  assert.match(text,/line\.slice\(3\)/u);
  assert.match(text,/V10 eliminó el espacio inicial/u);
});
test('golden path conserva fingerprint y ledger',()=>{
  assert.match(text,/SHA256\(publicKey\)/u);
  assert.match(text,/V12 usó\s+`SHA256\(projectRef:publicKey\)`/u);
  assert.match(text,/Nunca rerunear a\s+ciegas/u);
});
test('golden path conserva hard guards',()=>{
  assert.match(text,/gjztkdwfmunnzhtvxrsu/u);
  assert.match(text,/pjhmrhejsoofmouedavw/u);
  assert.match(text,/m26-canary\.iberfit\.cl/u);
  assert.match(text,/nunca `main`/u);
});

test('golden path conserva observabilidad antes de abortar',()=>{
  assert.match(text,/causa concreta/iu);
  assert.match(text,/console\.error/iu);
  assert.match(text,/requestfailed/iu);
  assert.match(text,/respuestas HTTP >= 400/iu);
  assert.match(text,/V16 falló con `PRELAUNCH_LIVE_CONSOLE_ERROR`/u);
  assert.match(text,/distinguir `skipped` de\s+`failure`/u);
  assert.match(text,/exactamente un LF/iu);
  assert.match(text,/V17 fue detenido por\s+`git diff --check`/u);
});

test('golden path conserva RUM bloqueado sin relajar CSP y gate live post-deploy',()=>{
  const workflow=fs.readFileSync('.github/workflows/remote-gates.yml','utf8');
  const generator=fs.readFileSync('scripts/generate_rc74_4_runtime_config.mjs','utf8');
  assert.match(text,/Cloudflare RUM \/ Web Analytics y CSP estricta/u);
  assert.match(text,/script-src 'self'/u);
  assert.match(text,/Cache-Control: no-transform/u);
  assert.match(text,/gate live\s+se ejecuta sobre `canary\/rc74-4` después del deploy/iu);
  assert.match(generator,/RC74_4_HEADERS_NO_TRANSFORM_MISSING/u);
  assert.match(generator,/no-store, no-transform/u);
  assert.match(workflow,/Validar Canary desplegado en navegador real\n\s+if: \$\{\{ github\.ref_name == 'canary\/rc74-4' \}\}/u);
  assert.match(workflow,/Conservar evidencia Canary live pre-launch\n\s+if: \$\{\{ always\(\) && github\.ref_name == 'canary\/rc74-4' \}\}/u);
});

test('golden path conserva parcheadores estructurales',()=>{
  assert.match(text,/Parcheadores de release: anclas estructurales/u);
  assert.match(text,/V19 falló antes de cualquier mutación con `PATCH_CSP_GENERATED_ASSERT_COUNT:0`/u);
  assert.match(text,/cardinalidad exactamente\s+1/iu);
});

test('golden path conserva rutas cortas y core.longpaths en Windows',()=>{
  assert.match(text,/Windows: rutas largas en clones/u);
  assert.match(text,/V20 falló antes de cualquier mutación con `Filename too long`/u);
  assert.match(text,/%TEMP%/u);
  assert.match(text,/core.longpaths=true/u);
});

test('golden path distingue LF real de backslash-n literal',()=>{
  assert.match(text,/Tooling: LF real frente a \\\\n literal/u);
  assert.match(text,/V21 superó clone, longpaths y alcance/u);
  assert.match(text,/saltos de línea reales entre sentencias/iu);
});

test('golden path conserva capas de escape de regex',()=>{
  assert.match(text,/Tooling: capas de escape en regex generados/u);
  assert.match(text,/V22 demostró que el producto generaba correctamente el header/u);
  assert.match(text,/fixture con LF real/iu);
});
