# IBERFIT UNIVERSAL · M43 QA · Retención lógica verificable v3 (12/11/2026)

**Solo QA `gjztkdwfmunnzhtvxrsu` y solo SELECT.** El libro histórico v2 de 561 huellas se mantiene íntegro; su Git blob inmutable es `eeff214fb84b036c423d68b302a1749b58c91353`. No se altera ni elimina ninguna fila, ejecución o comprobante en Supabase.

## Selección y pruebas

- Consulta SQL read-only sobre `public.domain_entities_v26`: sesiones `completada`, títulos sintéticos con marca precisa `IBERFIT QA M43 · multideporte / sesión interactiva · run-…-a…`, mismo propietario y revisión en cuerpo y tabla, revisión >=2, fecha posterior al cierre v2 y anterior al corte fijo `2026-11-12T05:00:00Z`.
- Para cada candidata: **exactamente una** ejecución canónica `session_execution/completada` con el mismo cliente y sesión; **exactamente una** ejecución legacy `cerrada_confirmada` con resumen no vacío para el mismo cliente y sesión; ninguna cita ligada, ningún bloqueo de ejecución activo ni evento de dominio con propietario ajeno. Se consulta solo esa evidencia, no se inventan ACK ni se presume otro origen temporal.
- 55 candidatas cumplen estrictamente la consulta, las 55 aportan huellas nuevas respecto al libro v2; se agregan **solo las primeras 40 huellas ordenadas**, SHA256(`clientId:entityId:status:revision:title`), sin registrar IDs, títulos individuales ni datos personales.
- V3 contiene **601 huellas únicas ordenadas** (561 v2 + 40). Si alguno de esos registros cambia de identidad, estado, título o revisión dejará de coincidir y consumirá presupuesto nuevamente. Los registros en curso, desconocidos o de otro cliente jamás se excluyen.
- El límite M43 se conserva en **150 sesiones sintéticas activas para el presupuesto**. Esta retención de histórico finalizado permite ejecutar nuevas verificaciones sin borrar historia ni elevar el límite. El presupuesto exacto se volverá a leer mediante QA autenticada; ninguna cifra local sustituye esa lectura.

**No implica certificación final Coach–Cliente, ni autorización de promocionar a Canary o PROD.** La evidencia real será el job M43 autenticado en el SHA exacto, con aislamiento, escrituras sintéticas y readback. No usar PROD ni service role.
