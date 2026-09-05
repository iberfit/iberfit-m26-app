# IBERFIT · Architecture

## Scope

Mapa de arquitectura para orientar agentes y desarrolladores. Es descriptivo y normativo sólo donde `AGENTS.md`, tests o contratos lo respaldan.

## Superficies

### Cliente

Responsabilidades:

- autenticación y activación;
- visualización/ejecución de entrenamiento;
- feedback;
- progreso;
- retos/engagement cuando corresponda;
- datos personales propios;
- experiencia PWA/offline sólo dentro de límites de privacidad.

### Coach

Responsabilidades:

- clientes asignados;
- planificación;
- agenda;
- IRI/diagnóstico;
- sesiones;
- ejercicios/recursos;
- comunicación;
- seguimiento y revisión de propuestas de Inteligencia IBERFIT.

### Admin

Responsabilidades:

- dirección/operación;
- personas;
- control;
- configuración y funciones administrativas explícitamente autorizadas.

Admin no debe obtener acceso implícito a rutas genéricas de Cliente/Coach por conveniencia de UI.

## Núcleo M26 observado

`src/m26/` contiene módulos de dominio y experiencia, entre ellos superficies `admin`, `agenda`, `app`, `communication`, `data-experience`, `design`, `domain`, `engagement`, `exercises`, `experience`, `guidance`, además de `command-bus.js`, `command-catalog.js` y `canonical-store.js`.

La arquitectura debe favorecer:

- contratos centralizados;
- separación de roles;
- lógica de dominio independiente de la vista;
- idempotencia;
- trazabilidad;
- fallos cerrados;
- proyecciones seguras por rol/tenant.

## Backend / comandos

El repositorio conserva una capa de comandos y múltiples preflight/migrations SQL históricas. Los comandos remotos y el registro autenticado son gates de release, no una lista informal.

Antes de añadir o cambiar un comando:

1. revisar catálogo local;
2. revisar contrato remoto;
3. revisar auth/RLS;
4. actualizar test de contrato;
5. validar idempotencia/conflictos;
6. demostrar que no amplía privilegios por accidente.

## Estado y persistencia

Principio histórico a preservar:

`UI -> command/API boundary -> backend transaccional -> event/state/projection layer`

Evitar escrituras directas desde frontend a integraciones auxiliares como sustitución del backend canónico.

Las notas privadas de Coach no deben persistir offline.

## Auth / WebAuthn

- sesión persistente: nunca almacenar contraseña;
- refresh y revalidación deben ser acotados y fail-closed ante pérdida real de autorización;
- WebAuthn de plataforma/mismo dispositivo puede ser preferente, pero no debe degradar controles privilegiados;
- 401/403 deben invalidar acceso de forma segura;
- la selección de rol/superficie no otorga el rol: el backend lo determina.

## PWA

Objetivos:

- installable donde sea compatible;
- service worker ligado a release;
- cache sin fuga de datos sensibles;
- offline sólo para información explícitamente permitida;
- runtime config separado por entorno;
- actualización controlada y recuperable.

## QA / CI

Capas observadas:

1. tests Node;
2. tests específicos de roles/módulos/RC;
3. gates locales;
4. auditoría de repositorio;
5. Canary build/runtime config;
6. Playwright/browser QA;
7. gates remotos Supabase read-only;
8. smoke autenticado;
9. evidencia y artefactos.

No colapsar estas capas en un único `npm test` para decidir producción.

## Entornos

### Local

Puede simular y construir. No equivale a QA remoto.

### QA / Canary

Supabase QA conocido: `gjztkdwfmunnzhtvxrsu`.
Canary conocido: `m26-canary.iberfit.cl` / proyecto Cloudflare `iberfit-m26-canary`.

### Producción

Debe tratarse como un entorno separado con configuración, credenciales, artefacto y rollback propios.

## Integraciones

Wearables/Health Connect y otras integraciones deben entrar por contratos claros y con consentimiento/privacidad. No ampliar alcance sólo porque exista una API disponible.

## Deuda arquitectónica visible

- abundante sedimentación de scripts/README por RC;
- metadatos de versión históricos no alineados con la línea RC74.4;
- múltiples ramas/PRs parcialmente solapados;
- necesidad de mapa definitivo de módulos y ownership;
- necesidad de separar documentación histórica de documentación viva.

La solución no es borrar en masa: primero catalogar, clasificar y sólo después archivar o retirar con tests.
