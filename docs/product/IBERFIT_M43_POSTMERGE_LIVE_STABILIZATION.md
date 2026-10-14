# M43 · Cierre real Coach post-WebAuthn y Canary edge, 14/10/2026

## Estado previo, no confundir certificados
El PR #932 fue fusionado a `canary/rc74-4` como squash `9ddeee609bf97ec3136acf746d6463f74adad04f`, tras 12/12 CI y 49/49 checks de escritura QA. La certificación WebAuthn **real post-merge** falló en dispositivo móvil al pedir que fuese visible el botón seleccionado **dentro del menú Más cerrado**, aunque la traza mostraba que el contenido Sesiones estaba renderizado. Esa misma traza mostró la guía inicial Coach superpuesta sobre Sesiones; es un defecto UX independiente.

Canary Exact Deploy del merge cargó correctamente 1104 archivos, pero una carga de `/src/m26/wearables/contracts.js` devolvió HTTP 520 durante su smoke de navegador; el proceso hizo **rollback real a `64725ec2ab0b77c46ddb79ff1a79cb3ef72dc71b`**, confirmado por `CANARY_ROLLBACK_EVIDENCE.json` (ok=true). Producción no fue modificada.

## Remediación conjunta
1. La guía de Coach/Admin solo aparece automáticamente en Hoy; una ruta elegida explícitamente suspende la guía sin perder pasos y sin reapertura tardía. Conserva apertura manual desde «Guía»/Ajustes.
2. El test post-WebAuthn comprueba menú activo en el DOM aunque Más esté cerrado, **main visible para Sesiones/Planificación**, ninguna guía intrusiva y capturas por dispositivo: 1440, 1024, 1366, 390 y 320.
3. Canary smoke realiza **máximo tres contextos de navegador independientes** solo si constata HTTP 5xx conocido de recursos CSS/JS estáticos servidos desde el dominio Canary, sin mutaciones, errores JavaScript o accesos prohibidos. El tercer fallo es definitivo. Nunca reintentar/ignorar errores 401/403, incorrecto SHA/origen, vista rota, desbordamiento o autenticación fallida.
4. Test de contrato, tests unitarios de navegación/guía y pruebas de política fail-closed.

## Entrega y criterios obligatorios
El cambio se integra como una sola estabilización post-merge, con protección PR Ready y CI íntegro. La ejecución genuina WebAuthn requiere push trusted Canary, de modo que **no declarar Coach certificado por pasar contrato en PR**. Después de Canary LIVE SHA certificado, coordinar compatibilidad SQL PROD de 32 condiciones, cuatro migraciones con rollback, promover a `app.iberfit.cl` solo mediante workflow autorizado, y verificar LIVE. El workflow productivo sigue inalterado.
