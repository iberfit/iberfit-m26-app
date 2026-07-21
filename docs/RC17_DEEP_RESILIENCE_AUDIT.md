# RC17 · Auditoría profunda de resiliencia

## Alcance

Revisión acumulativa de autenticación, origen Supabase, bootstrap, separación por cliente, Command Bus, idempotencia, repositorios offline, recuperación, conectividad, constructor, ejecución, engagement, PWA, build y controles visuales.

## Correcciones cerradas

- El transporte queda fijado al project ref canónico y rechaza identidades o respuestas anómalas.
- El bootstrap Cliente filtra defensivamente colecciones, revisiones y notas privadas.
- Un `operationId` no puede reutilizarse con otro comando ni en vuelo ni en almacenamiento.
- Pausa, reanudación y cancelación envían el snapshot del estado objetivo exacto.
- Las citas de inicio deben estar confirmadas, dentro de la ventana temporal y no vinculadas a otra sesión.
- El constructor valida estructura, IDs, grupos, prescripciones y alternativas antes de publicar.
- Las mutaciones no permitidas offline fallan sin entrar accidentalmente en la cola.
- El catálogo remoto exige 52 definiciones completas, únicas y exactas.
- Los cambios online/offline ocurridos durante una sincronización no se pierden.
- Registros locales corruptos se purgan y las sesiones inválidas no se restauran.

## Límite

Los tests automatizados reducen el riesgo, pero no sustituyen el esquema remoto, cuentas reales, dispositivos físicos ni observación del canario.
