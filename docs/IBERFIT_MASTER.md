# IBERFIT · Master

Estado: consolidación operativa activa
Fecha de corte: 2026-09-02
Repositorio canónico técnico: `iberfit/iberfit-m26-app`

## Propósito

Este documento conecta producto, tecnología y negocio. No sustituye el estado operacional de `PRODUCTION_STATE.md` ni la arquitectura detallada. Su objetivo es impedir que IBERFIT dependa de hilos antiguos, documentos contradictorios o ramas históricas.

## Qué es IBERFIT

IBERFIT es un negocio y plataforma de entrenamiento personal premium. Su propuesta no es entregar rutinas genéricas, sino combinar diagnóstico, planificación, control de carga, seguimiento, criterio profesional, experiencia digital y relación Coach–Cliente.

Superficies principales:

- App Cliente;
- App Coach;
- Admin;
- web pública / captación;
- sistemas de QA, auditoría y release.

## Principios de producto

1. Marca IBERFIT por encima de una app genérica o de una sola persona.
2. Diagnóstico IRI como pieza tangible de entrada y seguimiento.
3. Planificación con criterio y control de carga.
4. Seguimiento y feedback que produzcan decisiones útiles.
5. Experiencia premium, clara y coherente en Cliente, Coach y Admin.
6. Automatización e IA como asistencia, no sustitución ciega del criterio del Coach.
7. Datos estructurados para poder medir adherencia, resultados, retención y negocio.

## Arquitectura conceptual estable

Flujo objetivo consolidado:

`Cliente / Coach / Admin -> aplicación -> contratos/comandos -> backend transaccional -> event/state layer -> proyecciones/integraciones`

No usar Google Sheets u otras superficies como bypass directo del frontend para lógica transaccional crítica. La capa canónica debe preservar idempotencia, revisión y resolución explícita de conflictos.

## Fuente de verdad

Orden de autoridad para decisiones técnicas:

1. estado remoto verificable (rama/SHA/CI/canary/LIVE/proveedor);
2. código y tests del repositorio canónico;
3. documentación maestra en `docs/`;
4. decisiones registradas;
5. chats y documentos históricos como evidencia secundaria.

Cuando dos fuentes se contradigan, registrar la discrepancia y validar antes de actuar.

## Estado resumido al corte

- `canary/rc74-4` está certificado exactamente en `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`.
- Remote gate exacto `33641163059`: `success`.
- La corrección Coach WebAuthn fail-closed de PR #41 está integrada en ese SHA y no debe reabrirse sin evidencia nueva.
- Supabase producción `pjhmrhejsoofmouedavw` fue verificado read-only como `ACTIVE_HEALTHY`.
- Producción ya registra la secuencia productiva RC74.4/RC65/P0 y migraciones posteriores hasta al menos `20260902033214 p0_restore_primary_auth_read_bootstrap_v1`.
- El bundle SQL histórico del run `33656032685` parte de un baseline anterior y queda `SUPERSEDED`; no debe ejecutarse ni forzarse.
- La Edge Function productiva `iberfit-webauthn-v1` está `ACTIVE`, versión `1`, `verify_jwt=true`, con RP/orígenes productivos esperados.
- PR #43 fue cerrado sin merge tras retirar de forma fail-closed el ejecutor SQL superseded y pasar CI/auditoría.
- Canary debe permanecer fijo mientras falta recuperar el proyecto Pages productivo exacto y el deployment ID live de Cloudflare.
- PR #40 es la rama documental HQ y no autoriza ningún despliegue.

Consultar `PRODUCTION_STATE.md` para el detalle actualizable.

## Regla de promoción vigente

No confundir “Canary certificado” con “producción lista para recibir todo Canary”.

Antes de cualquier promoción frontend:

1. recuperar identidad real de Cloudflare productivo;
2. fijar deployment live + rollback;
3. calcular diff exacto respecto al candidato;
4. promover sólo un lote entendido y reversible;
5. ejecutar verificación post-deploy antes de continuar.

Para base de datos, cualquier nuevo cambio debe generarse como delta desde el estado productivo live. No se reutiliza el SQL superseded de `33656032685`.

## Trabajo activo que no debe perderse

- Cliente, Coach y Admin como tres roles/superficies diferenciados.
- Design System compartido y coherente.
- autenticación, WebAuthn y persistencia segura de sesión;
- PWA y experiencia multiplataforma;
- i18n ES/EN/FR/PT;
- auditoría continua read-only;
- QA autenticado y aislamiento Cliente A/B;
- rendimiento RLS y least privilege;
- producto de entrenamiento: IRI, planificación, agenda, ejercicios, sesiones, engagement y datos;
- mejora estética y funcional por ramas derivadas de Canary;
- clasificación selectiva de PRs antiguos, evitando merges masivos.

## Producto de entrenamiento que no debe degradarse

- diagnóstico IRI;
- ΔFC step test;
- fuerza por patrón;
- informe único;
- progresiones y regresiones;
- descanso editable;
- circuitos bis/tri/AMRAP/Tabata;
- alternativas de ejercicios;
- feedback obligatorio;
- seguimiento y control de carga.

La evolución técnica debe reforzar esta metodología, no convertir IBERFIT en una app fitness genérica.

## Negocio

Oferta de referencia histórica a conservar hasta nueva decisión:

- Diagnóstico IRI: $30.000 CLP, bonificable según oferta vigente;
- Presencial / Híbrido / Online;
- referencias históricas: 1 sesión/semana $30.000; 2/semana $27.500 por sesión;
- objetivo inicial histórico: al menos 3 clientes nuevos de aproximadamente $250.000/mes.

Estos valores no deben publicarse automáticamente sin confirmar que siguen vigentes.

Zonas objetivo históricas en Santiago:

- Las Condes;
- Vitacura;
- Providencia;
- Lo Barnechea;
- Ñuñoa.

## Métricas que el sistema debe llegar a observar

Producto:

- activación;
- adherencia;
- sesiones completadas;
- feedback;
- progresión;
- errores y tiempos de respuesta;
- retención 30/90/180 días.

Negocio:

- visitas y origen;
- lead -> WhatsApp/contacto;
- lead -> diagnóstico;
- show rate;
- diagnóstico -> cliente;
- CAC;
- ingreso medio;
- churn;
- LTV;
- referidos;
- upsell/híbrido/online.

## Objetivo de la siguiente etapa

Operar IBERFIT mediante carriles coordinados, con continuidad verificable:

1. LIVE SUPPORT: incidencias reales y hotfix mínimo;
2. PRODUCTO/APP: estabilidad + experiencia + diferenciación;
3. WEB: captación + SEO + CRO;
4. GROWTH: adquisición + conversión + retención + referrals;
5. QA/SECURITY: gates y auditoría sobre cambios reales.

Los carriles comparten prioridades y métricas, pero no deben compartir accidentalmente despliegues, credenciales o fuentes de verdad.
