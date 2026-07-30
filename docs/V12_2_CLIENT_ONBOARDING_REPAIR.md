# IBERFIT V12.2.1 · Alta transaccional y recuperación de borradores

## Incidente reproducido

El RPC histórico devolvía una respuesta aceptable para el navegador, pero el cliente no reaparecía en `iberfit_bootstrap_v26`. La aplicación evitó el falso éxito, aunque el expediente no quedó utilizable y el formulario se perdió al recargar.

La evidencia disponible sitúa el defecto en el límite entre creación remota, asignación Coach y proyección del bootstrap. V12.2.1 no presume una causa única: la corrige y verifica transaccionalmente.

## Backend aditivo

`backend/V12_CLIENT_ONBOARDING_REPAIR.sql` añade, sin reemplazar el contrato histórico:

- `iberfit_client_onboarding_preflight_v12()`;
- `iberfit_create_client_draft_v12(jsonb)`.

La nueva alta:

1. exige sesión autenticada con rol Coach/Admin;
2. usa un identificador idempotente estable;
3. reutiliza el RPC histórico;
4. comprueba que la fila exista en `clients`;
5. recupera de forma segura una fila huérfana por correo cuando el RPC histórico devuelve un identificador operativo;
6. crea o reactiva la asignación en `client_assignments`;
7. ejecuta `iberfit_bootstrap_v26` dentro de la misma transacción;
8. solo devuelve `ok=true` y `visible=true` cuando el expediente ya aparece para el Coach;
9. revoca acceso a `anon` y concede ejecución únicamente a `authenticated`.

## Frontend fail-closed

- El formulario se guarda localmente mientras se escribe y también al recargar o abandonar la página.
- Una recarga recupera el borrador completo incluso cuando IndexedDB no está disponible, mediante un respaldo efímero en `sessionStorage`.
- El borrador solo se elimina tras creación y rehidratación confirmadas.
- El frontend exige el preflight V12.2.1 antes de enviar datos.
- Un HTTP 200 sin `ok=true`, `visible=true` y `client_id` válido se rechaza.
- Los controles de acción dejan de superponerse a los últimos campos del formulario.

## Regresión

- Suite total: 417 pruebas; 416 aprobadas, 0 fallidas y 1 omisión histórica prevista.
- Gates RC29, RC35 y RC36: aprobados.
- Build: 859 archivos dentro de presupuesto.
- Grafo: 74 módulos, 0 ausentes.
- Rollback frontend: commit `d7f07ca7f4693b4338b00e9d756cb4d4c8739c4f`.
- Las funciones SQL históricas no se eliminan ni se reemplazan.


## Adaptación al esquema remoto real

- `public.clients` conserva identidad y datos generales, pero no contiene correo.
- El correo se resuelve mediante `public.client_intake_profiles.email`.
- Todo expediente nuevo o huérfano se activa en `public.m26_canary_clients_v26` antes de verificar el bootstrap.
- La función no modifica el RPC histórico ni altera tablas.
