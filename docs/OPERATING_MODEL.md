# IBERFIT · Operating Model

## Objetivo

Operar IBERFIT como un producto vivo con usuarios reales, múltiples frentes en paralelo y una única fuente de verdad, sin convertir cada mejora en un proyecto enorme ni cada incidencia en una promoción masiva.

## Regla de oro

**Paralelizar análisis; serializar mutaciones de riesgo.**

Pueden avanzar simultáneamente:

- análisis de producto;
- auditoría read-only;
- investigación web/SEO/CRO;
- growth/competencia;
- diseño de soluciones;
- clasificación de feedback;
- documentación;
- tests locales independientes.

No deben solaparse sin coordinación:

- deploys productivos;
- migraciones Supabase;
- cambios RLS/auth;
- cambios de DNS/Cloudflare;
- merges múltiples sobre la misma línea de release;
- hotfix LIVE y promoción masiva del tren Canary.

## Los 5 carriles de IBERFIT

### 1. LIVE SUPPORT

Propósito: mantener `app.iberfit.cl` estable para usuarios reales.

Entradas:

- bug reportado por propietario/usuario;
- error/alerta del auditor;
- regresión productiva;
- problema de acceso, datos o disponibilidad.

Salida:

- diagnóstico;
- workaround si existe;
- fix mínimo si corresponde;
- evidencia de cierre.

WIP: máximo 1 cambio productivo sensible a la vez.

### 2. PRODUCT / APP

Propósito: elevar Cliente, Coach y Admin.

Subdominios:

- onboarding/acceso;
- IRI;
- planificación;
- sesiones;
- ejercicios;
- feedback;
- evolución;
- agenda;
- comunicación;
- engagement;
- UX/UI;
- PWA;
- i18n;
- IA asistiva.

Cada mejora debe declarar:

- usuario afectado;
- problema;
- comportamiento deseado;
- métrica/criterio de aceptación;
- riesgo;
- carril de release.

### 3. WEBSITE

Propósito: convertir intención en contacto/IRI.

Trabajo:

- recuperar fuente real de LIVE;
- SEO;
- CRO;
- rendimiento;
- contenido;
- tracking;
- prueba social;
- experiencia móvil;
- coherencia de marca.

La web mantiene su propio source/deploy. No usar el repo M26 como atajo para desplegar `iberfit.cl`.

### 4. GROWTH / SALES

Propósito: aumentar clientes, retención, LTV y referencias de forma medible.

Trabajo:

- ICP;
- oferta;
- pricing;
- Google Business;
- SEO local;
- WhatsApp/funnel;
- diagnóstico IRI;
- referrals;
- retención;
- contenido;
- alianzas;
- experimentos.

No medir actividad por publicaciones; medir funnel y negocio.

### 5. QA / SECURITY / RELIABILITY

Propósito: reducir riesgo de todos los carriles.

Trabajo:

- auditor incremental;
- auditor profundo semanal;
- CI;
- auth/WebAuthn/RLS;
- cross-tenant;
- PWA/offline;
- rendimiento;
- accesibilidad;
- observabilidad;
- gates de release.

## Cómo entra una nueva idea/duda

El propietario puede describirla en lenguaje natural. No necesita preparar un ticket.

Ejemplos:

- “Esto me parece confuso.”
- “El Coach tarda demasiado aquí.”
- “Quiero que el cliente pueda…”
- “Esta pantalla se ve poco premium.”
- “Un usuario me dijo que…”
- “¿Por qué funciona así?”

El sistema la transforma en una ficha mínima:

```text
Tipo: LIVE BUG | PRODUCT | UX/UI | DATA/SECURITY | PERFORMANCE | GROWTH
Superficie: Cliente | Coach | Admin | Web | Backend | Infra
Problema:
Evidencia:
Impacto:
Prioridad: P0 | P1 | P2 | P3
Carril: LIVE SUPPORT | PRODUCT EVOLUTION | WEBSITE | GROWTH
Siguiente acción:
Criterio de cierre:
```

No obligar al usuario a rellenar esta ficha; la genera el agente.

## Priorización

Orden general:

1. P0 seguridad/datos/disponibilidad;
2. P1 bloqueos reales de operación/usuarios/ventas;
3. problemas repetidos con alta fricción;
4. mejoras con alto impacto en adherencia/retención/conversión;
5. mejoras estéticas con impacto claro en confianza/usabilidad;
6. refinamientos P3.

Para producto/growth usar una heurística simple:

`Prioridad ≈ impacto esperado × evidencia × frecuencia / esfuerzo × riesgo`

No necesita un número perfecto; sirve para comparar decisiones.

## Cadencia

### Continuo

- bugs/feedback;
- alertas P0/P1;
- decisión de siguiente tarea.

### Diario

- auditor incremental sólo sobre cambios;
- revisar errores/novedades relevantes;
- no repetir auditoría total si no cambió nada.

### Semanal

- auditor profundo;
- revisar Top 5 del backlog;
- revisar funnel Growth;
- revisar estado Web;
- decidir siguiente lote de Product Evolution.

### Por release

- fijar SHA;
- definir alcance;
- freeze del lote;
- QA/gates;
- rollback;
- deploy;
- smoke post-deploy;
- actualización de estado.

## WIP y paralelismo

Para maximizar velocidad sin caos:

- 1 mutación productiva de alto riesgo simultánea;
- 1 lote Product Evolution activo;
- 1 frente Website de implementación activo;
- Growth puede mantener varios análisis/experimentos si no interfieren con tracking/deploys;
- QA puede auditar todos, pero no debe cambiar código silenciosamente.

## Estados estándar

Toda iniciativa importante debe estar en uno de estos estados:

- `DISCOVERY`
- `READY`
- `IN PROGRESS`
- `QA`
- `CANARY CERTIFIED`
- `READY FOR PROD`
- `LIVE`
- `MEASURING`
- `DONE`
- `BLOCKED`
- `REJECTED/HISTORICAL`

Esto evita “está hecho” cuando sólo existe código local.

## Fuente de verdad

- estado técnico: `PRODUCTION_STATE.md`;
- prioridades: `BACKLOG.md`;
- decisiones: `DECISIONS.md`;
- reglas: `AGENTS.md`;
- release: `RELEASE_POLICY.md`;
- trabajo Codex: `CODEX_WORKFLOW.md`;
- website: `docs/website/`;
- growth: `docs/growth/`.

Chats y sesiones sirven para dirigir el trabajo, no para almacenar el único estado válido.

## Definición de terminado

Una tarea no está DONE porque el código exista.

Según alcance, DONE requiere:

- comportamiento implementado;
- tests relevantes verdes;
- diff revisado;
- QA proporcional;
- documentación/estado actualizado;
- si debía llegar a usuarios: LIVE verificado;
- si es experimento: métrica activada y periodo de medición definido.
