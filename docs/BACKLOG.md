# IBERFIT · Backlog Vivo

Checkpoint: 2026-09-17
Producción LIVE verificada: `1eabb642634ade1fec74b0d3b32d703e7d314eff`
Promotion run LIVE: `35259458571 = SUCCESS`
Canary actual: `b23688196e49f6dc26d2762ef592e80ab1b8ed80`
Último merge funcional: PR #477 · reintento seguro de invitaciones Admin.

## WIP ACTIVO · 2026-10-02

PR #672 — IRI inicial + fotogrametría privada v1.
- [x] Baseline IRI inicial único y contrato de privacidad/fotogrametría base en rama.
- [x] Consentimientos auditables y storage privado base.
- [x] Motor geométrico puro + tests iniciales.
- [ ] UI captura 4 vistas + editor manual.
- [ ] 1MSTS como protocolo separado.
- [ ] Desacoplar evolución/reevaluación de `iri_assessments`.
- [ ] Reporte IRI baseline-only; fotos fuera por defecto.
- [ ] QA + CI del SHA final.
- [ ] Canary live.
- [ ] PROD + verificación live.

Canary base comprobado al iniciar el WIP: `2bc5f7b01c4fac656a4c78e6235beaf0067cca0a`.
No abrir otro WIP de producto hasta cerrar o bloquear realmente #672.

### Evidencia PubMed revisada durante #672 · pendiente de decisión de producto

No convertir estos candidatos en requisitos ni baremos sin decisión explícita y protocolo/versionado exactos.

- **Capacidad de esfuerzo**
  - 1MSTS: revisión sistemática de propiedades clinimétricas, PMID `30489442`; referencias chilenas 18–80 años, PMID `39879255`.
  - YMCA 3-Min Step: mantener como protocolo distinto cuando se ejecute exactamente; revisión de tests de campo en adultos PMID `34442050`; estudio de validez en adultos jóvenes PMID `32328445`.
  - 6-Minute Walk Test: candidato opcional cuando exista espacio; validez de campo en adultos PMID `29851229` / `40148739`; referencias chilenas 20–80 años PMID `21249280`.
  - Chester Step Test: candidato de seguimiento aeróbico; revisión de step tests PMID `26670455`, pero la estimación de VO2 requiere cautela y práctica/familiarización.
- **Movilidad**
  - Weight-Bearing Lunge: mantener; revisión sistemática de fiabilidad/MDC PMID `25704110`.
  - Back-Saver / sit-and-reach: revisar sustitución; la revisión de validez en adultos PMID `34442050` no lo respalda como medida válida conjunta de isquios + región lumbar.
  - Active Knee Extension o Straight-Leg Raise: candidatos para isquios; excelente fiabilidad en adultos con déficit de flexibilidad, PMID `25364856`.
  - Thomas modificado: mantener sólo con control pélvico estandarizado; sin ese control presenta mala validez, PMID `27602291`.
  - Rotación de cadera: considerar medición cuantitativa estandarizada en lugar de observación cualitativa; la posición no debe intercambiarse entre seguimientos (PMID `29364046`).
- **Fuerza / función**
  - 30-s Chair Stand: mantener; referencias chilenas 18–80 años PMID `40526861`.
  - Handgrip: candidato opcional si se dispone de dinamómetro; revisión de propiedades de medida PMID `31730754`.
  - Biering–Sørensen: mantener opcional con equipo compatible; meta-análisis de fiabilidad PMID `32365490`.
  - Prone bridge/plancha: útil como resistencia del tronco, no como diagnóstico de «estabilidad»; PMID `29861239` / `28544083`.
- **Balance / control neuromuscular**
  - SEBT/Y-Balance: candidato opcional si aporta una decisión real; revisión de fiabilidad PMID `31598406` y meta-análisis PMID `34631241`.
  - No usar FMS como predictor individual de lesión: revisión/meta-análisis PMID `26502447`.

Estado: **evidencia recopilada, sin incorporación de nuevos tests al producto**. Primero decidir qué dominios justifican el tiempo de evaluación y qué resultado cambia realmente una decisión del Coach.

## P0 · guardrails permanentes

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad y disponibilidad.
- [ ] Nunca hacer pruebas destructivas con usuarios/datos reales.
- [ ] Ante P0 LIVE: hotfix mínimo desde identidad LIVE exacta.
- [x] P0 focus/input/select corregido y protegido por matrices autenticadas, Admin y Device.
- [x] Reentrada background/online refresca sesión sin rehidratar ni perder foco.
- [x] Refresh token revocado termina sesión sin bucles de reintento; red/timeout permanece recuperable.

## P1 · release / Auth

