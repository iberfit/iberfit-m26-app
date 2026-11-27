# GX350 / M44 — preflight de recuperación gestionada

Candidato congelado: `9076875af47d78284273e495dbd7fb227dbb5865`. Evidencia estructural PR #1473, 11/11 etapas y 20/20 huellas. No repetir GX333/GX350. Respaldo 46009568949, artifact 15204490077: metadata verificada el 27/11/2026 14:30 UTC; el gate de dos horas debe reevaluarse en ejecución. No equivale a descarga, descifrado o restauración.

El procedimiento gestionado anterior fija un artifact vencido y selecciona solo parte de Auth y de la aplicación; excluye ACL y Vault. Antes de habilitarlo: pin explícito de run/artifact, digest/bytes y candidato; descarga y verificación cifrada antes de pausar QA; entorno protegido y exclusión concurrente; aislamiento positivo/negativo y bloqueo de egreso antes de datos; censo vinculado al snapshot y paridad de ACL/RLS/roles; Auth real con identidades/contraseñas y nuevas sesiones; Storage privado; Edge con claves del destino y sin integraciones reales. Restaurar QA y pausar sandbox incluso ante fallo. No cambiar PROD.

Lectura agregada PROD 27/11: Vault 0 filas. No copiar clave raíz real al sandbox sin necesidad. Verificar su archivo cifrado y probar portabilidad con clave y secreto sintéticos; si el snapshot tiene secretos reales, exigir ruta explícita aislada y comprobar descifrado sin registrar valores. API oficial: https://supabase.com/docs/reference/api/v1-update-pgsodium-config. No reactivar sesiones de origen ni endpoints retirados. La clave real jamás se almacena en GitHub ni logs.

Este PR contiene solo un contrato puro de preflight y sus regresiones. No modifica ni activa el workflow existente. No representa recuperación gestionada certificada ni autoriza producción. El SHA de aplicación permanece intacto mientras se prepara la integración operativa.

## Integración operativa (27/11)

El workflow existente se limita deliberadamente a preflight; el paso de recuperación de slots queda dormido (también podría mutar entornos). Se usa el evaluador oficial interno M44 de jobs y pasos, se fija run/artifact de la evidencia actual y se valida ZIP/TAR con el guard existente antes de cualquier posible restauración. Verificación de los archivos Auth y Vault y censo asociado; si Vault no está vacío, fallo cerrado. Ningún secreto se aplica a otro proyecto. Si el respaldo caduca, se debe renovar y fijar un pin nuevo con evidencia del candidato; no ampliar la ventana de dos horas.

Evidencia anterior #1444: el sandbox ya contenía la restauración histórica de noviembre y ACL reconciliadas; no se debe vaciar, resetear ni reimportar encima. No equivale al snapshot actual ni a la certificación de Auth/Edge. Siguiente ruta: verificar estado sellado y procedencia del sandbox histórico, conservar su evidencia, ejecutar ensayos de runtime sintéticos separados y decidir ruta de actualización explícita antes de habilitar replay. No activar recuperación real desde este PR. El código histórico queda disponible pero sin llamada en main.


## 27-11-2026 — Carriles separados
El workflow histórico de recuperación gestionada, su implementación y sus tests se mantienen exactamente como Canary: el borrador de preflight no sustituye el procedimiento existente ni desactiva su limpieza. El contrato puro de preflight queda como evidencia reutilizable sin ejecución remota. La recuperación integral M44 conserva sus requisitos; el alcance GX350 se documenta por separado. No interpretar la restauración DB/Storage ni el inventario de código Edge como autorización de corte.
