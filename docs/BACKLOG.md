# IBERFIT · Backlog Vivo

Este backlog coordina trabajo. Los tickets/PRs concretos siguen viviendo en GitHub. No marcar DONE por memoria: exigir evidencia.

## CHECKPOINT

- Canary certificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`.
- Remote gate Canary `33641163059`: SUCCESS.
- WebAuthn Coach fail-closed: integrado mediante PR #41.
- Supabase PROD `pjhmrhejsoofmouedavw`: `ACTIVE_HEALTHY` en lectura 2026-09-02.
- Producción ya registra migraciones final_prod RC74.4/RC65/P0 hasta al menos `20260902033214 p0_restore_primary_auth_read_bootstrap_v1`.
- Bundle SQL histórico run `33656032685`: SUPERSEDED; no ejecutar.
- Edge Function PROD `iberfit-webauthn-v1`: ACTIVE v1, verify_jwt=true.
- PR #43: cerrado sin merge tras retirar el ejecutor SQL superseded y pasar CI/auditoría.
- Canary debe permanecer fijo mientras falta recuperar proyecto/deployment Cloudflare productivo exacto.

## P0 — siempre abierto como guardrail

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad de datos y disponibilidad.
- [ ] Ante cualquier P0 LIVE: congelar evolución productiva de riesgo, identificar deployment/SHA LIVE exacto y aplicar hotfix mínimo.
- [ ] Nunca usar usuarios/datos reales para pruebas destructivas.

No existe un P0 técnico concreto abierto por el checkpoint Canary final, pero estas condiciones son permanentes.

## P1 — operación con usuarios reales

- [ ] **Bloqueo actual:** recuperar de Cloudflare el proyecto Pages productivo exacto, deployment ID live, dominios/rutas y rollback.
- [ ] No mover `canary/rc74-4` de `9cbe3ad...` mientras el checkpoint Cloudflare productivo siga sin resolver.
- [ ] Calcular el diff frontend LIVE→Canary sólo después de recuperar la identidad real del deployment productivo.
- [ ] Definir primer lote de promoción; no desplegar hasta recertificación específica y aprobación explícita.
- [ ] Mantener carril `LIVE SUPPORT / HOTFIX` preparado desde el deployment/SHA productivo exacto del momento.
- [ ] Preparar/validar rollback por lote, incluyendo compatibilidad backend.
- [x] Confirmar que la migration `20260902033214 p0_restore_primary_auth_read_bootstrap_v1` ya figura aplicada en PROD.
- [x] Confirmar que el bundle SQL `33656032685` no corresponde al baseline productivo actual y retirarlo fail-closed.
- [ ] Consolidar/cerrar ramas y PRs antiguos sólo después de comparar contra Canary; no merges masivos.
- [ ] Resolver deuda de README/versionado histórico sin romper gates.
- [ ] Resolver explícitamente política de visibilidad del repositorio.

## P1 — producto / APP

- [ ] Clasificar #37/#36/#35/#42 como cluster auth/UX contra el Canary actual y conservar sólo capacidades faltantes.
- [ ] Clasificar #34/#31/#30 como cluster auditoría/rutas/SW contra Canary actual.
- [ ] Comparar #26 PWA contra Canary y el candidato UX más nuevo antes de rescatar piezas.
- [ ] Comparar #25 RLS contra código/migraciones actuales; PROD ya contiene `audit360_optimize_auth_rls_initplan`, por lo que no se debe reaplicar SQL.
- [ ] Comparar #24 first-access contra Canary y `p0_restore_primary_auth_read_bootstrap_v1` antes de decidir cierre/rescate.
- [ ] Hacer QA funcional guiado por propietario sobre Cliente, Coach y Admin; convertir dudas reales en backlog clasificado.
- [ ] Validar onboarding/primera activación y recuperación de acceso.
- [ ] Validar circuito IRI -> planificación -> sesión -> feedback -> evolución.
- [ ] Validar ergonomía Coach/Admin del Canary con tareas reales, no sólo screenshots.
- [ ] Validar i18n ES/EN/FR/PT en rutas, fechas, auth, labels y persistencia.
- [ ] Confirmar consistencia Design System y percepción premium entre roles.
- [ ] Revisar PWA/install/update/offline/privacy antes de cada lote que toque shell/service worker.

## P2 — calidad / UX / rendimiento

- [ ] Auditoría visual por breakpoint y rol basada en rutas prioritarias.
- [ ] Accesibilidad: teclado, focus, labels, contrastes, touch targets, errores.
- [ ] Medir arranque, auth bootstrap y navegación antes/después de cambios.
- [ ] Revisar timeouts/transports sin ocultar errores de autorización.
- [ ] Revisar carga multimedia de ejercicios y fallback seguro.
- [ ] Observabilidad con mínima exposición de datos.
- [ ] Crear lista Top 10 de fricciones reportadas por propietario/usuarios, ordenada por frecuencia e impacto.

## DATABASE / BACKEND

- [x] Verificar production project y estado health en modo read-only.
- [x] Verificar historia de migraciones productiva RC74.4/RC65/P0.
- [x] Verificar Edge Function WebAuthn productiva activa y con contrato productivo visible.
- [x] Retirar el bundle SQL histórico de promoción como superseded.
- [ ] Para cualquier cambio futuro, generar exclusivamente un delta desde el baseline PROD live actual.
- [ ] Verificar backup/PITR inmediatamente antes de una futura mutación DB real, no por rutina.
- [ ] No redeployar la Edge Function si no existe una diferencia real demostrada.

## WEBSITE — carril paralelo

- [ ] Identificar proyecto/deployment Cloudflare exacto que sirve `iberfit.cl`.
- [ ] Recuperar source SHA/snapshot del LIVE actual.
- [ ] No desplegar desde `iberfit/iberfitweb@main` mientras siga divergente de LIVE.
- [ ] Crear branch web desde fuente LIVE real antes de editar.
- [ ] Auditoría funcional móvil/desktop, enlaces, WhatsApp, formularios, idiomas, legal.
- [ ] SEO local Santiago: intención comercial + zonas reales.
- [ ] CRO: landing -> WhatsApp/contacto -> Diagnóstico IRI.
- [ ] Tracking: `view_iri`, `click_whatsapp`, `start_contact`, `submit_contact`, `book_iri` si aplica.
- [ ] Core Web Vitals / assets / accesibilidad.

## GROWTH / SALES — carril paralelo

- [ ] Confirmar oferta y precios vigentes antes de publicar/automatizar.
- [ ] Definir ICP por Presencial / Híbrido / Online con evidencia real de leads/clientes.
- [ ] Instrumentar funnel: fuente -> lead -> conversación -> IRI -> cliente -> retención/referral.
- [ ] Recuperar datos actuales de Google Business, Search Console y analytics.
- [ ] Mejorar Google Business con atribución a lead/IRI, no sólo vistas.
- [ ] Sistema de testimonios/casos con consentimiento.
- [ ] Sistema de referral en momentos de satisfacción/resultado.
- [ ] Medir retención 30/90/180 y riesgo de abandono.
- [ ] Priorizar experimentos por impacto/evidencia/velocidad, no por cantidad de contenido.

## QA / SECURITY / AUTOMATION

- [x] Auditor diario transformado a incremental para reducir consumo.
- [x] Auditor profundo semanal separado del diario.
- [x] Bibliotecario de continuidad orientado a `AGENTS.md` + docs vivos.
- [ ] Verificar periódicamente que los schedulers ejecutan la rama/fuente esperada.
- [ ] Auditar sólo diffs/áreas cambiadas a diario; full scan semanal o por release.
- [ ] Mantener pruebas read-only contra producción salvo procedimiento de release.
- [ ] Escalado de modelos: eficiente para mecánico, principal para coding, razonamiento alto para seguridad/arquitectura/release.

## ORGANIZACIÓN / CODEX

- [x] `AGENTS.md` creado y actualizado para producción real.
- [x] `PRODUCTION_STATE.md` convertido en checkpoint LIVE + Canary + backend productivo real.
- [x] `OPERATING_MODEL.md` creado.
- [x] `RELEASE_POLICY.md` creado.
- [x] `CODEX_WORKFLOW.md` creado.
- [ ] Integrar la documentación HQ a la línea técnica apropiada una vez revisado el PR documental.
- [ ] Para cada sesión: leer sólo AGENTS + STATE + dominio; evitar contexto total.

## DONE / evidencia consolidada

- [x] Repositorio técnico canónico: `iberfit/iberfit-m26-app`.
- [x] Web duplicada `iberfit/iberfit-web` identificada como archivada.
- [x] Divergencia web LIVE vs `iberfitweb/main` documentada.
- [x] Canary `9cbe3ad...` desplegado exactamente en QA.
- [x] Remote gate final verde.
- [x] WebAuthn privilegiado recertificado fail-closed.
- [x] Producción Supabase verificada ACTIVE_HEALTHY read-only.
- [x] Secuencia de migraciones productiva real inventariada sin tocar datos privados.
- [x] Bundle SQL obsoleto bloqueado y PR #43 cerrado sin merge.
- [x] Edge Function WebAuthn productiva inventariada sin redeploy.
- [x] Producción `app.iberfit.cl` reconocida formalmente como sistema vivo con usuarios reales.

## SIGUIENTES 5 ACCIONES

1. Recuperar proyecto/deployment Cloudflare exacto de la app productiva sin mutación.
2. Clasificar PRs antiguos contra `9cbe3ad...` y cerrar/rescatar selectivamente.
3. Mantener HQ actualizado con el resultado de esa clasificación.
4. Preparar el primer lote frontend sólo después de conocer el deployment LIVE y rollback.
5. Continuar producto/UX/Growth en ramas separadas sin mover el checkpoint Canary certificado.
