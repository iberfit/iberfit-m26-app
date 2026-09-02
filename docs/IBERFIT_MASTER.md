# IBERFIT · Master

Estado: bootstrap de consolidación
Fecha de corte inicial: 2026-09-02
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

1. estado remoto verificable (rama/SHA/CI/canary/LIVE);
2. código y tests del repositorio canónico;
3. documentación maestra en `docs/`;
4. decisiones registradas;
5. chats y documentos históricos como evidencia secundaria.

Cuando dos fuentes se contradigan, registrar la discrepancia y validar antes de actuar.

## Estado resumido al corte

- `canary/rc74-4` fue observado en SHA `444374e0c6cc6efb1d95f00dc7b138f261a23187`.
- CI de esa revisión tuvo ejecución verde.
- El gate remoto read-only posterior falló en el smoke autenticado de navegador, después de superar preflight, validación live básica y generación visual.
- `prep/final-production-rc74-4` fue observado en SHA `824671972406bc98febaf1049ef7963f3dd571f9`.
- Existe trabajo activo de rediseño Admin/Coach e i18n en PR #38.
- Producción debe seguir tratándose como congelada hasta completar gates y comprobar la identidad exacta del artefacto live.

Consultar `PRODUCTION_STATE.md` para el detalle actualizable.

## Trabajo activo que no debe perderse

- Cliente, Coach y Admin como tres roles/superficies diferenciados.
- Design System compartido y coherente.
- autenticación, WebAuthn y persistencia segura de sesión;
- PWA y experiencia multiplataforma;
- i18n ES/EN/FR/PT en desarrollo;
- auditoría continua read-only;
- QA autenticado y aislamiento Cliente A/B;
- rendimiento RLS y least privilege;
- producto de entrenamiento: IRI, planificación, agenda, ejercicios, sesiones, engagement y datos;
- mejora estética y funcional previa a cualquier promoción definitiva.

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

Dejar de desarrollar IBERFIT como una sucesión de RCs y conversaciones aisladas y pasar a operar tres carriles coordinados:

1. PRODUCTO/APP: estabilidad + experiencia + diferenciación;
2. WEB: captación + SEO + CRO;
3. GROWTH: adquisición + conversión + retención + referrals.

Los tres deben compartir prioridades y métricas, sin compartir accidentalmente despliegues, credenciales o fuentes de verdad.
