# IBERFIT Agent Operating Contract

Este repositorio es la fuente de verdad técnica de IBERFIT M26. Los chats, documentos históricos y ramas antiguas son contexto auxiliar, nunca autoridad superior al estado verificable del repositorio, CI, Canary y producción.

## Contexto operativo permanente

`app.iberfit.cl` es una aplicación en PRODUCCIÓN REAL con usuarios reales.

Eso implica:

- continuidad de servicio por encima de experimentación;
- privacidad y mínimo acceso a datos reales;
- soporte de incidencias LIVE separado de evolución de producto;
- ningún cambio productivo implícito por haber pasado tests en Canary;
- observación read-only como primera opción;
- toda promoción debe ser reversible y atribuible a un SHA exacto.

## Misión

Evolucionar IBERFIT como producto premium de entrenamiento personal manteniendo simultáneamente:

- calidad de producto;
- seguridad y privacidad;
- estabilidad operativa;
- experiencia Cliente / Coach / Admin;
- coherencia metodológica del entrenamiento;
- capacidad de crecimiento comercial;
- trazabilidad y rollback;
- velocidad de iteración sin poner en riesgo usuarios reales.

## Reglas no negociables

1. Inspeccionar antes de modificar.
2. No eliminar, sustituir ni degradar funcionalidad existente sin evidencia y justificación.
3. No asumir que una rama, README, chat o versión histórica representa producción.
4. Diferenciar siempre: LIVE, hotfix, desarrollo, Canary/QA, candidato y producción desplegada.
5. Antes de cualquier tarea sobre la app, leer `docs/PRODUCTION_STATE.md` y comprobar que no quedó obsoleto.
6. No desplegar producción, mutar Supabase PROD, cambiar DNS, credenciales, RLS o datos reales salvo instrucción explícita y gate aprobado.
7. Nunca incluir service-role keys, JWT, passwords, datos reales de clientes, notas privadas ni snapshots sensibles en commits, logs o evidencias públicas.
8. Los flujos sensibles deben fallar cerrados.
9. La Inteligencia IBERFIT propone; el Coach conserva decisión y responsabilidad operacional.
10. Preservar separación estricta de roles Cliente / Coach / Admin y least privilege.
11. No duplicar lógica de negocio entre superficies cuando pueda vivir en un contrato o módulo compartido.
12. Mantener cualquier baseline certificado como rollback; no reescribir historia.
13. No hacer force-push a ramas compartidas ni commits directos a producción/main.
14. Antes de cualquier mutación remota, volver a leer el SHA de la rama/artefacto objetivo y abortar si cambió respecto de la base prevista.
15. No tratar un test verde aislado como autorización de producción. Requiere gates, evidencia live y rollback.
16. No promover un conjunto grande de commits sólo para “poner producción al día”. Dividir en lotes verificables y reversibles.
17. No usar Canary como base de un hotfix de producción si eso arrastra cambios no relacionados. Un hotfix P0/P1 nace del SHA LIVE exacto salvo decisión explícita distinta.
18. No hacer pruebas destructivas con usuarios reales. Reproducir primero en QA/datos sintéticos o mediante observación read-only.
19. Si el propietario reporta una duda o molestia de uso, no asumir automáticamente que es un bug: clasificar antes de cambiar código.
20. Mantener WIP técnico limitado: una mutación de alto riesgo a la vez; análisis read-only puede avanzar en paralelo.

## Checkpoints de referencia

A 2026-09-02:

- LIVE observado: `cb423a12402206a383d4174a168707b2d860c023` en `app.iberfit.cl`;
- Canary certificado: `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`;
- Canary está 43 commits por delante del LIVE;
- gate remoto final de Canary: SUCCESS;
- Supabase PROD mutations durante la certificación: 0.

Estos datos son checkpoints, no alias permanentes. Verificar de nuevo antes de trabajar.

## Carriles de código

### A. LIVE SUPPORT / HOTFIX

Usar para incidencias reales P0/P1 en producción.

Flujo:

`LIVE exacto -> rama hotfix mínima -> QA/Canary equivalente -> gates -> deploy controlado -> smoke post-deploy -> cierre`

No incluir refactors, mejoras visuales o features no necesarias para resolver la incidencia.

### B. PRODUCT EVOLUTION

Usar para mejoras, UX/UI, entrenamiento, Admin/Coach/Cliente, i18n, PWA y nuevas capacidades.

Flujo:

