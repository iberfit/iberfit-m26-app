# M44 · checkpoint operativo vigente (15/10/2026)

**Estado:** no promover a Canary ni PROD todavía. Esta sección prevalece sobre
las notas históricas posteriores del documento.

- **HEAD probado:** `e83e4563b7b66ca7495f06b748f748724fabe607`.
- **CI:** `#38798997830` SUCCESS — contratos M43/M44, WebAuthn QA negativo
  (3 cuentas y 9 operaciones denegadas), Edge/PDF real, empaquetado y
  Chromium A4 desktop/tablet/mobile, incluyendo retirada visual e intento
  posterior de descarga bloqueado.
- **Supabase QA:** función `iberfit-evolution-report-emission-v1` **v9 ACTIVE,
  JWT obligatorio**; la base de QA contiene las migraciones M44 y el cierre de
  verificación privilegiada. IRI inicial conserva su circuito independiente.
- **Cambio fundamental frente al checkpoint anterior:** M44 ya **no entrega
  enlaces firmados** de Storage con caducidad de 120 segundos. Emisión, último
  y apertura exponen únicamente identificador de la emisión, versión, SHA-256
  y modo `authenticated-pdf`; la obtención de bytes es otra petición
  `download` con bearer, scope de Cliente/Coach/Admin, consulta de estado de
  retirada y checksum verificado por servidor y cliente. El visor usa una URL
  `blob:` local en memoria, revocada posteriormente. No afirmar que se pueden
  eliminar remotamente las copias ya guardadas por terceros ni detener las
  descargas iniciadas antes de la retirada.
- **Pruebas reales QA:** denegaciones HTTP para Coach sin MFA, dos Clientes,
  acceso interno y descarga no autorizada. `iberfit_evolution_report_issuances_v1`
  y Storage siguen sin emisiones oficiales; no hay evidencia de ciclo completo
  positivo con PDF real emitido en sesión WebAuthn validada.
- **Prueba preparada para Canary autorizado:** `qa/m44/verified-webauthn-readonly.mjs`
  enlazada con el navegador real del workflow OIDC de Coach; requiere una
  sesión WebAuthn verificada y comprueba que el control M44 pasa la MFA antes
  de negar un informe inexistente. **Pendiente de ejecución en Canary**, sin
  ampliar la autorización OIDC del broker y sin fabricar tokens.
- **Aprobaciones pendientes:** ensayo completo sintético con sesión MFA real
  (crear/publicar/emitir/descargar/historial/retirar/versionar, sin datos reales),
  compatibilidad de PR + merge a Canary y verificación de la PWA Coach/Admin
  del P0 `#941`. `#925` permanece en seguimiento. PROD intacta.
- **Linter Supabase:** el ledger tiene RLS sin políticas de lectura a propósito
  (deny-all directo), y las RPC públicas `SECURITY DEFINER` tienen controles
  explícitos de contexto, MFA y alcance; comprobar excepciones de linter
  conscientemente, no añadir políticas permisivas para silenciar advertencias.

---

# IBERFIT M44 — QA autenticada y certificación visual
Fecha: 15/10/2026 · WIP; ningún informe M44 nuevo en PROD.

## Pruebas SQL autenticadas ya completadas sobre QA
Todas ejecutadas con las cinco migraciones M44 en una misma transacción seguida de ROLLBACK. Se tomaron actor Admin y Cliente legítimos existentes en QA únicamente como contexto JWT simulado dentro de la transacción; todo contenido nuevo fue sintético.
- Admin autorizado: create private draft revision 1; canary client active and canonical confirmed execution with completedAt in session_executions.summary.
- Idempotency: same request returned already-created without duplicate; actor-scoped domain event recorded.
- Canonical command INFORME_APROBAR: status aprobado revision 2. Subsequent INFORME_PUBLICAR with previewAccepted: status publicado and public.reports redacted projection.
- Client bootstrap positive: published report visible exactly once, conclusions and next steps present; no private Coach note. Client bootstrap negative: private draft ID/body not exposed.
- Canonical INFORME_RETIRAR with reason: no withdrawn report visible in subsequent client bootstrap.
- QA TRUNCATE privileges for anon and authenticated were revoked and independently verified at 0 / 0 exposed tables.
All SQL was rolled back except the intentional QA least-privilege TRUNCATE grant revocation (already reflected as a migration WIP and implemented in PROD).

