# IBERFIT Agent Operating Contract

Este repositorio es la fuente de verdad técnica de IBERFIT M26. Los chats, documentos históricos y ramas antiguas son contexto auxiliar, nunca autoridad superior al estado verificable del repositorio, CI, canary y producción.

## Misión

Evolucionar IBERFIT como producto premium de entrenamiento personal manteniendo simultáneamente:

- calidad de producto;
- seguridad y privacidad;
- estabilidad operativa;
- experiencia Cliente / Coach / Admin;
- coherencia metodológica del entrenamiento;
- capacidad de crecimiento comercial;
- trazabilidad y rollback.

## Reglas no negociables

1. Inspeccionar antes de modificar.
2. No eliminar, sustituir ni degradar funcionalidad existente sin evidencia y justificación.
3. No asumir que una rama, README, chat o versión histórica representa producción.
4. Diferenciar siempre: desarrollo local, rama de trabajo, canary/QA, candidato de producción y LIVE.
5. No desplegar producción, mutar Supabase PROD, cambiar DNS, credenciales, RLS o datos reales salvo instrucción explícita y gate aprobado.
6. Nunca incluir service-role keys, JWT, passwords, datos reales de clientes, notas privadas ni snapshots sensibles en commits, logs o evidencias públicas.
7. Los flujos sensibles deben fallar cerrados.
8. La Inteligencia IBERFIT propone; el Coach conserva decisión y responsabilidad operacional.
9. Preservar separación estricta de roles Cliente / Coach / Admin y least privilege.
10. No duplicar lógica de negocio entre superficies cuando pueda vivir en un contrato o módulo compartido.
11. Mantener M25.1/M25.2 y cualquier baseline certificado como rollback según corresponda; no reescribir historia.
12. No hacer force-push a ramas compartidas ni commits directos a producción/main.
13. Antes de cualquier mutación remota, volver a leer el SHA de la rama objetivo y abortar si cambió respecto de la base prevista.
14. No tratar un test verde aislado como autorización de producción. Requiere gates, evidencia live y rollback.

## Rama de referencia actual

La rama canary observada al iniciar esta documentación fue `canary/rc74-4` en SHA `444374e0c6cc6efb1d95f00dc7b138f261a23187` (2026-09-02). Este dato es un checkpoint, no un alias permanente: verificar de nuevo antes de trabajar.

## Flujo de trabajo esperado

1. Leer `AGENTS.md`.
2. Leer `docs/PRODUCTION_STATE.md`.
3. Leer sólo los documentos de dominio necesarios.
4. Verificar rama, SHA, CI y PRs abiertos relevantes.
5. Ejecutar la tarea más pequeña que cumpla el objetivo.
6. Ejecutar tests/gates proporcionales al riesgo.
7. Revisar el diff y buscar regresiones, exposición de secretos y cambios no solicitados.
8. Actualizar `docs/PRODUCTION_STATE.md` y `docs/BACKLOG.md` si cambia el estado del proyecto.
9. Actualizar `docs/DECISIONS.md` sólo para decisiones duraderas.
10. Terminar con: cambios, pruebas, riesgos restantes y siguiente bloqueo.

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

## Comunicación de agentes

Ser conciso. No narrar pasos triviales. Implementar antes de especular cuando sea seguro. Reportar únicamente:

1. cambios;
2. pruebas/evidencia;
3. riesgos restantes;
4. siguiente acción exacta.
