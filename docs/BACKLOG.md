# IBERFIT · Backlog Vivo

Checkpoint: 2026-09-17
Producción source SHA: `1eabb642634ade1fec74b0d3b32d703e7d314eff`
Promotion run válido: `35259458571 = SUCCESS`
Release branch: `release/prod-1eabb642634a`
Canary funcional actual: `223a58a7de23888ea3c90256331f52161e68b208`

## P0 · guardrails permanentes

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad y disponibilidad.
- [ ] Nunca hacer pruebas destructivas con usuarios/datos reales.
- [ ] Ante P0 LIVE: hotfix mínimo desde identidad LIVE exacta.
- [x] Service Worker canónico ligado al SHA exacto de release y verificado fail-closed.
- [x] Regresión PWA instalada N-1 -> N para impedir `shell-controller.js` stale.
- [x] Eliminar autorrepair temporizado destructivo de unregister/cache-delete/reload.

## P1 · release / Auth

- [x] Recuperar proyecto Cloudflare productivo exacto y rollback.
- [x] Mantener promoción por SHA exacto y fail-closed.
- [x] Corregir `site_url` PROD a `https://app.iberfit.cl/`.
- [x] Cerrar signup público y elevar mínimo de contraseña a 8.
- [x] Añadir contrato de Auth Hosted readiness.
- [x] Evitar interferencia/cancelación entre suites QA autenticadas compartidas.
- [x] Crear proveedor SMTP transaccional para Auth.
- [x] Verificar dominio/subdominio de envío con SPF/DKIM/DMARC.
- [x] Cargar los 6 secretos SMTP operativos sin exponerlos.
- [x] Configurar SMTP PROD con rollback fail-closed.
- [x] Sincronizar y validar las 13 plantillas Hosted Auth.
- [ ] E2E real completo: OTP y recovery verificados; quedan invite, resend, expiry, replay y mala conexión.
- [x] Activar reauthentication de cambio de contraseña tras certificar SMTP, OTP, recovery y DMARC.
- [x] Promover hotfix LIVE SUPPORT PWA con identidad exacta y verificación post-deploy.

## P1 · gobernanza

- [x] Proteger `canary/rc74-4` con PR + required check: ruleset activo `Protect Canary` (`23254113`), sin bypass actors, bloqueo de deletion/non-fast-forward y status `validate` requerido.
- [x] Actualizar STATE/BACKLOG al LIVE y Canary reales del 17/09.
- [ ] Mantener STATE/BACKLOG/RELEASE alineados después de cada promoción o cambio de baseline.
- [x] Cerrar la solución PWA alternativa/superseded del PR #459 para mantener una sola arquitectura oficial.
- [ ] Revisar si conviene ampliar required checks más allá de `validate` cuando nombres y duración de los gates estén estabilizados.

## P1 · experiencia por dispositivo / rol

- [x] Cliente QA real desktop/tablet/móvil en los gates autenticados disponibles.
- [x] Coach fail-closed + Device Gate certificado en el lote actual.
- [x] Admin sintético y PWA/update matrix certificados.
- [x] Focus/input/select P0 corregido en lógica del shell.
- [x] Entrega del arreglo de foco protegida frente a runtime PWA stale.
- [x] Acciones Coach de un paso portadas sobre Canary certificado.
- [ ] Confirmación puntual en un dispositivo previamente afectado por el síntoma «solo funciona mientras mantengo pulsado».
- [ ] Admin autenticado real desktop/tablet/móvil.
- [ ] Coach post-WebAuthn representativo en las cuatro clases.
- [ ] Modal, scroll largo, teclado virtual/focus, error recovery y sesión live por dispositivo.
- [ ] Recertificar alta/edición/baja controlada de Cliente y Coach sin freezes.

## P1 · producto / entrenamiento

- [ ] **Preparar próxima sesión**: IRI inicial separado de evolución + plan + última carga + feedback + dolor/recuperación + adherencia + pendientes; Coach confirma.
- [ ] **Action Outcome Tracking**: señal, decisión Coach, intervención y outcome.
- [ ] **Seguimiento longitudinal**: progreso y reevaluaciones sin mezclar con el Diagnóstico IRI inicial.
- [ ] Sesión Coach ultrarrápida: ejercicios, variantes, series, repeticiones, carga, descanso, alternativas, biseries/triseries/circuitos/AMRAP/Tabata y feedback.
- [ ] **Reactivación asistida** ante caída de adherencia.
- [ ] **Hoy contextual** con una próxima acción útil para Cliente.
- [ ] Consolidar evolución por ejercicio/Coach: ventanas coherentes, comparativas y lectura accionable, sin dashboards decorativos.

## P1 · seguridad / backend

- [ ] Auditar por intención los 2 SECURITY DEFINER ejecutables por anon y los RPC privilegiados ejecutables por authenticated; confirmar checks internos antes de tocar grants.
- [ ] Revisar las tablas RLS sin policy y documentar cuáles son deliberadamente inaccesibles por Data API.
- [ ] Evaluar índices de FKs sólo contra consultas reales/EXPLAIN; no añadir 51 índices automáticamente.
- [ ] Leaked password protection: disponible sólo en plan Supabase Pro; decidir upgrade por seguridad/operación, no activable en Free.

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
- [ ] Paralelizar/shardear la matriz Admin cross-browser sin eliminar proyectos ni garantías.

## Siguientes 5 acciones

1. Admin/Coach authenticated device completion + CRUD/sesión Coach real sin freezes.
2. Confirmación puntual del fix de foco en un dispositivo históricamente afectado.
3. Edge cases Auth restantes: invite, resend, expiry/replay y mala conexión.
4. Preparar próxima sesión + seguimiento longitudinal + Action Outcome Tracking.
5. Acelerar CI cross-browser manteniendo la cobertura íntegra y evaluar required checks adicionales sin crear bloqueos redundantes.
