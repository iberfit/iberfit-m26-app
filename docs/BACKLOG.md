# IBERFIT · Backlog Vivo

Checkpoint: 2026-09-17
Producción LIVE verificada: `1eabb642634ade1fec74b0d3b32d703e7d314eff`
Promotion run LIVE: `35259458571 = SUCCESS`
Canary actual: `b23688196e49f6dc26d2762ef592e80ab1b8ed80`
Último merge funcional: PR #477 · reintento seguro de invitaciones Admin.

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
