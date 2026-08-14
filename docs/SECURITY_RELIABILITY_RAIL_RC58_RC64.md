# IBERFIT M26 — Security & Reliability Rail RC58–RC64

## Propósito

SECURITY_RELIABILITY_RAIL=ACTIVE
SECURITY_BASELINE=OWASP_ASVS_5_0_0_PLUS_MOBILE_MASVS_MASTG
ZERO_TRUST_CLIENT_INPUT=TRUE
CROSS_CLIENT_DISCLOSURE_RELEASE_BLOCKER=TRUE

No existe una aplicación “imposible de hackear”. El objetivo de IBERFIT es reducir superficie de ataque, aplicar mínimo privilegio, detectar abuso, contener impacto y recuperar servicio sin pérdida o mezcla de datos.

La seguridad y fiabilidad no son un RC final. Son gates obligatorios de cada RC.

## Invariantes

- Ningún cliente puede leer o modificar datos de otro cliente.
- Coach solo accede al scope autorizado.
- Admin conserva únicamente la visión organizacional explícitamente autorizada.
- Service-role, secretos, credenciales privadas y tokens privilegiados nunca llegan al frontend.
- RLS es la frontera de autorización de datos expuestos por Supabase, no solo la UI.
- Datos de dispositivos, archivos, URLs, bridge messages y payloads se tratan como entrada no confiable.
- Datos sanitarios no se escriben en logs de diagnóstico salvo necesidad explícita y diseño de privacidad aprobado.
- Notas privadas de Coach permanecen fuera del almacenamiento offline.
- Ausencia de autorización nunca se interpreta como autorización implícita.
- Una degradación de proveedor o conexión no debe corromper una sesión.
- Toda mutación crítica debe ser idempotente o tener protección equivalente contra repetición.
- Producción requiere rollback verificable.

## SR0 — Threat model y security inventory

Antes de ampliar superficie con RC58/59:

- inventario de activos: identidad, clientes, planes, sesiones, salud, wearables, pagos futuros, media y Admin;
- trust boundaries: navegador/PWA, Android, Wear, BLE, Supabase, almacenamiento, CI, terceros;
- actores: Cliente, Coach, Admin, servicio interno, atacante anónimo, cuenta comprometida;
- flujos de datos y clasificación;
- abuso: IDOR/cross-client, elevación de rol, XSS, bridge abuse, replay, token theft, secret leakage, malformed telemetry, dependency compromise;
- matriz impacto/probabilidad;
- controles y test propietario por riesgo.

## SR1 — Identity, authorization y tenant isolation

- RLS habilitado en toda tabla expuesta.
- Policies explícitas por rol y operación.
- `auth.uid()`/claims confiables; nunca `user_metadata` controlable por usuario para autorización.
- `WITH CHECK` en inserciones/updates cuando corresponda.
- Views expuestas revisadas para no saltarse RLS.
- Funciones `security definer` mínimas, auditadas y fuera de schemas expuestos.
- Tests negativos Cliente A → Cliente B.
- Tests negativos Coach → cliente no asignado.
- Admin read-model separado de la restricción Coach.
- Revocación de sesiones y roles propagada correctamente.
- Rate limiting y anti-abuse en endpoints sensibles.

## SR2 — Web, CSP y browser boundary

La política actual de CSP es buen punto de partida y debe permanecer strict-by-default.

Gates:
- `default-src 'self'`;
- `object-src 'none'`;
- `base-uri 'none'`;
- `frame-ancestors 'none'`;
- no `unsafe-inline`/`unsafe-eval` salvo excepción temporal formal;
- allowlist mínima de `connect-src`, `img-src`, `frame-src`;
- CSP actualizada conscientemente cuando se añadan librerías/servicios;
- sanitización/encoding contextual;
- no HTML generado desde datos no confiables sin escape;
- protección contra open redirects;
- archivos subidos validados por tipo, tamaño y propósito;
- secretos fuera del bundle;
- headers HSTS, nosniff, referrer y permissions policy mantenidos.

## SR3 — Native/mobile boundary

Android/Wear se evalúan con OWASP MASVS/MASTG además de ASVS.

Si la app incorpora WebView:
- solo origins controlados;
- scheme + host + path validados;
- file/content access desactivado salvo necesidad demostrada;
- cleartext traffic desactivado;
- Safe Browsing cuando aplique;
- evitar bridges legacy genéricos;
- preferir mensajería origin-scoped;
- bridge con acciones estrechas, schema validation y allowlist;
- ninguna capacidad nativa privilegiada expuesta a contenido arbitrario.

