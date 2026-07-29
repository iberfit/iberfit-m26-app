# IBERFIT M26 · Auditoría profunda IRI y aplicación Cliente · RC36

Base protegida: `canary/rc35` · `5c1c6268dbc3c2e3696ff0376c5115330b9d61f0`

## Deficiencias corregidas en esta entrega

1. El informe IRI representaba fórmulas heurísticas internas en un radar de apariencia cuantitativa. Se elimina y se sustituye por evidencia explícita, estado, cantidad de registros, validez y limitaciones por área.
2. El resumen utilizaba “Resultado global” aunque el producto había eliminado la puntuación global. Se reemplaza por “Lectura integrada · Sin puntuación global”.
3. La interfaz mezclaba un proceso de 7 etapas con “3 dominios” sin explicar que eran conceptos distintos. Se distingue proceso de evaluación y dominios objetivos de resultado.
4. El modelo no exponía de forma fiable `confirmed` ni el estado de las 7 etapas. Se añade un estado explícito derivado de la confirmación remota.
5. El campo de grasa corporal era obligatorio en HTML aunque la validación del dominio aceptaba cualquier medición corporal objetiva. Se elimina esa contradicción.
6. La bioimpedancia se registraba con campos libres poco orientados. Se estructura el método, el equipo/modelo y las condiciones de medición.
7. El inicio de Cliente reutilizaba la prioridad del Coach y podía pedir al cliente “Iniciar diagnóstico IRI”, una acción que no le corresponde. Se sustituye por bienestar, plan o próxima cita.
8. El inicio de Cliente no ofrecía una ruta directa y comprensible. Se añaden accesos a bienestar, planificación, sesiones, progreso e informes.
9. Los vacíos de agenda para Cliente eran genéricos. Se aclara qué aparecerá cuando el entrenador confirme una cita.
10. RC36 no estaba reconocido por CI. Se añade validación y evidencia propia sin declarar despliegue.

## Salvaguardas conservadas

- Las notas privadas y la inteligencia del entrenador no se incorporan a la vista Cliente.
- Aprobar y publicar siguen siendo operaciones separadas.
- Los datos ausentes no se convierten en cero.
- La bioimpedancia se describe como estimación dependiente del método y las condiciones, no como juicio personal ni diagnóstico.
- RC35 permanece intacto y desplegado hasta completar los gates de RC36.

## Pendientes externos antes de desplegar RC36

- CI verde sobre `canary/rc36`.
- Gate remoto autenticado y aislamiento Coach / Cliente A / Cliente B.
- Prueba Cliente: bienestar, hábitos, apertura del plan, inicio y finalización de sesión, informes, cierre y reapertura.
- QA móvil y escritorio, incluido teclado, foco, desplazamiento y navegación inferior.
- Generación del runtime RC36 y despliegue únicamente en el proyecto canary.


## Integración visual definitiva del informe

11. El informe anterior tenía una estética correcta pero insuficientemente diferenciada para el posicionamiento premium de IBERFIT.
12. La portada utilizaba un sello circular que deformaba la relación natural entre isotipo, logotipo y claim. RC36 V2 utiliza el isotipo real como imagen independiente, acompañado por el wordmark y «Entrenamiento personal con criterio».
13. Las cabeceras podían quedar ajustadas cuando el título o subtítulo aumentaban. Las pestañas nuevas usan una cuadrícula con columna flexible, salto controlado y protección explícita contra desbordamiento.
14. El fondo se unifica en crema con profundidad mediante degradados, verde bosque y dorado IBERFIT. Los bloques oscuros se reservan para contenido de alta jerarquía.
15. El isotipo se utiliza como marca de agua discreta y no interfiere con resultados ni textos.
16. Métricas, evidencia por áreas, bioimpedancia, movilidad, fuerza, cardio y plan inicial comparten una jerarquía editorial coherente.
17. La versión Cliente mantiene exactamente 7 páginas A4 y la versión interna conserva su extensión y trazabilidad.
18. La estética no reintroduce puntuaciones globales, percentiles ni gráficos heurísticos no normativos.

## Pruebas visuales automatizadas añadidas

- Presencia del marcador `m26-premium-report-v2`.
- Activación de `PREMIUM_RC36_CSS`.
- Lockup de marca con isotipo, wordmark y claim.
- Pestañas flexibles y reglas contra solapamientos.
- Paleta crema, verde bosque y dorado IBERFIT.
- Marca de agua y portada premium.