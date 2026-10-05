# IBERFIT · Product Contract

Estado: canónico. Este documento resume decisiones de producto duraderas. Los documentos RC históricos aportan evidencia y contexto, pero no sustituyen este contrato.

## Propuesta de valor

IBERFIT es entrenamiento personal con criterio: diagnóstico, planificación, control y seguimiento.

El producto debe convertir datos y observaciones en decisiones útiles, no limitarse a registrar información.

Bucle de valor:

`señal -> decisión Coach -> intervención -> resultado -> aprendizaje -> siguiente decisión`

## Roles

### Cliente

Objetivo: claridad, motivación, progreso y simplicidad.

Debe responder rápidamente:
- qué tengo que hacer ahora;
- cómo voy;
- qué ha cambiado;
- qué significa;
- qué debo completar o comunicar.

Prioridad móvil. Densidad baja. Sin lenguaje técnico innecesario.

### Coach

Objetivo: velocidad, precisión y mínima fricción durante una sesión real.

Debe favorecer:
- preparación rápida;
- ejecución de sesión;
- ajustes de carga, series, repeticiones y descansos;
- alternativas, progresiones y regresiones;
- comparación histórica útil;
- feedback accionable;
- navegación y edición eficientes con touch y teclado.

El Coach no renombra ejercicios de la biblioteca canónica.

### Admin

Objetivo: control, gestión, trazabilidad y visibilidad.

Debe permitir:
- gobierno de usuarios, roles y datos;
- acceso a biblioteca de ejercicios;
- renombrar y gobernar ejercicios;
- trazabilidad de operaciones;
- observabilidad de configuración y estado;
- gestión con densidad y precisión superiores.

## Persona, IRI y servicio de entrenamiento

Persona, evaluación IRI y servicio de entrenamiento son conceptos relacionados, pero independientes.

- **Persona** = identidad humana y expediente raíz. Puede existir sin contratar entrenamiento.
- **Evaluación IRI** = episodio de evaluación realizado a una persona. Una persona puede tener cero, una o varias evaluaciones IRI.
- **Cliente IBERFIT** = persona con un servicio de entrenamiento contratado/activo.
- Realizar un IRI nunca convierte automáticamente a una persona en cliente activo.
- El IRI es el camino recomendado de entrada a la metodología IBERFIT, no un requisito técnico para planificar o empezar a entrenar.
- Un cliente puede iniciar entrenamiento con el IRI pendiente, diferido o no previsto por ahora, sin bloqueos artificiales.
- La primera evaluación IRI constituye la **evaluación inicial / punto de partida** cuando existe.
- Las evaluaciones IRI posteriores son **reevaluaciones** comparables cuando el protocolo lo permite.
- Seguimiento/evolución = cambio longitudinal durante el proceso; no debe confundirse con el episodio de evaluación.
- La categoría histórica `iri_only` / «Solo IRI» es compatibilidad de migración, no una relación de servicio futura ni un segundo motor IRI.
- La activación del entrenamiento debe cambiar la relación de servicio de la misma persona, sin duplicarla ni recrear su IRI.

La fotogrametría es una capa complementaria, privada y longitudinal; no un diagnóstico clínico automático.
- Original fotográfico y análisis derivado deben permanecer separados.
- Los landmarks automáticos, cuando existan, son propuestas; el Coach valida/corrige antes de convertirlos en dato interpretado.
- La calidad del dato y el protocolo deben ser visibles.
- Las fotos no se incluyen por defecto en reportes compartibles.
- Protocolos de capacidad funcional distintos no comparten baremos automáticamente; 1MSTS y YMCA 3-min deben tratarse como protocolos diferentes.

No usar «baseline» en UI. Preferir «evaluación inicial», «punto de partida» o «referencia inicial».

No mezclar evaluación IRI y seguimiento en copy, navegación, métricas ni interpretación. Separar siempre dato, interpretación y decisión.

## Entrenamiento

IBERFIT debe soportar el trabajo real de entrenamiento personal:
- planificación;
- ejercicios y variantes;
- series, repeticiones, carga y descansos;
- progresiones y regresiones;
- alternativas si un ejercicio no se completa;
- biseries, triseries, circuitos, AMRAP y Tabata cuando corresponda;
- feedback y adherencia;
- historial y evolución;
- observaciones del Coach.

La velocidad durante una sesión real es una prioridad de producto.

## Métricas y gráficas

No añadir métricas porque estén disponibles.

Toda métrica debe:
1. tener significado;
2. ser interpretable;
3. apoyar una decisión;
4. indicar unidad, periodo y ausencia de datos;
5. evitar inferencias clínicas automáticas no justificadas.

Las gráficas deben facilitar comparación, tendencia y siguiente acción.

## Genio IBERFIT

El onboarding debe ser dinámico y contextual, no un cuestionario lineal de pasos.

El Genio IBERFIT:
- aparece cuando aporta valor;
- explica la interfaz en contexto;
- guía sin bloquear;
- recuerda progreso relevante;
- no sustituye decisiones profesionales del Coach;
- no se convierte en un asistente invasivo permanente.

## Experiencia por dispositivo

- desktop = construir y analizar;
- tablet = entrenar y operar;
- móvil = actuar y completar.

Responsive no significa la misma interfaz comprimida. Las tareas críticas deben seguir siendo cómodas con mouse, touch y teclado.

## Estados obligatorios

Todo flujo importante debe contemplar, cuando aplique:
- loading;
- success;
- empty;
- error;
- retry/recovery;
- offline/sync;
- conflict.

No se considera terminado un flujo que sólo cubre el happy path.

## Seguridad y confianza

Seguridad y facilidad de uso deben coexistir.

Especialmente:
- separación Cliente/Coach/Admin;
- autorización real en backend/RLS/RPC, no sólo UI;
- sesiones robustas;
- recuperación segura;
- mínimo acceso a datos;
- secretos fuera del cliente;
- fail-closed para privilegios;
- trazabilidad proporcional al riesgo.

## Calidad de lanzamiento

Una mejora no está terminada por existir en código, PR o Canary.

El cierre real exige funcionamiento verificado en `https://app.iberfit.cl` cuando la tarea esté destinada a producción.

Ver `docs/DEFINITION_OF_DONE.md` y `docs/RELEASE_POLICY.md`.
