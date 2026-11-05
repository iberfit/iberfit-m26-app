# U74 · Compatibilidad de salto de línea de función RC29 para PROD

**Estado: preparación en rama PR #1273, no despliegue ni modificación de PROD.**

## Evidencia verificable del 04/11/2026

La función `public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)` tiene **el mismo código** en QA y PROD, pero fue persistida con distinta codificación de fin de línea. Consulta READ-ONLY sobre `pg_proc.prosrc`:

| Entorno | Bytes | Saltos LF | Retornos CR | SHA-256 bruto |
|---|---:|---:|---:|---|
| QA | 5952 | 92 | 0 | `d436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9` |
| PROD | 6044 | 92 | 92 | `53957628982890e594c04253d7f451ccb0c8a1cee416bb659297b81f6dea3723` |

**SHA-256 del cuerpo LF-normalizado en ambos:** `d436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9`.

En ambos entornos, **4/4 funciones de la cadena legacy** superan la verificación tras normalizar exclusivamente CRLF a LF; 0 drift lógico, y propietario, SECURITY DEFINER, search_path y grants coinciden. QA tiene 0 divergencias brutas; PROD tiene 1 divergencia causada únicamente por CRLF.

## Solución limitada de portabilidad

La migración U60 `20261104150000` conserva todas las huellas SHA esperadas y el contrato cerrado. Se ajusta **únicamente** su condición de lectura de `pg_proc.prosrc` para la cadena de cuatro writers: usa `replace(p.prosrc,E'\\r\\n',E'\\n')` y rechaza cualquier retorno CR no perteneciente a un par CRLF. Las ocho funciones U30–U36 siguen con igualdad de SHA bruto; también siguen las precondiciones de ledger 7/7, RLS, FK, triggers, índices, propietarios, roles y comprobación de recibos.

**Nota de migración histórica:** U60 ya fue aplicada en QA antes de este ajuste *solo del preflight*; las funciones/triggers instalados no cambian. El cambio de texto tiene que quedar explícitamente trazado en este PR y validado mediante los tests de la versión de ambos entornos, sin reaplicar U60 en QA ni efectuar un `db push` global.

Se añade `scripts/release/u74_prod_legacy_line_endings_readonly.sql` como diagnóstico reproducible con salida agregada y **sin escrituras**. El cambio no altera una sola función persistida, dato, permiso ni SQL ejecutado en producción.

## Puertas todavía cerradas

Producción carece físicamente de U30–U36 y U60 (0/8 versiones de ledger), aunque sus FK críticas, PG17, executor V26 y guardas previos existen. No ejecutar ninguna migración/GRANT/merge/frontend hasta un **backup cifrado de PROD DB+Storage, restore aislado PG17 y evidencia M44 fresca <=2 horas**, comprobación de paridad estructural y pruebas de E2E QA, incluida seguridad IDOR, recuperación y rollback. El pipeline protegido de Canary/PROD no debe evitarse.

QA tiene el primer E2E autenticado de dos fechas y ejecución cerrada verificado por U71/U73: `41949348986` SUCCESS para recuperación del mismo run y 2 fechas independientes sin locks; U71 tuvo una incidencia de aserción de inicio futuro con hora (`START_WINDOW_INVALID` frente a `FUTURE_DATE`) y fue corregida. **No equivale a producción publicada.**
