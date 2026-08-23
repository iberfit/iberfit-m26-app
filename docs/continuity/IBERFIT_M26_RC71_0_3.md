# IBERFIT M26 · Checkpoint RC71.0.3

## Estado verificado antes del checkpoint

- Rama de trabajo: `feature/exercise-intelligence-memory`
- HEAD previo: `0b3916cd079913d626928a01dbe537bfa75c500c`
- RC71.0.3: integrado y aceptado por gate baseline-aware.
- `POSTWRITE_RC71_0_3_RELEVANT=PASS`
- Única deuda basal conocida: `tests/m26_rc46_route_experience_integration.test.mjs`
- `NEW_FAILURES=NONE`
- `SESSION_UI_PRESERVED=YES`
- `PROTECTED_DIRTY_FILES=PASS`
- `UNTRACKED_SET_PRESERVED=YES`
- `NO_REGRESSION_GATE=PASS`
- Pagos: no modificar en esta fase.

## Producto cerrado en RC71.0.3

### Retos
- Derivados de datos confirmados.
- Missing sigue siendo missing.
- Sin progreso inventado.
- Sin gamificación falsa.

### Social
- Privado por defecto.
- Opt-in como dirección de producto.
- Sin autopublicación.
- Sin leaderboard público por defecto.
- Nunca usar peso, IMC, dolor, IRI o datos sensibles en rankings.

### Ajustes
- Idioma / región.
- Wearables.
- Privacidad.
- Logout real.

## Internacionalización

`es-CL` significa locale regional Español (Chile), no un idioma separado.

Decisión nueva:
- Separar `language` de `region/locale`.
- UI visible de idiomas:
  - Español
  - English
  - Deutsch
  - Français
  - Português
- Regiones/locales inicialmente compatibles:
  - `es-CL`
  - `es-ES`
  - `en-US` / `en-GB` según región
  - `de-DE`
  - `fr-FR`
  - `pt-BR` / `pt-PT`
- No mostrar un idioma como disponible hasta que su bundle esté completo.
- Usar locale para fechas, números, unidades y moneda.
- No acoplar traducciones a lógica de dominio.
- Fallback canónico: Español.
- La arquitectura debe permitir añadir idiomas sin reescribir renderers maduros.

## Benchmark de producto incorporado

Principios retenidos de apps deportivas/coaching exitosas:
- Sesión en vivo con fricción mínima.
- Ejercicio y serie actual dominantes visualmente.
- Timer de descanso integrado.
- Valores previos disponibles cuando sean comparables.
- RPE/RIR y variables de ejecución sin romper el flujo.
- Resumen final útil.
- Progreso longitudinal comprensible.
- Privacidad granular.
- Coaching, hábitos, mensajes, progreso y wearables conectados como un sistema.
- Evitar feature sprawl y navegación fragmentada.

IBERFIT debe diferenciarse mediante:
- Coach humano al mando.
- Datos confirmados y provenance.
- No auto-prescripción.
- No automatismos sociales invasivos.
- Experiencia premium.
- Inteligencia contextual determinista primero.

## Próxima ola

`SESSION_LIVE_UX_SOCIAL_OPT_IN_NOTIFICATIONS`

Orden:
1. Diagnóstico read-only del `session-ui.js` local actual y handlers/controladores.
2. Session Live UX premium.
3. Social opt-in granular.
4. Retos más profundos basados en eventos confirmados.
5. Preferencias y arquitectura de notificaciones.
6. Internacionalización completa por bundles.
7. Ajustes más profundos.

No tocar pagos.

## Regla de seguridad

El working tree local fue la fuente autoritativa al crear este checkpoint. El remoto histórico no debe usarse para inferir estructura local de archivos maduros sin verificación.
