# IBERFIT U92 — verificación de retención lógica QA, sin borrar datos

**Origen:** base QA `gjztkdwfmunnzhtvxrsu`, comparación read-only del 09/11/2026. Registro anterior inmutable `m43-qa-retained-history-v1.json` (Git blob `c10fb0b22afdab4560ed3065b6b8953fab392934`).

**Prueba de 84 entradas adicionales:** todas son sesiones sintéticas M43 con marca exacta de ejecución y estado `completada`, revisión y propietario coherentes, última actualización anterior a `2026-11-09T15:30:00Z`; una ejecución canónica completada, una ejecución legacy `cerrada_confirmada` con resumen no vacío, sin cita, sin bloqueo de sesión ni evento de otro cliente ligado a esa sesión. La huella SHA256 es `client_id:entity_id:status:revision:title`. No se copian títulos, nombres, correos ni identificadores de usuarios al repositorio.

El resultado congela **561 huellas (477 anteriores + 84 nuevas)** sin modificar la versión v1, sin borrar ni alterar registros y sin aumentar el límite `150`. Un registro cerrado posteriormente que cambie de estado, versión, propietario o título deja automáticamente de coincidir.

**No equivale a una limpieza de QA ni a autorización de modificar producción.** Volver a ejecutar M43 sobre fixture nuevo para verificar E2E exact-SHA. Mantener WebAuthn, autenticación, privacidad, retención y límites Supabase Free.
