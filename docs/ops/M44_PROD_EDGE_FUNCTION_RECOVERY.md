# M44 — Recuperabilidad de Edge Functions de producción

## Evidencia de inventario real

Revisión de solo lectura sobre Supabase PROD `pjhmrhejsoofmouedavw` y la rama Canary. Fecha de referencia: 16 de octubre de 2026.

En producción hay **15 Edge Functions activas**. Antes de esta recuperación de código:
- 10 funciones tenían el archivo `index.ts` exactamente igual en GitHub y en la versión desplegada.
- 4 carecían de código fuente registrado bajo `supabase/functions`: `iberfit-ai`, `iberfit-one-time-create-juan-v1`, `iberfit-p0-email-delivery-probe-20260911` y `noop`.
- 1 tenía **divergencia deliberada**: `iberfit-client-onboarding-v1`. La fuente canónica del repositorio responde `410 M26_CLIENT_ONBOARDING_RETIRED` pero la implementación aún desplegada en PROD corresponde a una versión anterior distinta.

Este bloque incorpora exactamente la fuente actualmente desplegada de esas cuatro funciones ausentes (sin despliegue) y guarda una copia **solo histórica, fuera del árbol desplegable** de la quinta. No sustituye la implementación retirada y nunca debe reactivar un endpoint solo para reproducir un snapshot.

Tres de los cuatro endpoints recuperados ya responden 410: son fuentes retiradas, conservadas para reconstruir el estado real sin reactivar características obsoletas. `iberfit-ai` conserva su código actual y `deno.json`; necesita credenciales de servicio y de proveedor AI configuradas externamente, sin incluirlas aquí.

## Inventario y verificaciones

- `scripts/ops/m44_prod_edge_recovery_sources.json`: origen, slug, flag `verify_jwt`, hash de bundle remoto informado por Supabase, ubicación y SHA-1 Git de cada archivo.
- `scripts/ops/m44_edge_source_recovery_contract.mjs`: valida que están los 15 archivos fuente, su identidad en el repositorio, la separación de fuentes históricas, y la restricción a respuesta 410 en funciones retiradas.
- `tests/m44_edge_source_recovery_contract.test.mjs`: verifica desviaciones de código, despliegues distintos, flags de JWT divergentes y fallos de procedencia.

Comando de comprobación sin red:

`node --test tests/m44_edge_source_recovery_contract.test.mjs`

Comprobación local de fuentes sin consultar Supabase:

`node scripts/ops/m44_edge_source_recovery_contract.mjs`

La verificación de **lo efectivamente desplegado** necesita un nuevo listado de metadatos obtenido mediante conexión autorizada a Supabase PROD. Ese JSON debe etiquetarse explícitamente con `project_ref=pjhmrhejsoofmouedavw` y contener la lista `functions` devuelta por la API. No reutilizar el manifiesto local como si fuera una segunda observación del sistema real. El comparador rechaza funciones faltantes, nuevas, hash de bundle diferente o cambio del flag `verify_jwt`.

**Los hashes de bundle de Supabase no son hashes de los archivos TypeScript**. Permiten certificar versiones desplegadas, pero no reemplazan la evidencia independiente de fuente y su construcción. El SHA Git verifica identidad del contenido versionado, no el comportamiento runtime del despliegue.

## Riesgos y barreras de recuperación

1. No ejecutar un deploy masivo basado en este inventario. Revisar por separado destinatario, roles, JWT, controles internos de autenticación, dependencias, variables y código antiguo.
2. Cuatro funciones PROD tienen `verify_jwt=false`. Esto no prueba exposición indebida por sí solo: algunas verifican autorización dentro de la propia función o usan identidad de sistema. Deben conservar exactamente sus límites y superar pruebas negativas antes de desplegarse en un proyecto reconstruido.
3. `iberfit-client-onboarding-v1` debe permanecer retirado en el código canónico salvo decisión explícita tras revisar trazabilidad. La copia histórica de producción no es ruta de despliegue.
4. Los secretos para proveedores, claves JWT, API keys, SMTP, claves de cifrado y configuración Auth **no están en el backup de funciones**. Su custodia y recuperación seguras requieren pruebas independientes; nunca introducirlos en GitHub.
5. Los hashes se corresponden con el estado de un momento concreto. Tras cada deploy legítimo, volver a obtener la observación remota y actualizar el inventario de forma revisada; **no usar un snapshot antiguo como autorización de publicación**.
6. La recuperación de un proyecto requiere además permisos/roles/ACL, Storage completo, migraciones, claves Vault, Auth y un ensayo E2E desde un origen nuevo y aislado. Este bloque **no** autoriza M44/M45 PROD ni modifica la base de datos.

En Supabase PROD se hallaban **0 de las 12 migraciones M44** al momento de esta auditoría. QA ya incorpora esas 12; no interpretarlo como una instrucción de migración.

Este módulo es estrictamente de **recuperabilidad del código servidor**, separado del PR #959 encargado de la huella de roles, privilegios y puerta de promoción.
