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
