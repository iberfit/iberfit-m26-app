# IBERFIT · Backlog Vivo

Este backlog coordina trabajo. Los tickets/PRs concretos siguen viviendo en GitHub. No marcar DONE por memoria: exigir evidencia.

## CHECKPOINT

- LIVE observado: `cb423a12402206a383d4174a168707b2d860c023` en `app.iberfit.cl` con usuarios reales.
- Canary certificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`.
- Canary está 43 commits por delante de LIVE.
- Remote gate Canary `33641163059`: SUCCESS.
- Mutaciones Supabase PROD durante certificación: 0.

## P0 — siempre abierto como guardrail

- [ ] Mantener P0=0 en auth, WebAuthn, roles, RLS, cross-tenant, integridad de datos y disponibilidad.
- [ ] Ante cualquier P0 LIVE: congelar evolución productiva de riesgo, branch desde SHA LIVE exacto y hotfix mínimo.
- [ ] Nunca usar usuarios/datos reales para pruebas destructivas.

No existe un P0 técnico concreto abierto por el checkpoint Canary final, pero estas condiciones son permanentes.

## P1 — operación con usuarios reales

- [ ] Crear inventario de los 43 commits LIVE→Canary y dividirlos en lotes de promoción verificables.
- [ ] Definir primer lote de promoción; no desplegar hasta recertificación específica.
- [ ] Mantener carril `LIVE SUPPORT / HOTFIX` preparado desde el SHA productivo exacto.
- [ ] Confirmar smoke read-only de LIVE y version identity antes de cada intervención productiva.
- [ ] Preparar/validar rollback por lote, incluyendo compatibilidad de backend.
- [ ] Revisar específicamente la migration `20260902033214_p0_restore_primary_auth_read_bootstrap_v1.sql` antes de cualquier consideración PROD; no incluirla de forma implícita.
- [ ] Consolidar/cerrar ramas y PRs antiguos sólo después de comparar contra Canary; no merges masivos.
- [ ] Resolver deuda de README/versionado histórico sin romper gates.
- [ ] Resolver explícitamente política de visibilidad del repositorio.

## P1 — producto / APP

- [ ] Hacer QA funcional guiado por propietario sobre `app.iberfit.cl`: Cliente, Coach y Admin; convertir dudas reales en backlog clasificado.
- [ ] Comparar cada duda de LIVE contra comportamiento Canary para saber si ya está resuelta o requiere trabajo nuevo.
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
- [x] `PRODUCTION_STATE.md` convertido en checkpoint LIVE + Canary.
- [x] `OPERATING_MODEL.md` creado.
- [x] `RELEASE_POLICY.md` creado.
- [x] `CODEX_WORKFLOW.md` creado.
- [ ] Integrar la documentación HQ a la línea técnica apropiada una vez revisado el PR documental.
- [ ] Abrir en ChatGPT Desktop/Codex una copia limpia del repo; no usar la copia local antigua con archivos no versionados como fuente canónica.
- [ ] Para cada sesión: leer sólo AGENTS + STATE + dominio; evitar contexto total.

## DONE / evidencia consolidada

- [x] Repositorio técnico canónico: `iberfit/iberfit-m26-app`.
- [x] Web duplicada `iberfit/iberfit-web` identificada como archivada.
- [x] Divergencia web LIVE vs `iberfitweb/main` documentada.
- [x] Canary `9cbe3ad...` desplegado exactamente en QA.
- [x] Remote gate final verde.
- [x] WebAuthn privilegiado recertificado fail-closed.
- [x] 0 mutaciones de Supabase PROD durante cierre Canary.
- [x] Producción `app.iberfit.cl` reconocida formalmente como sistema vivo con usuarios reales.

## SIGUIENTES 5 ACCIONES

1. Inventariar y agrupar los 43 commits LIVE→Canary sin desplegar.
2. Comenzar QA guiado por uso real: registrar la primera duda/fricción del propietario en `app.iberfit.cl` y compararla con Canary.
3. Recuperar source/deploy exacto de `iberfit.cl` web.
4. Recuperar métricas actuales del funnel comercial.
5. Revisar PR documental HQ y dejar esta fuente de verdad accesible desde el flujo Codex cotidiano.