Deep links/intents:
- destinos allowlisted;
- parámetros validados;
- componentes exportados solo cuando sea necesario;
- permisos Android mínimos.

Almacenamiento:
- no tokens privilegiados ni health payloads sensibles en storage accesible innecesariamente;
- preferencias de dispositivo no deben convertirse en identidad/autorización.

## SR4 — Device/telemetry ingestion

Todo sensor es entrada no confiable.

- límites de tamaño/frecuencia;
- validación de protocolo;
- timestamps y orden temporal;
- stale/replay guards;
- provenance;
- quality;
- session/execution correlation;
- inputs malformados no crashean la sesión;
- outliers válidos se preservan con calidad, no se falsifican;
- RR intervals y campos opcionales se procesan con límites;
- desconexión/failover no duplica muestras ni eventos;
- retos nunca leen directamente streams sin pasar por métricas canónicas.

## SR5 — Data privacy & governance

Cada dato nuevo debe registrar:

- finalidad de servicio;
- base de consentimiento/autorización aplicable;
- quién puede verlo;
- procedencia;
- calidad;
- retention;
- export;
- delete;
- auditability.

Reglas:
- minimización;
- no recopilar por curiosidad técnica;
- health data separada de gamificación pública;
- leaderboards no muestran health data cruda;
- logs y analytics con minimización;
- datos QA sintéticos siempre que sea posible;
- backups protegidos y con retención definida.

## SR6 — Supply chain & CI

Estado objetivo:
- lockfiles obligatorios;
- dependencias revisadas y mínimas;
- actualización automatizada de dependencias cuando la plataforma/coste lo permita;
- análisis de dependencias vulnerables;
- secret scanning;
- SAST/CodeQL o alternativa equivalente según disponibilidad/licencia;
- actions de CI con permisos mínimos;
- acciones de terceros pinneadas de forma más estricta cuando corresponda;
- artefactos reproducibles/hashables;
- SBOM para release cuando madure el pipeline;
- ninguna dependencia nueva solo por estética si duplica capacidad existente.

Los gates de seguridad no dependen exclusivamente de servicios de pago.

## SR7 — Reliability engineering

- retries con backoff y límites;
- timeouts explícitos;
- idempotency keys o equivalente;
- operaciones cancelables;
- offline queue con ownership correcto;
- detección de conflictos;
- crash recovery;
- migrations reversibles;
- backup/restore probado;
- health checks;
- degradación por capability;
- observabilidad sin filtrar datos sensibles;
- error budgets definidos antes de producción estable.

## SR8 — Security verification

Cada fase eleva el nivel de prueba.

Mínimo:
- auth bypass;
- IDOR/cross-client;
- RLS negative tests;
- XSS/injection;
- CSP regression;
- malicious file inputs;
- malformed JSON;
- oversized payloads;
- replay/stale commands;
- bridge message fuzzing;
- BLE parser fuzzing;
- permission revocation;
- offline/online race;
- dependency audit;
- secrets audit.

RC64 industrializa estas pruebas, pero no las inaugura.

## SR9 — Incident response

Antes de producción estable debe existir runbook para:

- revocar sesiones;
- rotar secretos;
- bloquear un proveedor;
- desactivar una feature;
- retirar una versión;
- restaurar backup;
- identificar clientes potencialmente afectados;
- preservar evidencia;
- comunicar sin exponer datos;
- postmortem y prevención de recurrencia.

## Integración con roadmap

RC58:
- tokens/components no pueden degradar CSP/accesibilidad;
- librerías nuevas pasan supply-chain review.

RC59:
- threat model de health/telemetry;
- consentimiento/provenance;
- autorización y retention;
- challenge privacy.

RC60:
- bulk actions y productividad requieren autorización server-side y confirmaciones seguras.

RC61:
- motion no puede esconder estados de error/foco ni degradar reduced motion.

RC62:
- agenda/onboarding/deep links revisan permisos, roles y exposición de eventos.

RC63:
- media/upload pipeline valida origen, tipos, tamaño, metadata y permisos.

RC64:
- automatiza ASVS/MASVS-inspired gates, regresión, accessibility, performance y security checks.

## Gate inicial

NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY