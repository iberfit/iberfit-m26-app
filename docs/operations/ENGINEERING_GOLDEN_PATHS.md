# IBERFIT Engineering Golden Paths

Regla permanente: antes de crear tooling de release, QA, GitHub, Supabase o
Cloudflare, reutilizar primero el mecanismo que ya funcionó y tiene evidencia.

## Después de cualquier fallo
Determinar antes de reintentar si hubo commit, push, rama, PR, merge, deploy,
cambio Cloudflare o escritura Supabase. Guardar SHA y ledger. Nunca rerunear a
ciegas después de un fallo post-mutation.

## GitHub
- Revalidar `canary/rc74-4` justo antes de cada mutación.
- Durante RC65/pre-launch: nunca `main`, nunca force-push, nunca merge a `main`.
- Si el conector devuelve 403 en una escritura, no probar otra escritura del mismo
  conector. Golden path: ejecutor local autenticado con `git.exe` + `gh.exe`.

## Windows + procesos externos
Golden path demostrado por V11 para Wrangler:

`cmd.exe /d /s /c npx --yes wrangler@4.120.0 ...`

Reglas obligatorias:
- Antes de `spawnSync`, verificar que el `cwd` existe.
- Los preflights que ocurren **antes del clone** deben usar `SCRIPT_DIR`, no la futura
  carpeta de trabajo del repositorio.
- Un `spawnSync <exe> ENOENT` puede significar que el `cwd` no existe, aunque el
  ejecutable sí exista. Comprobar primero executable + cwd por separado.
- V13 terminó con `status=-1` y V14 mostró explícitamente
  `spawnSync ... cmd.exe ENOENT`; la causa estructural confirmada fue el `cwd`
  pre-clone inexistente.
- No introducir wrappers `.cmd` innecesarios cuando la invocación directa de V11
  ya está probada.
- No lanzar `npx.cmd` directamente desde Node cuando el patrón `cmd.exe /d /s /c`
  ya está validado.
- Usar quoting de `cmd.exe` probado y conservar stderr sanitizado suficiente para
  clasificar el fallo.
- No confundir fallo de invocación con fallo de autenticación.

## PowerShell
- Prevalidar parser antes de red.
- Evitar `$variable:` ambiguo; usar `${variable}` o `-f`.
- ParserError antes de ejecución = 0 mutaciones.

## git status --porcelain
Golden path para validar el alcance exacto:

`git status --porcelain --untracked-files=all`

- No usar `git status --porcelain` a secas cuando el parche crea directorios nuevos:
  Git puede resumir `?? scripts/prelaunch/` en lugar de enumerar el archivo real.
  V15 falló por este comportamiento aunque el parche tenía exactamente el alcance previsto.
- No aplicar `.trim()` a la salida completa.
- Preservar los dos caracteres de estado.
- Exigir `line[2] === ' '`.
- Path = `line.slice(3)`.
- Rechazar renames inesperados.
- Self-test obligatorio con ` M ...` y `?? ...`.
V10 eliminó el espacio inicial y convirtió `scripts/...` en `cripts/...`.
V13 había reintroducido el mismo patrón y se corrigió antes de esa fase.

## JSON de CLI
Primero JSON completo. Con warnings, extraer bloques balanceados y elegir el
contenedor válido mayor. Nunca elegir el último `{` o `[`. V6 falló por esto.

## Supabase
- No extraer manualmente la sesión CLI si la CLI puede usarla.
- Password QA por Auth Admin, no SQL sobre encrypted_password.
- Nunca registrar service_role, sb_secret, secretos TOTP, QR, OTP o recovery.
- Fingerprint IBERFIT: `SHA256(publicKey)`. V12 usó
  `SHA256(projectRef:publicKey)` y produjo un falso positivo.
- QA exacto: `gjztkdwfmunnzhtvxrsu`, `qaOnly=true`.
- Producción bloqueada: `pjhmrhejsoofmouedavw`.

## Cloudflare Canary
- Proyecto: `iberfit-m26-canary`.
- Dominio canónico: `m26-canary.iberfit.cl`.
- `*.pages.dev` permanece fail-closed para login.
- `productionBranch=canary/rc74-4`, `autoProduction=false`.
- Direct upload es autoritativo.
- Source de deployment list puede venir abreviado; SHA exacto por `version.json`.
- Falso negativo después de deploy no autoriza redeploy automático.
- V11 es la referencia de Wrangler Windows.

## CSP / runtime
- `public/m26/_headers` sigue siendo plantilla de producción.
- Canary genera CSP QA-only en `/_headers` y `/m26/_headers`.
- QA exacto, 0 origen producción y 0 wildcard Supabase.
- Nunca relajar CSP/hostname para hacer verde un gate.

## Gates
- Localhost no sustituye custom domain.
- Gate live obligatorio en `https://m26-canary.iberfit.cl`, desktop + mobile,
  runtime enabled, QA exacto, sin overflow ni errores.
