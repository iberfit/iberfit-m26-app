# Connected 360 · Canal de consentimiento por proveedor (QA)

**Base:** Canary/PROD `f63742bc4541a60c94268e65850fe373c6c7f968`. Este cambio repara una contradicción cliente-servidor: las RPC v2 admiten `health_connect` con consentimiento; el transporte web rechazaba cualquier proveedor distinto de `normalized_file`, por lo que el importador Android QA no podía pasar de su primer paso.

- `normalized_file` continúa habilitado en QA y PROD sin cambios de contrato.
- `health_connect` solo puede consultar autorización y solicitar grant en runtime QA **con host exacto** `m26-canary.iberfit.cl` y proyecto Supabase QA. El origen Android se valida aparte por `isConnected360QaNativeAvailable` y el canal seguro WebView.
- Apple Health, Samsung Health, BLE y terceros siguen cerrados hasta una certificación separada.
- Sin auto-sync en PROD; sin cambio de RLS ni secretos; las llamadas remotas requieren JWT de cliente y consentimiento explícito en la capa de aplicación.
- Scopes duplicados y no reconocidos se rechazan antes de enviar el RPC. El CAS de autorización y el fence del backend permanecen autoritativos.
- **Límite conocido:** el flujo importador nativo sigue escribiendo resúmenes al contrato v44 con fecha de adquisición como aproximación técnica heredada; v45 no tiene ruta de importación. No afirmar procedencia exacta ni sincronización automática.

## Validación

Ejecutar `node --test tests/m26_connected360_qa_transport_provider_scope.test.mjs tests/m26_connected360_qa_native_import.test.mjs tests/m26_connected360_v2_explicit_consent.test.mjs`; posteriormente CI, Canary Exact Deploy y Production Promotion, verificando mismas garantías en LIVE.

La prueba end-to-end en un Android físico **aún no está realizada**; prohibido afirmar certificación nativa hasta registrar evidencia del dispositivo y consentimiento/revocación multi-sesión.
