# IBERFIT M26 Â· Checkpoint RC71.0.3

## Estado verificado antes del checkpoint

- Rama de trabajo: `feature/exercise-intelligence-memory`
- HEAD previo: `0b3916cd079913d626928a01dbe537bfa75c500c`
- RC71.0.3: integrado y aceptado por gate baseline-aware.
- `POSTWRITE_RC71_0_3_RELEVANT=PASS`
- Ãšnica deuda basal conocida: `tests/m26_rc46_route_experience_integration.test.mjs`
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
- Sin gamificaciÃ³n falsa.

### Social
- Privado por defecto.
- Opt-in como direcciÃ³n de producto.
- Sin autopublicaciÃ³n.
- Sin leaderboard pÃºblico por defecto.
- Nunca usar peso, IMC, dolor, IRI o datos sensibles en rankings.

### Ajustes
- Idioma / regiÃ³n.
- Wearables.
- Privacidad.
- Logout real.

## InternacionalizaciÃ³n

`es-CL` significa locale regional EspaÃ±ol (Chile), no un idioma separado.

DecisiÃ³n nueva:
- Separar `language` de `region/locale`.
- UI visible de idiomas:
  - EspaÃ±ol
  - English
  - Deutsch
  - FranÃ§ais
  - PortuguÃªs
- Regiones/locales inicialmente compatibles:
  - `es-CL`
  - `es-ES`
  - `en-US` / `en-GB` segÃºn regiÃ³n
  - `de-DE`
  - `fr-FR`
  - `pt-BR` / `pt-PT`
- No mostrar un idioma como disponible hasta que su bundle estÃ© completo.
- Usar locale para fechas, nÃºmeros, unidades y moneda.
- No acoplar traducciones a lÃ³gica de dominio.
- Fallback canÃ³nico: EspaÃ±ol.
- La arquitectura debe permitir aÃ±adir idiomas sin reescribir renderers maduros.

## Benchmark de producto incorporado

Principios retenidos de apps deportivas/coaching exitosas:
- SesiÃ³n en vivo con fricciÃ³n mÃ­nima.
- Ejercicio y serie actual dominantes visualmente.
- Timer de descanso integrado.
- Valores previos disponibles cuando sean comparables.
- RPE/RIR y variables de ejecuciÃ³n sin romper el flujo.
- Resumen final Ãºtil.
- Progreso longitudinal comprensible.
- Privacidad granular.
- Coaching, hÃ¡bitos, mensajes, progreso y wearables conectados como un sistema.
- Evitar feature sprawl y navegaciÃ³n fragmentada.

IBERFIT debe diferenciarse mediante:
- Coach humano al mando.
- Datos confirmados y provenance.
- No auto-prescripciÃ³n.
- No automatismos sociales invasivos.
- Experiencia premium.
- Inteligencia contextual determinista primero.

## PrÃ³xima ola

`SESSION_LIVE_UX_SOCIAL_OPT_IN_NOTIFICATIONS`

Orden:
1. DiagnÃ³stico read-only del `session-ui.js` local actual y handlers/controladores.
2. Session Live UX premium.
3. Social opt-in granular.
4. Retos mÃ¡s profundos basados en eventos confirmados.
5. Preferencias y arquitectura de notificaciones.
6. InternacionalizaciÃ³n completa por bundles.
7. Ajustes mÃ¡s profundos.

No tocar pagos.

## Regla de seguridad

El working tree local fue la fuente autoritativa al crear este checkpoint. El remoto histÃ³rico no debe usarse para inferir estructura local de archivos maduros sin verificaciÃ³n.