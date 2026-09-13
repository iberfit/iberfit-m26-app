# IBERFIT · Backlog Vivo

Checkpoint: 2026-09-13
Producción source SHA: `6d06d033fe09b6802bef21e0f30374b48c78edda`
Promotion run: `34776097179 = SUCCESS`

## P0 · guardrails permanentes

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad y disponibilidad.
- [ ] Nunca hacer pruebas destructivas con usuarios/datos reales.
- [ ] Ante P0 LIVE: hotfix mínimo desde identidad LIVE exacta.

## P1 · gobernanza y release

- [x] Recuperar proyecto Cloudflare productivo exacto y ruta de rollback.
- [x] Promover y verificar el lote actual en `app.iberfit.cl`.
- [x] Integrar PR #323 de acceso premium state-first.
- [x] Integrar HQ vivo en la línea técnica (PR #324).
- [ ] Proteger `canary/rc74-4` con PR + required checks.
- [ ] Mantener release por SHA exacto y rollback verificable.

## P1 · Device Experience Gate

### Phase A · GREEN (PR #325)
- [x] Cliente QA real: desktop 1440×1000.
- [x] Cliente QA real: tablet portrait 1024×1366.
- [x] Cliente QA real: tablet landscape 1366×1024.
- [x] Cliente QA real: móvil 390×844.
- [x] Coach: login + WebAuthn fail-closed en las cuatro clases.
- [x] Admin sintético: desktop/tablet portrait/tablet landscape/móvil con tareas de formulario, focus y gestión.
- [x] Suite PWA/update N-1→N separada GREEN.
- [x] Política semántica: desktop=analizar/construir; tablet=entrenar/operar; móvil=actuar/completar.

### Phase B · abierta
- [ ] Coach post-WebAuthn seguro en las cuatro clases.
- [ ] Admin autenticado QA real en desktop/tablet/móvil.
- [ ] Modal, scroll largo, teclado virtual/focus, error recovery y sesión live por dispositivo.

Criterio: no basta renderizar; cada dispositivo debe validar tareas representativas.

## P1 · producto / entrenamiento

- [ ] **Action Outcome Tracking**: registrar señal, decisión Coach, intervención y outcome.
- [ ] **Preparar próxima sesión**: IRI + plan + última carga + feedback + dolor/recuperación + adherencia + pendientes; Coach confirma.
- [ ] **IRI longitudinal**: reevaluación y progreso visible sin sobreinterpretar ruido.
- [ ] **Reactivación asistida**: borrador contextual ante caída de adherencia; sin envío autónomo inicial.
- [ ] **Hoy contextual**: una próxima acción prioritaria para Cliente.

## P1 · negocio / escalabilidad

- [ ] Funnel: lead -> conversación -> IRI -> cliente -> plan -> primera sesión -> 30/90/180.
- [ ] Instrumentar reactivación, referral y revenue.
- [ ] Medir minutos Coach/cliente/semana.
- [ ] Medir clientes activos/Coach, ocupación, capacidad y margen/hora por modalidad.
- [ ] Cohortes de adherencia/retención y outcome de intervenciones.

## P2 · UX / visual

- [ ] Unificar “requiere atención / siguiente acción” entre Cliente, Coach y Admin.
- [ ] Progreso longitudinal con más jerarquía que tarjetas aisladas.
- [ ] Menos contenedores, más espacio/tipografía cuando no comprometa información.
- [ ] Empty states siempre accionables.
- [ ] Gráficas responsive semánticas: móvil resume, desktop explora.

## P2 · rendimiento / accesibilidad

- [ ] Core Web Vitals / presupuesto por dispositivo en superficie productiva.
- [ ] Auditoría manual de contraste, focus, teclado, lector y touch targets.
- [ ] Medir arranque, auth bootstrap y navegación.
- [ ] Mantener observabilidad sin exposición de datos.

## Backend / seguridad

- [x] PROD Supabase reconocido como baseline actual.
- [x] Bundle SQL histórico `33656032685` retirado.
- [x] WebAuthn productivo inventariado y mantenido fail-closed.
- [ ] Cualquier cambio futuro DB = delta nuevo desde PROD live.

## No priorizar ahora

Marketplace, feed social, leaderboard general, chatbot genérico, gamificación decorativa o rediseño total mientras no cierren outcomes, multidispositivo y métricas de negocio.

## Siguientes 5 acciones

1. Protección de Canary.
2. Device Experience Gate Phase B.
3. Action Outcome Tracking.
4. Preparar próxima sesión.
5. Instrumentación funnel/capacidad/revenue.
