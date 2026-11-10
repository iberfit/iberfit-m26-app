# IBERFIT · EXCELLENCE 360 · control de IRI y selecciones lineales

Estado: candidato de PR; no es evidencia de QA LIVE ni PROD.

Base canónica: 0c8e63223a7a9468f74193a0b3bc62ce6e1cc173 (`canary/rc74-4`).

## Evidencia antes del cambio
- Múltiples rutas del frontend admitían solo el literal `inicial`; la cartera y resumen seleccionaban el último registro IRI sin descartar `evolution-followup`; el portafolio de informes tenía una tercera clasificación.
- `latestForClient` clonaba todos los registros del cliente y luego ordenaba para seleccionar uno; `latestIndexed` también ordenaba la colección para escoger un solo resultado. El nuevo recorrido lineal preserva la prioridad de fecha, los empates estables, el aislamiento por propietario y la clonación defensiva del registro devuelto.
- QA, `pg_stat_statements` (contador acumulativo): bootstrap `iberfit_bootstrap_v26` 783 llamadas, media 1219,5 ms, máximo 7812 ms en el corte, no p95 ni SLA UX.
- Supabase PROD y QA: DELETE directo de `public.clients` revocado a `anon`/`authenticated`; no repetir DDL.

## Invariantes
- IRI inicial y seguimiento/evolución independientes; un indicador explícito de seguimiento contradictorio descarta el registro como baseline.
- No se truncan ni borran registros; sin nuevo SQL, RLS, Storage, Edge, Auth, redes, timers ni instrumentación de datos privados.
- Coach/Cliente/Admin mantienen navegación, permisos y redacción SIGNATURE; no inventar una mejora estética sin evidencia de captura.
- Egress facturado Supabase Free, SLA Coach <5s y flujo completo no declarados resueltos por este cambio.

## Gate de aceptación posterior
`npm test`, pruebas especializadas de IRI/Coach/Cliente, WebAuthn Coach+Admin real, Device, remoto, Canary exact-SHA, comparación de latencias con historial fijo y promoción PROD protegida M44/rollback únicamente si todos son GREEN.
