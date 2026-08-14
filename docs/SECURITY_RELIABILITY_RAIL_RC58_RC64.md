# IBERFIT M26 â€” Security & Reliability Rail RC58â€“RC64

## PropÃ³sito

SECURITY_RELIABILITY_RAIL=ACTIVE
SECURITY_BASELINE=OWASP_ASVS_5_0_0_PLUS_MOBILE_MASVS_MASTG
ZERO_TRUST_CLIENT_INPUT=TRUE
CROSS_CLIENT_DISCLOSURE_RELEASE_BLOCKER=TRUE

No existe una aplicaciÃ³n â€œimposible de hackearâ€. El objetivo de IBERFIT es reducir superficie de ataque, aplicar mÃ­nimo privilegio, detectar abuso, contener impacto y recuperar servicio sin pÃ©rdida o mezcla de datos.

La seguridad y fiabilidad no son un RC final. Son gates obligatorios de cada RC.

## Invariantes

- NingÃºn cliente puede leer o modificar datos de otro cliente.
- Coach solo accede al scope autorizado.
- Admin conserva Ãºnicamente la visiÃ³n organizacional explÃ­citamente autorizada.
- Service-role, secretos, credenciales privadas y tokens privilegiados nunca llegan al frontend.
- RLS es la frontera de autorizaciÃ³n de datos expuestos por Supabase, no solo la UI.
- Datos de dispositivos, archivos, URLs, bridge messages y payloads se tratan como entrada no confiable.
- Datos sanitarios no se escriben en logs de diagnÃ³stico salvo necesidad explÃ­cita y diseÃ±o de privacidad aprobado.
- Notas privadas de Coach permanecen fuera del almacenamiento offline.
- Ausencia de autorizaciÃ³n nunca se interpreta como autorizaciÃ³n implÃ­cita.
- Una degradaciÃ³n de proveedor o conexiÃ³n no debe corromper una sesiÃ³n.
- Toda mutaciÃ³n crÃ­tica debe ser idempotente o tener protecciÃ³n equivalente contra repeticiÃ³n.
- ProducciÃ³n requiere rollback verificable.

## SR0 â€” Threat model y security inventory

Antes de ampliar superficie con RC58/59:

- inventario de activos: identidad, clientes, planes, sesiones, salud, wearables, pagos futuros, media y Admin;
- trust boundaries: navegador/PWA, Android, Wear, BLE, Supabase, almacenamiento, CI, terceros;
- actores: Cliente, Coach, Admin, servicio interno, atacante anÃ³nimo, cuenta comprometida;
- flujos de datos y clasificaciÃ³n;
- abuso: IDOR/cross-client, elevaciÃ³n de rol, XSS, bridge abuse, replay, token theft, secret leakage, malformed telemetry, dependency compromise;
- matriz impacto/probabilidad;
- controles y test propietario por riesgo.

## SR1 â€” Identity, authorization y tenant isolation

- RLS habilitado en toda tabla expuesta.
- Policies explÃ­citas por rol y operaciÃ³n.
- `auth.uid()`/claims confiables; nunca `user_metadata` controlable por usuario para autorizaciÃ³n.
- `WITH CHECK` en inserciones/updates cuando corresponda.
- Views expuestas revisadas para no saltarse RLS.
- Funciones `security definer` mÃ­nimas, auditadas y fuera de schemas expuestos.
- Tests negativos Cliente A â†’ Cliente B.
- Tests negativos Coach â†’ cliente no asignado.
- Admin read-model separado de la restricciÃ³n Coach.
- RevocaciÃ³n de sesiones y roles propagada correctamente.
- Rate limiting y anti-abuse en endpoints sensibles.

## SR2 â€” Web, CSP y browser boundary

La polÃ­tica actual de CSP es buen punto de partida y debe permanecer strict-by-default.

Gates:
- `default-src 'self'`;
- `object-src 'none'`;
- `base-uri 'none'`;
- `frame-ancestors 'none'`;
- no `unsafe-inline`/`unsafe-eval` salvo excepciÃ³n temporal formal;
- allowlist mÃ­nima de `connect-src`, `img-src`, `frame-src`;
- CSP actualizada conscientemente cuando se aÃ±adan librerÃ­as/servicios;
- sanitizaciÃ³n/encoding contextual;
- no HTML generado desde datos no confiables sin escape;
- protecciÃ³n contra open redirects;
- archivos subidos validados por tipo, tamaÃ±o y propÃ³sito;
- secretos fuera del bundle;
- headers HSTS, nosniff, referrer y permissions policy mantenidos.

## SR3 â€” Native/mobile boundary

Android/Wear se evalÃºan con OWASP MASVS/MASTG ademÃ¡s de ASVS.

