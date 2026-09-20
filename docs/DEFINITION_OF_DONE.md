# IBERFIT · Definition of Done

Estado: canónico. Ninguna tarea se considera cerrada sólo porque el código compile, exista un PR o haya llegado a Canary.

## Regla principal

El nivel de verificación debe ser proporcional al riesgo, pero siempre debe existir evidencia suficiente para demostrar que el cambio funciona y no degrada lo ya correcto.

Cadena de cierre:

`fallo/objetivo exacto -> causa/criterio -> cambio mínimo -> tests -> CI -> integración -> deploy -> verificación real -> estado actualizado`

## 1. Antes de modificar

Confirmar cuando corresponda:
- repo y rama correctos;
- SHA base actual;
- estado LIVE/Canary relevante;
- cambios/PRs concurrentes;
- arquitectura y archivos afectados;
- impacto en Cliente/Coach/Admin;
- impacto en auth, RLS, datos, PWA y release;
- rollback razonable.

Abortar o rebasar si cambió inesperadamente el SHA base.

## 2. Implementación

El cambio debe:
- resolver la causa, no sólo el síntoma;
- ser lo más pequeño posible sin quedar incompleto;
- preservar funcionalidades útiles;
- evitar duplicar lógica o crear una segunda fuente de verdad;
- usar contratos y primitives existentes cuando sean correctos;
- no introducir secretos ni datos reales en código, logs o fixtures;
- mantener QA y PROD separados.

## 3. Tests

Elegir la combinación necesaria según impacto:
- test unitario/focal;
- integración;
- regresión existente relevante;
- E2E/browser;
- auth/session;
- RLS/backend;
- accessibility;
- performance;
- PWA/service worker;
- build;
- lint/typecheck si forman parte del stack afectado.

Un bug importante corregido debe quedar protegido con un test cuando sea razonable.

Nunca debilitar o eliminar una comprobación sólo para conseguir verde.

## 4. UX y dispositivos

Si el cambio toca interfaz o interacción, validar proporcionalmente:
- desktop;
- tablet cuando sea una superficie operativa relevante;
- móvil;
- mouse;
- touch;
- teclado;
- scroll;
- modales/sheets/overlays;
- focus;
- selects/formularios;
- safe areas;
- loading/success/empty/error/retry.

Contrato crítico: inputs/selects no pueden perder foco ni cerrarse al soltar click/touch.

## 5. Seguridad y datos

Si el cambio cruza auth, roles, datos o APIs:
- autorización backend real;
- RLS/RPC/policies revisadas;
- separación tenant/rol;
- validación de inputs;
- secretos ausentes de cliente/logs;
- privilegios fail-closed;
- recuperación y sesión coherentes;
- migraciones, constraints e índices revisados antes de mutar datos.

Supabase PROD no se muta salvo necesidad explícita y validada.

## 6. Performance

Si puede afectar rendimiento:
- medir antes/después cuando sea razonable;
- revisar renders y listeners;
- consultas redundantes/N+1/waterfalls;
- overfetching;
- polling;
- bundle y assets;
- main thread;
- cache;
- rendimiento percibido de loading/transición.

No optimizar por intuición cuando se puede medir.

## 7. PR e integración

Antes de merge:
- diff entendido;
- sin cambios ajenos;
- tests del mismo SHA verdes;
- CI aplicable verde;
- riesgos conocidos documentados;
- base SHA/HEAD revalidado;
- merge guardado contra carrera cuando corresponda.

## 8. Canary

Cuando el carril lo requiera:
- SHA exacto desplegado;
- runtime QA-only;
- proyecto Cloudflare correcto;
- `/version.json` y `/m26/version.json` coherentes;
- Supabase QA exacto;
- cero referencias PROD en Canary;
- gate autenticado read-only;
- desktop/móvil relevantes verdes;
- cero mutaciones no autorizadas;
- rollback disponible y probado contractualmente.

Canary verde es evidencia de seguridad, no cierre final de una mejora destinada a Producción.

## 9. Producción

Una mejora destinada a usuarios sólo se cierra tras verificar directamente `https://app.iberfit.cl`.

Como mínimo según impacto:
- SHA/release exactos;
- Supabase PROD correcto;
- ausencia de QA refs;
- headers/CSP relevantes;
- login/auth/session;
- rol afectado;
- flujo afectado;
- console/page errors;
- PWA/service worker si aplica;
- responsive/interacción si aplica;
- rollback identificado.

No afirmar que está en Producción sin evidencia LIVE.

## 10. Cierre documental

Actualizar sólo lo que realmente cambió:
- `docs/PRODUCTION_STATE.md` para estado operativo;
- `docs/BACKLOG.md` para prioridad/pendientes;
- `docs/DECISIONS.md` para decisiones duraderas;
- evidencia/run/deployment cuando corresponda.

Evitar documentación duplicada que pueda divergir.

## Severidad de cierre

### P0/P1

Exige evidencia fuerte, rollback claro, browser/runtime real y seguridad prioritaria.

### P2

Exige tests focales + regresión proporcional + UX/device si aplica.

### P3

Puede usar una vía más ligera, pero nunca sin revisar diff y comportamiento afectado.

## Resultado esperado de ChatGPT al cerrar

Reportar de forma compacta:
1. qué quedó cerrado;
2. causa/cambio;
3. tests y CI;
4. SHA/PR/deploy cuando existan;
5. verificación LIVE cuando aplique;
6. siguiente tarea exacta.
