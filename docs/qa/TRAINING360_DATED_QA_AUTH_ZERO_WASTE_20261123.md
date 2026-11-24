# IBERFIT · Training360 QA — Auth sin fugas (23/11/2026)

## Evidencia y motivo
El backend U60/U72 y el frontend tienen modo activo en PROD, SHA publicado `fa81b0f8…`, pero PROD no contiene ocurrencias fechadas actuales (0); la única prescripción histórica está cancelada. No generar entrenamiento sintético ni adulterar historial productivo. En QA hay un flujo U74 anterior que certificó dos fechas autónomas, inicio, pausa, reanudación, series, finalización, segundo día intacto, lectura posterior Coach y denegación al otro Cliente. Falta su reatestación sobre el SHA Canary integrado.

## Reducción de consumos preservando QA
- Playwright U60 read-only y U74 real signed write: cerrar localmente el JWT de la página tras cada test, aunque el test falle, y antes de cerrar contextos secundarios. La limpieza no borra nada ni hace logout global.
- U71 Node en cinco modos (preflight, apply, preflight-browser, prepare-browser, verify-browser): registrar únicamente los tokens expedidos a tres fixtures nominales QA, verificar email exacto de Auth y revocarlos en `finally`, también ante errores. Sin acceso a claves de servicio ni SQL ni PROD.
- Los dos workflows de dos intentos siguen siendo obligatorios; sus límites de sintéticos, enrutamiento, fecha, SHA, JWT y CAS no se relajan.

## Certificación exact-SHA
PR Node + auditoría + CI, merge Canary protegido. Sobre el SHA fusionado: U71 intento 1 preflight sin escrituras; U74 intento 1 preflight sin escrituras; si son verdes y siguen siendo el SHA actual, rerun explícito del MISMO job U74 para intento 2 (sin nuevo runId), comprobando `QA_BROWSER_HOSTED_E2E_SUCCESS`, control de sesiones antes/después y ACL/RLS. No dar por entregada la experiencia PROD con solo la prueba QA.

## PROHIBICIONES
No revocar sesiones reales, no inventar pruebas PROD, no abrir permisos SQL, no borrar historiales ni tocar recuperaciones cifradas. Mantener M44 y comparación de versión exacta antes de cualquier nuevo release.
