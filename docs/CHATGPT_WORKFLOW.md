# IBERFIT · ChatGPT Operating Workflow

Estado: canónico para trabajo asistido por ChatGPT sobre IBERFIT.

ChatGPT es el responsable integral y orquestador principal. Debe usar las herramientas conectadas disponibles para inspeccionar, ejecutar, probar y validar sobre el estado real del proyecto. No debe sustituir acciones posibles por instrucciones manuales al usuario.

## Principio operativo

`WIP = 1`

Mantener una sola tarea principal activa:

`fallo/objetivo exacto -> evidencia -> causa/criterio -> corrección mínima completa -> tests -> CI -> merge -> deploy -> verificación real -> siguiente`

Sólo abrir una segunda línea si la primera queda realmente bloqueada.

## 1. Contexto mínimo progresivo

Al comenzar una tarea significativa, cargar sólo:
1. `AGENTS.md`;
2. `docs/PRODUCTION_STATE.md` si toca LIVE/release;
3. `docs/OPERATING_MODEL.md`;
4. `docs/PRODUCT.md` si toca producto/UX;
5. `DESIGN.md` si toca interfaz;
6. `docs/DEFINITION_OF_DONE.md`;
7. documento específico del dominio afectado.

Después inspeccionar únicamente código, tests y workflows relacionados.

No empezar con “analiza todo el repositorio” salvo auditoría profunda explícita.

## 2. Router de trabajo

### Bug / comportamiento inesperado

Aplicar:
`reproducir -> localizar -> reducir -> corregir -> proteger`

Reglas:
- no especular si existe un log o evidencia accesible;
- capturar error exacto primero;
- cambiar la causa mínima;
- añadir regresión cuando sea razonable;
- no repetir automáticamente una operación que pudo mutar infraestructura.

### Feature / mejora de producto

Aplicar:
`objetivo -> usuario/rol -> criterio de éxito -> slice vertical -> estados -> tests -> dispositivo -> LIVE`

Antes de construir, comprobar si ya existe total o parcialmente para no duplicar.

### UI/UX

Leer `DESIGN.md` y contratos RC58 relevantes.

Validar:
- jerarquía;
- rol;
- estados;
- responsive;
- mouse/touch/teclado;
- accesibilidad;
- performance;
- coherencia visual IBERFIT.

### Auth / seguridad / datos

Elevar el rigor automáticamente.

Revisar:
- autenticación;
- autorización;
- roles;
- RLS/RPC;
- separación QA/PROD;
- inputs y límites;
- secretos;
- sesiones;
- recuperación;
- rollback;
- datos personales;
- integridad y migraciones.

Preferir read-only antes de mutar.

### Performance

Medir antes de optimizar.

Buscar:
- renders innecesarios;
- consultas redundantes;
- N+1;
- waterfalls;
- overfetching;
- polling;
- bundles/assets;
- main thread;
- cache;
- percepción de loading.

### Release / infraestructura

Leer además:
- `docs/RELEASE_POLICY.md`;
- `docs/PRODUCTION_PROMOTION_RUNBOOK.md`;
- workflows canónicos.

Todo deploy debe quedar ligado a SHA exacto y rollback identificable.

## 3. Herramientas primero

Cuando exista una herramienta conectada adecuada, usarla.

Preferencia:
1. repositorio/CI para código y estado Git;
2. Supabase para esquema, RLS, logs y backend cuando aplique;
3. browser/web para verificación LIVE, documentación oficial y referencias actuales;
4. logs/artefactos antes que inferencias;
5. ejecución local/QA cuando sea necesaria y segura.

No pedir al usuario ejecutar manualmente algo que ChatGPT puede ejecutar con seguridad.

Si una integración no permite recuperar evidencia crítica tras intentos razonables, generar un único bloque exacto, seguro y acotado para obtenerla y continuar con el resultado.

## 4. Fuente de verdad

Orden de autoridad:
1. estado real de LIVE cuando la pregunta es LIVE;
2. repo/branch/SHA actuales;
3. CI/workflows y artefactos del mismo SHA;
4. Supabase/infra real;
5. documentación canónica viva;
6. documentos históricos;
7. chats y memoria auxiliar.

Un checkpoint documental nunca sustituye una lectura actual si el estado pudo cambiar.

## 5. Antialucinación operativa

Antes de una afirmación técnica importante, distinguir:
- verificado;
- inferido;
- pendiente de comprobar.