## CI integration
The M44 branch workflow runs npm run test:m44:contract and npm run quality:m44:report:a4 using Chromium in desktop, tablet and mobile viewports with synthetic data. Check actual Actions conclusion for the current SHA: this document does not claim CI passed.

## Still required before merging and PROD
- CI green at exact SHA; full regression, PWA and contextual #941 acceptance.
- Real QA token E2E, two-tab concurrency, foreign-client access and server-issued artifact.
- Issued immutable PDF with SHA-256, access-controlled storage, versioning, withdrawal and permissions. Current browser PDF preview is not an issued stored artifact.
- Migration release, canary smoke, responsive QA and PROD promotion only when gates are complete.


## Certificación editorial ampliada y ledger de emisión WIP (15/10/2026)
- GitHub Actions #38762282257: SUCCESS, contratos Node y A4 con Chromium desktop/tablet/mobile.
- #38762870948: SUCCESS tras corrección de fechas de ejecuciones (summary.completedAt tiene prioridad sobre createdAt).
- #38763396386: SUCCESS al servir fuentes Inter y Source Serif y el isotipo real.
- #38763528068: SUCCESS con 12 evidencias largas y PDF A4 completo.
- #38764044656: SUCCESS con paginación de resumen, interpretación profesional, notas privadas y próximos pasos extensos.
- #38764906476: SUCCESS, última certificación de contrato y Chromium tras introducir ledger de emisión.
- Seis migraciones M44 incluidas en transacciones de QA con ROLLBACK. Flujo real sintético de borrador→aprobado→publicado→visible cliente→retirado demostrado sin fuga de comentario privado.
- Sexta migración (20261015143500): ledger PDF privado, SHA-256 fuente/artefacto, autorización Admin/Coach y denegación Cliente para emisión, ausencia de objeto rechazada, retirada sin pérdida histórica. Validación positiva prepare y negativa de rol sin despliegue.
- Estado verificado tras los ensayos: QA y PROD, draft RPC no desplegado, PDF ledger no desplegado, tabla reports con cero filas. No declarar informe PDF emitido ni archivado.
- Falta desarrollar y certificar el renderizador de PDF emitido en Edge, subida real verificada de los bytes, finalización atómica, URLs firmadas/retirada, QA autenticada con tokens reales y suite de regresión completa. El preview de Chromium NO es archivo emitido.

## Edge PDF emisor WIP
- Broker Supabase Edge `iberfit-evolution-report-emission-v1` renderiza datos únicamente tras RPC `prepare`, verifica SHA-256 del PDF en Storage mediante descarga de lectura, finaliza como service_role y entrega URL temporal de 120 segundos. El Cliente puede abrir solo artefactos autorizados y no retirados.
- CI hermética incorpora `deno check` y prueba de PDF real sobre datos sintéticos con 12 evidencias, 13 periodos y texto extenso. Esto certifica bytes y paginación del motor, pero NO sustituye el despliegue y ensayo QA de Storage y sesión real.

## M44 PDF emitido: historial seguro e inmutabilidad (15/10/2026)
- El backend añade consulta de versiones autorizada por RPC y nunca revela rutas de Storage al navegador. QA transaccional con ROLLBACK verifica dos versiones, una retirada; Admin ve ambas, Cliente ve solo la vigente, usuario ajeno recibe denegación.
- La publicación y el PDF oficial filtran incluso claves privadas anidadas en evidencia y series temporales. QA transaccional verifica ausencia de filtración.
- El libro de emisión se hace append-only; únicamente la transición `issued -> withdrawn` puede alterar estado y auditoría, nunca hashes, propietario, versión ni instantánea. Pendiente ensayo SQL negativo antes de desplegar.
- No promocionar a QA/PROD hasta disponer de prueba Edge real de upload/download/commit/open/revoke bajo identidades distintas y gate visual del PDF emitido.

## Gate ejecutado: 8 migraciones en transacción QA con rollback
- Verificado en QA con 8 migraciones aplicadas solo dentro de transacción: el ledger no acepta modificar SHA-256, no acepta DELETE, admite una retirada auditada y no permite reactivarla. Toda la operación se revirtió mediante ROLLBACK.
- El historial versionado también se probó con actores Admin, Cliente y usuario ajeno; el Cliente no recibe razones privadas ni Storage paths.
- CI #38773189485: tres jobs SUCCESS. No despliegue Edge ni persistencia de migraciones M44 en QA/PROD. Siguiente gate: deploy QA controlado y ensayo HTTP real con usuario validado.


