# IBERFIT · Incidencia #821 · Instrumentación de QA sin datos sensibles

## Evidencia verificada (9 octubre 2026)
En la primera ejecución del smoke autenticado #38002904905, el perfil tablet horizontal Chromium expiró esperando el RPC de assurance en la tercera cuenta sintética. El log del navegador registra el inicio del intento y el timeout 30 segundos después. La consulta de los edge logs de Supabase QA para ese intervalo no mostró una solicitud del primer factor ni de assurance desde dicho intento. Las peticiones observadas de estos endpoints respondieron HTTP 200 con latencias cortas.

No hay causa raíz demostrada. Un error anterior se produjo en Firefox; no se debe declarar fallo exclusivo de tablet.

## Implementación
El test remoto autenticado conserva el mismo umbral, los mismos siete perfiles y la misma política de lectura. Al fallar assurance, escribe una sola línea con fases discretas de envío del primer factor y assurance, y estado no sensible de la interfaz: aplicación montada, validación HTML del formulario, modo y aria-busy. No registra cuerpos, cabeceras, tokens, emails, passwords, URLs completas ni identificadores. El flujo falla como antes: no reintenta ni oculta errores.

## Interpretación
- Sin solicitud del primer factor: investigar eventos y validez del formulario, bootstrap ligero, montaje de la aplicación y posible bloqueo del navegador.
- Primer factor enviado pero assurance no: investigar respuesta y recuperación del primer factor, timeout del transporte y lifecycle.
- Assurance enviado sin respuesta: investigar cancelación de red, timeout y backend.
- Si llega respuesta y falla la aserción: revisar contrato de seguridad, sin reducir controles.

## Cierre pendiente
Repetir gate remoto con esta instrumentación; identificar causa y corregirla, sin reducir MFA, RLS ni seguridad. La instrumentación en sí no constituye la resolución de la incidencia.