- [x] Recuperar proyecto Cloudflare productivo exacto y rollback.
- [x] Mantener promoción por SHA exacto y fail-closed.
- [x] Corregir `site_url` PROD a `https://app.iberfit.cl/`.
- [x] Cerrar signup público y elevar mínimo de contraseña a 8.
- [x] Añadir contrato de Auth Hosted readiness.
- [x] Evitar interferencia/cancelación entre suites QA autenticadas compartidas.
- [x] SMTP transaccional Resend operativo con SPF/DKIM/DMARC.
- [x] 13 plantillas Hosted Auth sincronizadas y verificadas.
- [x] OTP email real + recovery real certificados.
- [x] Reauthentication de cambio de contraseña activa.
- [x] Logout normal local por dispositivo; revocación global explícita y confirmada.
- [x] WebAuthn QA alineado con PROD y recertificado.
- [x] OTP resend conserva la pantalla; expiry/replay/rate-limit/mala conexión diferenciados y protegidos.
- [x] Edge de invitación QA/PROD convergida a una fuente canónica sensible al proyecto.
- [x] QA invite Edge valida bearer internamente y rechaza Coach / token inválido en red.
- [x] Admin puede reintentar invitaciones fallidas sin recrear cliente ni duplicar identidad.
- [ ] Certificar E2E positivo real de invitación/reenvío con una cuenta Admin QA autenticada y assurance privilegiada.
- [ ] Recertificar el lote Auth completo inmediatamente antes de próxima promoción PROD.

## P1 · gobernanza

- [ ] Proteger `canary/rc74-4` con PR + required checks. El conector GitHub disponible no expone branch-protection/rulesets; sigue pendiente de configuración del repositorio.
- [x] Mantener documentación STATE/BACKLOG alineada con SHA real.
- [ ] Retirar/rehacer PRs abiertos obsoletos con base antigua antes de reutilizarlos.

## P1 · experiencia por dispositivo / rol

- [x] Cliente QA real desktop/tablet/móvil.
- [x] Coach autenticado + WebAuthn representativo en Device Gate.
- [x] Admin sintético y PWA/update matrix certificados.
- [x] Focus/input/select P0 corregido.
- [x] Acciones Coach de un paso portadas sobre Canary certificado.
- [ ] Admin autenticado QA real desktop/tablet/móvil.
- [ ] Modal, scroll largo, teclado virtual/focus, error recovery y sesión live por dispositivo con Admin real.
- [ ] Recertificar alta/edición/baja controlada de Cliente y Coach con identidad Admin QA real y sin freezes.

## P1 · producto / entrenamiento

- [ ] **Preparar próxima sesión**: IRI inicial separado de evolución + plan + última carga + feedback + dolor/recuperación + adherencia + pendientes; Coach confirma.
- [ ] **Action Outcome Tracking**: señal, decisión Coach, intervención y outcome.
- [ ] **Seguimiento longitudinal**: progreso y reevaluaciones sin mezclar con el Diagnóstico IRI inicial.
- [ ] Sesión Coach ultrarrápida: ejercicios, variantes, series, repeticiones, carga, descanso, alternativas, biseries/triseries/circuitos/AMRAP/Tabata y feedback.
- [ ] **Reactivación asistida** ante caída de adherencia.
- [ ] **Hoy contextual** con una próxima acción útil para Cliente.
- [ ] Integrar/rehacer sobre Canary actual la mejora de ventanas 4/8/12/Todo de evolución por ejercicio; PR #444 está obsoleto y no es mergeable.

## P1 · seguridad / backend

- [x] Revisados los 2 SECURITY DEFINER ejecutables por anon: catálogo/media públicos, lectura acotada y deliberada.
- [x] Revisados RPC Admin críticos: privileged assurance + rol + organización + scope antes de mutar.
- [ ] Completar auditoría por intención de todos los SECURITY DEFINER ejecutables por authenticated y documentar la decisión grant/revoke.
- [ ] Revisar tablas RLS sin policy y documentar cuáles son deliberadamente inaccesibles por Data API.
- [ ] Evaluar índices de FKs sólo contra consultas reales/EXPLAIN; no añadirlos masivamente.
- [ ] Leaked password protection: disponible sólo con plan Supabase compatible; decidir upgrade por seguridad/operación.

## P1 · negocio / escalabilidad

- [ ] Funnel lead -> conversación -> IRI -> cliente -> plan -> primera sesión -> 30/90/180.
- [ ] Instrumentar reactivación, referral y revenue.
- [ ] Medir minutos Coach/cliente/semana.
- [ ] Medir clientes activos/Coach, ocupación, capacidad y margen/hora por modalidad.
- [ ] Cohortes de adherencia/retención y outcome de intervenciones.

## P2 · UX / visual / rendimiento

- [ ] Unificar “requiere atención / siguiente acción” entre Cliente, Coach y Admin.
- [ ] Progreso longitudinal con más jerarquía que tarjetas aisladas.
- [ ] Menos contenedores; más espacio y tipografía sin perder densidad útil.
- [ ] Empty states siempre accionables.
- [ ] Gráficas responsive semánticas: móvil resume, desktop explora.
- [ ] Core Web Vitals / presupuesto por dispositivo.
- [ ] Auditoría manual de contraste, focus, teclado, lector y touch targets.
- [ ] Medir arranque, auth bootstrap y navegación.
- [ ] Mantener observabilidad sin exposición de datos.

## Siguientes 5 acciones

1. Admin QA real autenticado desktop/tablet/móvil + E2E positivo de invitación/reenvío.
2. Alta/edición/baja controlada de Cliente/Coach y sesión Coach real sin freezes.
3. Cerrar seguridad/backend restante por intención y EXPLAIN, sin cambios masivos.
4. Outcome tracking + preparar próxima sesión + seguimiento longitudinal.
5. Recertificar lote completo y promover Canary a PROD sólo con rollback, Auth readiness, smoke y auditoría post-deploy.