- Preview explica el bloqueo y dirige al Canary, pero no habilita login.
- Gate pre-auth read-only: bloquear POST/PUT/PATCH/DELETE.

## Principio
Si un mecanismo ya funcionó: reutilizarlo literalmente, cambiar una sola capa,
añadir self-test/regresión, fail-closed y conservar SHA/ledger.
## Observabilidad de gates y errores secundarios
- Un gate fail-closed debe registrar la **causa concreta** antes de lanzar el código
  resumido de error. Para navegador: texto y ubicación de `console.error`,
  `pageerror`, `requestfailed` y respuestas HTTP >= 400, sin credenciales.
- La evidencia diagnóstica debe escribirse antes de las invariantes finales cuando
  sea técnicamente posible. V16 falló con `PRELAUNCH_LIVE_CONSOLE_ERROR` pero el
  primer script no imprimió el contenido del error ni alcanzó a escribir evidencia.
- Un paso de conservación de artifacts no debe añadir un segundo fallo cuando su
  paso productor fue omitido por un fallo anterior. Debe distinguir `skipped` de
  `failure`; si el productor sí corrió y faltan artifacts esperados, puede seguir
  siendo fail-closed.
- Todo archivo de texto generado por tooling debe terminar en exactamente un LF,
  sin espacios finales ni una línea en blanco extra al EOF. V17 fue detenido por
  `git diff --check` por dos `new blank line at EOF`; fue un fallo del generador,
  no del producto ni del gate.

## Cloudflare RUM / Web Analytics y CSP estricta
- Cloudflare puede inyectar automáticamente `static.cloudflareinsights.com/beacon.min.js`
  en HTML aunque el repositorio no contenga ese script. V18 lo aisló como la única
  causa de `PRELAUNCH_LIVE_CONSOLE_ERROR`.
- Para Canary IBERFIT se mantiene `script-src 'self'`; no se amplía la CSP solo
  para silenciar un tercero.
- El artefacto Canary debe emitir `Cache-Control: no-transform` en las superficies
  HTML para impedir que el edge reescriba el documento, conservando además
  `no-store` / `no-cache` según corresponda.
- La plantilla `public/m26/_headers` continúa siendo la plantilla de producción;
  el hardening `no-transform` de esta etapa se genera únicamente en el build Canary.
- El gate del custom domain valida una **superficie ya desplegada**. En una feature
  pre-merge no debe comparar el código nuevo contra un Canary viejo: el gate live
  se ejecuta sobre `canary/rc74-4` después del deploy. Antes del merge se usan CI,
  gate autenticado read-only y pruebas de build.

## Parcheadores de release: anclas estructurales
- Los parcheadores de release no deben depender de bloques multilínea con escapes
  serializados cuando existe una línea sintáctica única y verificable.
- V19 falló antes de cualquier mutación con `PATCH_CSP_GENERATED_ASSERT_COUNT:0`
  porque la coincidencia literal del bloque de test era frágil.
- Golden path: insertar alrededor de líneas únicas, exigir cardinalidad exactamente
  1, normalizar EOL y cubrir el helper con self-test antes de cualquier llamada remota.

## Windows: rutas largas en clones
- Los ejecutores de release no deben clonar repositorios grandes dentro de rutas
  profundas bajo Downloads/Desktop.
- V20 falló antes de cualquier mutación con `Filename too long` al checkout de
  `IBERFITBluetoothHeartRateForegroundService.kt`.
- Golden path Windows: workdir corto bajo `%TEMP%`, repo con nombre mínimo y
  `git clone -c core.longpaths=true`. Después del clone se verifica
  `git config --get core.longpaths == true`.
- Antes de clonar, el ejecutor valida que el workdir y repo no excedan los límites
  conservadores definidos por el tooling.

## Tooling: LF real frente a \\n literal
- Cuando un parcheador inserta varias líneas de código, debe unirlas con un LF real
  (`'\n'` en el string del ejecutor), no con los dos caracteres literales
  backslash+n (`'\\n'`).
- V21 superó clone, longpaths y alcance, pero generó tres asserts en una sola línea
  separados por `\\n` literal; `node --check` lo bloqueó antes de cualquier mutación.
- Golden path: self-test con una inserción multilínea exacta y comprobación de que
  el texto generado contiene saltos de línea reales entre sentencias.

## Tooling: capas de escape en regex generados
- Al generar código JavaScript que a su vez contiene una expresión regular, distinguir
  las capas: string del ejecutor -> texto del archivo -> semántica del regex.
- Para que el archivo contenga `/foo\nbar/` y el regex haga match con un LF real,
  el archivo final debe tener **un solo backslash** antes de `n`.
- V22 demostró que el producto generaba correctamente el header con LF real, pero el
  test quedó como `/foo\\nbar/`, que busca backslash+n literal.
- Golden path: centralizar líneas con escapes sensibles en una función, self-testear
  la forma exacta del texto generado y probar la semántica contra un fixture con LF real.