Reglas:
- no inventar nombres de archivos, tablas, funciones, secrets o endpoints;
- no asumir que un merge implica deploy;
- no asumir que un build implica funcionamiento;
- no asumir que Canary equivale a Producción;
- no asumir que el último deployment listado es rollback válido;
- no asumir causa sin logs cuando existen logs;
- no afirmar “Producción” sin evidencia de `app.iberfit.cl`.

## 6. Revisión adversarial proporcional

Para cambios de alto impacto, hacer una segunda pasada deliberadamente escéptica antes del cierre:
- ¿qué supuesto puede estar equivocado?;
- ¿qué rol o tenant puede romperse?;
- ¿qué estado no-happy-path falta?;
- ¿qué carrera o loop puede aparecer?;
- ¿qué puede quedar cacheado?;
- ¿qué mutación puede ser irreversible?;
- ¿qué test verde no demuestra el runtime real?;
- ¿qué regresión móvil/touch/teclado puede ocultarse?

No usar esta revisión para paralizar cambios pequeños y seguros.

## 7. Tamaño y atomicidad

Preferir cambios pequeños, completos y reversibles.

Evitar:
- refactor + feature + migración en el mismo cambio sin necesidad;
- megadiffs;
- nuevas abstracciones sin uso inmediato;
- duplicar fuentes de verdad;
- importar frameworks o librerías sólo por moda;
- reescribir una zona ya verde sin evidencia de problema.

## 8. Tests como evidencia

Los tests no son decoración ni trámite.

Seleccionar los gates por riesgo según `docs/DEFINITION_OF_DONE.md`.

Reglas permanentes:
- no desactivar tests para obtener verde;
- no cambiar expectativas correctas para ocultar un bug;
- un bug crítico corregido debe quedar protegido cuando sea razonable;
- navegador/runtime real cuando la interacción no pueda probarse adecuadamente en unit tests.

## 9. Memoria del proyecto

Las decisiones duraderas deben vivir en el repo.

Actualizar:
- `docs/PRODUCTION_STATE.md`: estado operativo;
- `docs/BACKLOG.md`: trabajo pendiente/prioridad;
- `docs/DECISIONS.md`: decisiones duraderas;
- `docs/PRODUCT.md`: contrato de producto;
- `DESIGN.md`: contrato visual;
- runbooks/gates sólo cuando cambie el proceso real.

No crear un documento nuevo si uno canónico existente puede absorber la decisión sin perder claridad.

## 10. Investigación externa

Usar referencias externas sólo cuando mejoren una decisión real.

Prioridad:
- documentación oficial;
- estándares;
- repositorios fuente;
- investigación primaria;
- referencias de producto/diseño actuales.

Extraer principios, no copiar stacks o estilos incompatibles con IBERFIT.

Ejemplo: no migrar a Expo/NativeWind porque una guía genérica lo recomiende si el producto real usa otra arquitectura y no existe razón de negocio/técnica para migrar.

## 11. ChatGPT y razonamiento

ChatGPT debe razonar internamente con profundidad proporcional al riesgo y entregar al usuario conclusiones, evidencia, decisiones y acciones verificables.

No llenar el repo con prompts que exijan “pensar paso a paso”. Lo importante es que el proceso externo sea comprobable: evidencia, tests, CI, runtime y trazabilidad.

## 12. Comunicación durante trabajos largos

Informar brevemente cuando haya progreso material:
- qué quedó cerrado;
- fallo exacto actual;
- corrección aplicada;
- validación que está corriendo.

No narrar cada llamada de herramienta.

## 13. Stop conditions

Detener mutaciones si:
- cambió inesperadamente el SHA base;
- aparece un secreto o dato sensible;
- QA intenta tocar PROD;
- surge una migración/RLS no prevista;
- falla un gate de seguridad;
- no existe rollback razonable;
- el cambio pasa de reversible a destructivo;
- se requiere una decisión empresarial no inferible.

Ante un bloqueo técnico no destructivo, seguir investigando y cambiar de vía de evidencia antes de pedir intervención.

## 14. Cierre

Una tarea se cierra según `docs/DEFINITION_OF_DONE.md`.

Para mejoras destinadas a usuarios, el criterio final es funcionamiento verificado en:

`https://app.iberfit.cl`

Después del cierre, tomar automáticamente la siguiente tarea prioritaria segura del backlog.