`Canary certificado -> rama pequeña -> tests -> PR -> Canary exacto -> QA -> lote de release -> producción`

Ver `docs/RELEASE_POLICY.md`.

## Triage de cualquier nueva observación

Clasificar primero:

- `LIVE BUG`: algo que funcionaba/debería funcionar y falla a usuarios reales;
- `PRODUCT IMPROVEMENT`: nueva capacidad o mejora funcional;
- `UX/UI`: claridad, estética, navegación, fricción, responsive;
- `DATA/SECURITY`: auth, RLS, permisos, datos, privacidad, integridad;
- `PERFORMANCE/RELIABILITY`: lentitud, timeouts, offline/PWA, errores;
- `GROWTH`: web, SEO, CRO, lead, ventas, retención, referral.

Después asignar prioridad P0–P3, superficie, evidencia, riesgo y métrica esperada.

## Flujo diario esperado para Codex/agentes

1. Leer `AGENTS.md`.
2. Leer `docs/PRODUCTION_STATE.md`.
3. Leer `docs/OPERATING_MODEL.md` y sólo los documentos del dominio necesario.
4. Verificar LIVE/Canary/branch/SHA/CI si la tarea toca código o release.
5. Definir carril: LIVE SUPPORT o PRODUCT EVOLUTION.
6. Ejecutar la tarea más pequeña que cumpla el objetivo.
7. Ejecutar tests/gates proporcionales al riesgo.
8. Revisar el diff y buscar regresiones, exposición de secretos y cambios no solicitados.
9. Actualizar `docs/PRODUCTION_STATE.md` y `docs/BACKLOG.md` si cambia estado/prioridad.
10. Actualizar `docs/DECISIONS.md` sólo para decisiones duraderas.
11. Terminar con: cambios, pruebas/evidencia, riesgos restantes y siguiente acción exacta.

## Prioridades

- P0: seguridad, privacidad, pérdida/corrupción de datos, auth/RLS, cross-tenant, disponibilidad crítica, despliegue incorrecto.
- P1: regresión funcional importante, bloqueo Cliente/Coach/Admin, fallo de CI/release gate, experiencia que impide operar o vender.
- P2: mejora UX/UI, rendimiento, accesibilidad, mantenibilidad, observabilidad, optimización del funnel.
- P3: refinamientos y experimentos de menor impacto.

## Producto

IBERFIT no debe convertirse en una app genérica de ejercicios. Debe reforzar su propuesta: diagnóstico, planificación, control, seguimiento, adherencia, criterio profesional y una experiencia premium que conecte Cliente, Coach y Admin.

Reglas metodológicas históricas que deben preservarse salvo decisión explícita documentada:

- diagnóstico/IRI como pieza central;
- control de carga y seguimiento;
- feedback obligatorio cuando corresponda;
- progresión/regresión de series y alternativas cuando el cliente no completa;
- descansos editables;
- circuitos y formatos de entrenamiento soportados;
- fuerza evaluada por patrón, evitando simplificaciones no aprobadas;
- integración de datos y wearables sólo cuando no comprometa privacidad, calidad o coste operativo.

## Web y crecimiento

La app y la web pública son sistemas relacionados pero distintos. No mezclar repositorios o despliegues sin evidencia. Las decisiones técnicas deben considerar impacto en captación, conversión, retención, referencias y facturación, pero marketing nunca justifica relajar seguridad o calidad.

Web/Growth pueden avanzar en paralelo mediante investigación, contenido, tracking, SEO/CRO y diseño, pero las mutaciones productivas se serializan con sus propios gates.

## Uso eficiente de agentes

- no releer el repositorio completo en cada tarea;
- cargar sólo `AGENTS.md`, `PRODUCTION_STATE.md` y documentos del dominio afectado;
- comparar contra el último SHA/checkpoint, no reauditar historia sin motivo;
- tareas mecánicas y exploratorias: modelo eficiente;
- implementación normal: modelo principal;
- arquitectura/seguridad/release crítico: razonamiento alto;
- preferir prompts con resultado verificable y salida corta;
- no pegar logs enteros cuando basta el bloque que falla.

Ver `docs/CODEX_WORKFLOW.md`.

## Comunicación de agentes

Ser conciso. No narrar pasos triviales. Implementar antes de especular cuando sea seguro. Reportar únicamente:

1. cambios;
2. pruebas/evidencia;
3. riesgos restantes;
4. siguiente acción exacta.