## Checkpoint actualizado — 15/10/2026 · M44 en QA, todavía no en PROD

- Rama de integración M44 en `435a2fef1b37b431fcc68dc8f8bd348bb73c15df`; base Canary `6010f77623b9b69c7d00f40cf9f6a6e91325675b`.
- GitHub Actions `#38790292272`: cinco trabajos SUCCESS (contratos, Chromium A4 responsive, Deno PDF real, paquete Canary y HTTP anónimo negativo).
- QA Supabase `gjztkdwfmunnzhtvxrsu`: 10 migraciones M44 persistidas, emisor Edge `iberfit-evolution-report-emission-v1` **versión 3 ACTIVE** con JWT obligatorio y PDF de procedencia firmemente vinculado a ID/revisión/SHA de fuente autorizada.
- Libro de emisión en QA: 0 filas; Storage privado de PDF emitido: 0 objetos. No declarar ciclo autenticado positivo hasta emitir bajo Auth real, verificar descarga SHA-256, roles, historial, retirada y reintentos.
- Recuperación robusta: reintento del mismo `issueRequestId` comprueba el PDF efectivamente guardado antes de finalizar; no elimina un objeto que otra ejecución concurrente podría haber oficializado.
- Calidad editorial: el PDF emitido ya no trunca arbitrariamente la evidencia a las doce primeras filas; se preserva íntegra dentro del límite de seguridad, con prueba de 20 evidencias reales en el motor (sintéticas, sin datos personales).
- PROD no modificada por M44: la tabla de ledger y la RPC de borradores aún no existen. #941 (P0) y #925 (P1) continúan abiertos según sus criterios de aceptación.
- La integración de una nueva prueba Auth completa en GitHub Actions con secretos QA gestionados fue intentada pero bloqueada por el control de seguridad de herramientas. No se introdujeron ni divulgaron secretos, ni se desplegó una puerta trasera.
- Gate pendiente: ensayo HTTP autenticado completo con cuentas QA autorizadas, validación multitab y revisión con scope, P0 PWA contextual, regresión final y promoción controlada por Canary hasta PROD.

## 15/10/2026 — MFA M44 + Edge Auth real QA (checkpoint de continuación)

- WIP rama `4ff5234e098621f09a4f1fd96a176021ddb01d46`: bloqueo de cinco RPC privilegiadas M44 a la verificación v65d de sesión activa (WebAuthn/email OTP). Se preserva Cliente propio, y cuentas Coach/Admin multirrol.
- Migración QA persistida `m44_privileged_assurance_fence_v1`; funciones internas ya no tienen EXECUTE para `anon` ni `authenticated`. No alterar identidad, RLS global ni producción.
- Edge QA `iberfit-evolution-report-emission-v1` v8 ACTIVE; corrige `client.rpc.bind(client)` para no perder el receptor Supabase en el broker y conserva `verify_jwt=true`.
- Certificación CI hospedada `#38795988060`: PASS 6/6, incluido el gate nuevo de **tres sesiones autenticadas reales** y **seis denegaciones** por MFA / alcance / acceso interno; sin escrituras, service_role ni PROD.
- La certificación positiva de **publicar+emitir PDF+descargar SHA-256+Cliente/Coach/Admin+retirar y versionar** con una sesión MFA verdaderamente verificada **no existe todavía**. No confundir 6 denegaciones con emisión positiva.
- El broker QA de WebAuthn usa OIDC con referencias de workflow fijadas a Canary y no puede invocarse desde esta rama WIP sin debilitar su lista de confianza. Mantener esa restricción; certificar WebAuthn positivo durante el gate autorizado en Canary con fixture sintético.
- Storage firmado: la retirada bloquea la generación de URLs nuevas, pero una URL previamente emitida puede seguir vigente durante su expiración (actualmente 120 segundos). La retirada no invalida mágicamente los enlaces anteriores. Exigir contrato explícito de ventana residual o rediseñar la descarga para revocación inmediata antes de PROD.
- P0 #941 requiere aceptación contextual de PWA Coach/Admin; P1 #925 sigue abierto conforme a sus criterios. M44 NO está en PROD.