Si la app incorpora WebView:
- solo origins controlados;
- scheme + host + path validados;
- file/content access desactivado salvo necesidad demostrada;
- cleartext traffic desactivado;
- Safe Browsing cuando aplique;
- evitar bridges legacy genÃ©ricos;
- preferir mensajerÃ­a origin-scoped;
- bridge con acciones estrechas, schema validation y allowlist;
- ninguna capacidad nativa privilegiada expuesta a contenido arbitrario.

Deep links/intents:
- destinos allowlisted;
- parÃ¡metros validados;
- componentes exportados solo cuando sea necesario;
- permisos Android mÃ­nimos.

Almacenamiento:
- no tokens privilegiados ni health payloads sensibles en storage accesible innecesariamente;
- preferencias de dispositivo no deben convertirse en identidad/autorizaciÃ³n.

## SR4 â€” Device/telemetry ingestion

Todo sensor es entrada no confiable.

- lÃ­mites de tamaÃ±o/frecuencia;
- validaciÃ³n de protocolo;
- timestamps y orden temporal;
- stale/replay guards;
- provenance;
- quality;
- session/execution correlation;
- inputs malformados no crashean la sesiÃ³n;
- outliers vÃ¡lidos se preservan con calidad, no se falsifican;
- RR intervals y campos opcionales se procesan con lÃ­mites;
- desconexiÃ³n/failover no duplica muestras ni eventos;
- retos nunca leen directamente streams sin pasar por mÃ©tricas canÃ³nicas.

## SR5 â€” Data privacy & governance

Cada dato nuevo debe registrar:

- finalidad de servicio;
- base de consentimiento/autorizaciÃ³n aplicable;
- quiÃ©n puede verlo;
- procedencia;
- calidad;
- retention;
- export;
- delete;
- auditability.

Reglas:
- minimizaciÃ³n;
- no recopilar por curiosidad tÃ©cnica;
- health data separada de gamificaciÃ³n pÃºblica;
- leaderboards no muestran health data cruda;
- logs y analytics con minimizaciÃ³n;
- datos QA sintÃ©ticos siempre que sea posible;
- backups protegidos y con retenciÃ³n definida.

## SR6 â€” Supply chain & CI

Estado objetivo:
- lockfiles obligatorios;
- dependencias revisadas y mÃ­nimas;
- actualizaciÃ³n automatizada de dependencias cuando la plataforma/coste lo permita;
- anÃ¡lisis de dependencias vulnerables;
- secret scanning;
- SAST/CodeQL o alternativa equivalente segÃºn disponibilidad/licencia;
- actions de CI con permisos mÃ­nimos;
- acciones de terceros pinneadas de forma mÃ¡s estricta cuando corresponda;
- artefactos reproducibles/hashables;
- SBOM para release cuando madure el pipeline;
- ninguna dependencia nueva solo por estÃ©tica si duplica capacidad existente.

Los gates de seguridad no dependen exclusivamente de servicios de pago.

## SR7 â€” Reliability engineering

- retries con backoff y lÃ­mites;
- timeouts explÃ­citos;
- idempotency keys o equivalente;
- operaciones cancelables;
- offline queue con ownership correcto;
- detecciÃ³n de conflictos;
- crash recovery;
- migrations reversibles;
- backup/restore probado;
- health checks;
- degradaciÃ³n por capability;
- observabilidad sin filtrar datos sensibles;
- error budgets definidos antes de producciÃ³n estable.

## SR8 â€” Security verification

Cada fase eleva el nivel de prueba.

MÃ­nimo:
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

## SR9 â€” Incident response

Antes de producciÃ³n estable debe existir runbook para:

- revocar sesiones;
- rotar secretos;
- bloquear un proveedor;
- desactivar una feature;
- retirar una versiÃ³n;
- restaurar backup;
- identificar clientes potencialmente afectados;
- preservar evidencia;
- comunicar sin exponer datos;
- postmortem y prevenciÃ³n de recurrencia.

## IntegraciÃ³n con roadmap

RC58:
- tokens/components no pueden degradar CSP/accesibilidad;
- librerÃ­as nuevas pasan supply-chain review.

RC59:
- threat model de health/telemetry;
- consentimiento/provenance;
- autorizaciÃ³n y retention;
- challenge privacy.

RC60:
- bulk actions y productividad requieren autorizaciÃ³n server-side y confirmaciones seguras.

RC61:
- motion no puede esconder estados de error/foco ni degradar reduced motion.

RC62:
- agenda/onboarding/deep links revisan permisos, roles y exposiciÃ³n de eventos.

RC63:
- media/upload pipeline valida origen, tipos, tamaÃ±o, metadata y permisos.

RC64:
- automatiza ASVS/MASVS-inspired gates, regresiÃ³n, accessibility, performance y security checks.

## Gate inicial

NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY