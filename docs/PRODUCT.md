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

## IRI y seguimiento

El Diagnóstico IRI inicial y el seguimiento/evolución son conceptos distintos.

- IRI = punto de partida, bienvenida y baseline.
- Seguimiento = cambio longitudinal durante el proceso.

No mezclar ambos en copy, navegación, métricas ni interpretación.

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
