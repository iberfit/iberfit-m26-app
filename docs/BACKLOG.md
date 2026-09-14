# IBERFIT · Backlog Vivo

Checkpoint: 2026-09-14
Producción source SHA: `396ad52cfd4c1a4d75e4e306838d85bffa77b105`
Promotion run válido: `34793087805 = SUCCESS`
Canary funcional certificado: `39e160fb54d1e866823a8150ecd9270359129444`

## P0 · guardrails permanentes

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad y disponibilidad.
- [ ] Nunca hacer pruebas destructivas con usuarios/datos reales.
- [ ] Ante P0 LIVE: hotfix mínimo desde identidad LIVE exacta.

## P1 · release / Auth

- [x] Recuperar proyecto Cloudflare productivo exacto y rollback.
- [x] Mantener promoción por SHA exacto y fail-closed.
- [x] Corregir `site_url` PROD a `https://app.iberfit.cl/`.
- [x] Cerrar signup público y elevar mínimo de contraseña a 8.
- [x] Añadir contrato de Auth Hosted readiness.
- [x] Evitar interferencia/cancelación entre suites QA autenticadas compartidas.
- [ ] Crear proveedor SMTP transaccional para Auth.
- [ ] Verificar dominio/subdominio de envío con SPF/DKIM/DMARC.
- [ ] Cargar los 6 secretos SMTP operativos sin exponerlos.
- [ ] Configurar SMTP PROD con rollback fail-closed.
- [ ] Sincronizar y validar las 13 plantillas Hosted Auth.
- [ ] E2E real: OTP nuevo dispositivo, recovery, invite, resend, expiry, replay y mala conexión.
- [ ] Activar reauthentication de cambio de contraseña después del E2E de correo.
- [ ] Promover el siguiente lote sólo con Auth readiness GREEN.

## P1 · gobernanza

- [ ] Proteger `canary/rc74-4` con PR + required checks.
- [ ] Mantener documentación STATE/BACKLOG/RELEASE alineada con SHA real.

## P1 · experiencia por dispositivo / rol

- [x] Cliente QA real desktop/tablet/móvil.
- [x] Coach fail-closed + Device Gate certificado en el lote actual.
- [x] Admin sintético y PWA/update matrix certificados.
- [x] Focus/input/select P0 corregido.
- [x] Acciones Coach de un paso portadas sobre Canary certificado.
- [ ] Admin autenticado QA real desktop/tablet/móvil.
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

## Siguientes 5 acciones

1. SMTP Auth + DNS + E2E real.
2. Protección de Canary.
3. Admin/Coach authenticated device completion.
4. Sesión Coach y CRUD diario sin freezes.
5. Outcome tracking + funnel/capacidad/revenue.
