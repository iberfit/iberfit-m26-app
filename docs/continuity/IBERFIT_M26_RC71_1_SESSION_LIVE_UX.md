# IBERFIT M26 · RC71.1 · Session Live UX

## Objetivo
Convertir la ejecución ya funcional de sesiones en una experiencia móvil premium, priorizando la acción correcta en cada momento sin alterar la lógica de prescripción ni inventar datos.

## Alcance
- Preflight claro antes de iniciar.
- Jerarquía de ejercicio actual, serie y progreso.
- Progreso por series realmente registradas.
- Descanso como estado visual dominante cuando corresponde.
- Siguiente acción visible solo después de registrar la serie.
- Eliminación del avance inválido antes de completar la serie.
- Objetivo, prescripción, claves técnicas y memoria de rendimiento conservados.
- Cierre con tiempo, series, ejercicios y feedback.
- Estados sync/offline/conflicto preservados.
- Pausa, cancelación, sustitución y navegación previa preservadas.
- Sin auto-prescripción, cargas automáticas ni PB inventados.

## Benchmark aplicado
Se retienen patrones maduros de workout trackers actuales: referencia previa visible, descanso integrado, RPE durante el registro, siguiente acción clara y baja fricción móvil.

IBERFIT mantiene como diferenciadores el Coach humano, provenance de datos, control explícito de cambios y ausencia de automatismos clínicos o de prescripción.

## Archivos objetivo
- `src/m26/workflows/session-ui.js`
- `src/m26/design/role-surfaces.css`
- `tests/m26_session_execution_ui.test.mjs`

## Gate
La ola debe partir de `5f46ff9c4612f470dc6d809c35eed99677505084`, aislar la deuda baseline antes de mutar, pasar Session Execution, no crear nuevos fallos, preservar untracked y hacer commit/tag/push atómico solo si todo pasa.

## Próxima ola
1. Social opt-in granular.
2. Notificaciones y preferencias.
3. Internacionalización por bundles (`es`, `en`, `de`, `fr`, `pt`) separando idioma de región/locale.
4. QA de recorrido completo y cierre de deuda RC46 antes del gate de lanzamiento.
