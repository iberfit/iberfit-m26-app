# IBERFIT M1 · U72 pause/reanudación: prueba real sintética QA (13/11/2026)

**Entorno exclusivo:** Supabase QA `gjztkdwfmunnzhtvxrsu`. Esta evidencia no habilita producción, no certifica el navegador real escribiendo ni autoriza cambios sobre clientes reales.

## Evidencia de backend directamente observada

Ejecutado mediante `DO` transaccional con JWT simulado de la identidad de prueba `qa.rc74.client-a@iberfit.cl`, contra `public.iberfit_occurrence_api_u60_v1` con funciones instaladas en QA. Una fecha del fixture QA quedó aislada en un subbloque `BEGIN/EXCEPTION` que fuerza rollback y comprueba los contadores originales. Se verificó:
- `OCURRENCIA_INICIAR`: ACK revision 1 y vínculo a ocurrencia autorizada.
- `OCURRENCIA_PAUSAR`: ejecución `pausada`, revisión 2 y tiempo acumulado calculado por servidor.
- Repetición de operación idéntica: recibo idempotente, sin segunda pausa.
- `OCURRENCIA_GUARDAR_PROGRESO` estando pausada: rechazo `EXECUTION_PAUSED`; sin false ACK.
- Lectura `iberfit_occurrence_detail_v1`: ocurrencia continúa `en_curso`, ejecución `pausada` y `pausedAt` autorizado, `activeSince=null`.
- `OCURRENCIA_REANUDAR`: ACK revisión 3, estado `en_curso`, `activeSince` reactivado.
- Lectura privada al reanudar: coherencia de estado y fecha.
- `SET CONSTRAINTS ALL IMMEDIATE` confirmó el trigger diferido de recibos antes de rollback deliberado.
- Después del rollback: sin nueva ejecución, recibo ni fecha modificada; conteos históricos iguales.

Prueba de autorización separada: Client B sintético intentó enviar una pausa contra el scope de Client A. El RPC devolvió SQLSTATE **42501**, capturado expresamente; los recibos no variaron.

## Contratos y no-go
- Ledger de U72 en QA: `20261113014302`. El código de frontend U72 y validación privada de temporizador tienen cobertura Node + Chromium READ-ONLY en PR #1335; SQL sólo en QA.
- La UI debe completar el E2E autenticado **escribiendo** en dos fechas con recuperación de red/dispositivo. El ensayo SQL anterior no sustituye ese E2E.
- El backend PROD permanece cerrado. No promover hasta M44 productivo fresco y restauración (DB, Storage, Auth/Vault aplicables), gates READY y smoke exact Canary.
- No modificar datos de clientes. La limpieza se realiza en otro hilo.
