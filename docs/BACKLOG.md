# IBERFIT · Backlog Vivo

Este backlog es de coordinación. Los tickets/PRs concretos siguen viviendo en GitHub. No marcar DONE por memoria: exigir evidencia.

## P0 — release blockers / seguridad

- [ ] Reejecutar y cerrar el fallo del smoke autenticado del gate remoto sobre el HEAD Canary vigente.
- [ ] Demostrar que Canary live sirve exactamente el SHA/artefacto esperado antes de cualquier GO.
- [ ] Confirmar P0=0 en auth, WebAuthn, roles, RLS y aislamiento cross-tenant.
- [ ] Confirmar que no hubo ni habrá mutaciones de Supabase PROD durante validación.
- [ ] Verificar rollback real y recuperable del candidato final.

## P1 — estabilización y gobernanza

- [ ] Consolidar línea activa: decidir qué cambios de los PRs abiertos forman el próximo candidato y evitar cherry-picks/merges duplicados.
- [ ] Resolver divergencias entre `canary/rc74-4`, `prep/final-production-rc74-4` y PR #38 mediante comparación verificable.
- [ ] Actualizar metadatos/README/versionado que aún describen RC29/RC38 sin romper gates históricos.
- [ ] Catalogar scripts, README y artefactos históricos por RC; archivar sólo después de demostrar que no son dependencias de gates actuales.
- [ ] Resolver explícitamente la política de visibilidad del repositorio (configuración actual pública vs regla histórica del README).
- [ ] Completar QA extremo a extremo Cliente / Coach / Admin en desktop y móvil.
- [ ] Recertificar PWA/service worker/runtime config por entorno.
- [ ] Revisar y consolidar los cambios de persistencia segura de sesión/WebAuthn sin almacenar contraseñas.
- [ ] Revisar el trabajo de optimización RLS (16 políticas históricamente detectadas) contra el esquema vigente antes de PROD.

## P1 — producto

- [ ] Completar y validar rediseño Admin/Coach con navegación clara y estados robustos.
- [ ] Validar i18n ES/EN/FR/PT sin regresión de rutas, fechas, auth ni contenido no traducido.
- [ ] Auditar primera activación de Cliente y recuperación de acceso extremo a extremo.
- [ ] Validar que IRI -> planificación -> sesiones -> feedback -> evolución funciona como circuito real, no como módulos aislados.
- [ ] Confirmar consistencia del Design System entre Cliente, Coach y Admin.

## P2 — calidad / UX / rendimiento

- [ ] Auditoría visual sistemática por breakpoint y rol.
- [ ] Accesibilidad: teclado, focus, labels, contrastes, touch targets, estados de error.
- [ ] Rendimiento de arranque y navegación; medir antes/después.
- [ ] Reducir timeouts y cargas bloqueantes sin ocultar errores de autorización.
- [ ] Revisar carga multimedia de ejercicios y degradación segura.
- [ ] Observabilidad: errores de cliente, backend, auth y release con mínima exposición de datos.

## WEBSITE

- [ ] Confirmar repositorio canónico actual de web pública antes de modificarla.
- [ ] Consolidar trabajo histórico de `iberfit/iberfitweb`; tratar `iberfit/iberfit-web` como posible duplicado histórico hasta revalidar.
- [ ] Construir `WEBSITE_MASTER` basado en estado live + decisiones aprobadas, no rehacer desde cero.
- [ ] Resolver deuda histórica: reglas comerciales, CTA/IRI, redacción duplicada, idioma y `mailto:`.
- [ ] SEO local Santiago: servicios + comunas prioritarias + intención comercial.
- [ ] CRO: landing -> contacto/WhatsApp -> diagnóstico IRI.
- [ ] Analytics de funnel con eventos definidos antes de escalar campañas.

## GROWTH / SALES

- [ ] Confirmar oferta/precios vigentes antes de publicar o automatizar.
- [ ] Definir ICP por modalidad: Presencial / Híbrido / Online.
- [ ] Instrumentar funnel completo y fuente de lead.
- [ ] Mejorar Google Business: vistas -> web/llamada -> lead -> diagnóstico.
- [ ] Sistema de testimonios/casos con consentimiento.
- [ ] Sistema de referral en momentos de alto valor/resultados.
- [ ] Experimentos de captación con hipótesis, coste y criterio de éxito.
- [ ] Retención 30/90/180 y detección de riesgo de abandono.

## AUTOMATION / AI

- [ ] Mantener auditor continuo read-only y hacerlo incremental para reducir coste.
- [ ] Crear auditor profundo semanal separado del auditor frecuente.
- [ ] Escalado de modelos: tareas mecánicas -> modelo eficiente; desarrollo -> modelo principal; arquitectura/seguridad -> razonamiento alto.
- [ ] Generar resúmenes operativos a partir de datos estructurados, nunca de datos sensibles pegados en prompts públicos.
- [ ] Evaluar IA in-product sólo con caso de negocio, privacidad y métricas definidas.

## DONE / evidencia inicial

- [x] Repositorio técnico canónico identificado como `iberfit/iberfit-m26-app`.
- [x] Rama documental segura `chore/iberfit-hq-bootstrap` creada desde Canary SHA `444374e0c6cc6efb1d95f00dc7b138f261a23187`.
- [x] Contrato `AGENTS.md` creado.
- [x] Fuente maestra y estado operativo inicial documentados.
