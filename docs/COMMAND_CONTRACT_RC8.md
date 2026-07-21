# IBERFIT M26 RC8 · Contrato canónico de comandos

## Fuente y alcance

Este contrato se deriva de la migración oficial `IBERFIT_M26_GATE_15_CANARY_MIGRATION.sql`, que define `public.domain_command_registry_v26`, sus 44 tipos de comando, entidades, roles y requisitos de motivo o vista previa.

RC8 elimina los nombres locales que no existen en el registro oficial y bloquea cualquier comando desconocido antes de llamar al transporte. La comparación se realizó contra el artefacto oficial conservado. La lectura autenticada directa de la tabla instalada sigue siendo obligatoria antes del canario porque el conector remoto no estuvo disponible durante este cierre.

## Reglas vinculantes

- Toda mutación pasa por `createCommand` y el Command Bus.
- El tipo debe existir en el registro de 44 comandos.
- `entityType` debe coincidir exactamente con el contrato.
- Las acciones destructivas exigen motivo cuando el registro lo establece.
- Las publicaciones exigen `previewAccepted=true`.
- Un estado local no se presenta como confirmado antes de ACK.
- Un rechazo o conflicto conserva el borrador y el estado previo.
- No se realizan escrituras directas a tablas Supabase.

## Payloads especiales alineados

| Flujo | Comando | Payload canónico |
|---|---|---|
| Completar IRI | `IRI_COMPLETAR` | `payload.patch` |
| Validar ciclo/plan | `PLAN_VALIDAR` | `payload.draft` |
| Crear/reprogramar cita | `CITA_CREAR` / `CITA_REPROGRAMAR` | `payload.appointment` |
| Publicar informe | `INFORME_PUBLICAR` | `payload.patch` + vista previa |
| Publicar sesión | `SESION_PUBLICAR` | `payload.patch` + vista previa |
| Iniciar sesión | `SESION_INICIAR` | `payload.executionId` + `payload.appointmentId` |
| Guardar progreso | `EJECUCION_GUARDAR_PROGRESO` | `payload.progressSnapshot` |
| Finalizar ejecución | `EJECUCION_COMPLETAR` | `payload.patch` |

## Correcciones RC8

Se retiraron del código funcional los tipos inexistentes `IRI_GUARDAR`, `INFORME_IRI_GENERAR`, `CITA_ACTUALIZAR`, `CICLO_CREAR`, `CICLO_ACTUALIZAR`, `PLAN_CREAR`, `PLAN_ACTUALIZAR` y `SESION_EJECUCION_REGISTRAR`.

La ejecución guiada utiliza ahora comandos separados para iniciar, guardar progreso, pausar, reanudar, completar y cancelar. Iniciar y completar solo cambian el estado local después de un ACK válido.

## Bloqueadores restantes

1. Leer `domain_command_registry_v26` con autenticación QA y comparar los 44 registros completos.
2. Ejecutar cada transición necesaria con entidades QA válidas y rollback o limpieza controlada.
3. Confirmar revisiones remotas, duplicados, conflictos y permisos por rol.
4. Completar QA visual en navegador y dispositivos reales.

Estado de despliegue RC8: **no desplegable**.
