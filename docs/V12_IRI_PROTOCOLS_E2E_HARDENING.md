# IBERFIT V12 - Protocolos IRI integrados y cierre E2E

## Base protegida

- Rama objetivo: `canary/rc36`.
- Commit de rollback: `88af574c4a983bbccca4838ee49a86ba6317e50b`.
- No se modifica `main` ni los dominios de producción.
- Los cambios son aditivos y mantienen los contratos remotos existentes.

## Recorrido validado

`Alta QA -> expediente -> IRI -> informes -> planificación -> publicación -> sesión -> cita -> portal Cliente -> ejecución -> responsive`.

El alta conserva el formulario ante errores, identifica los campos obligatorios pendientes, enfoca el primer control inválido y no anuncia éxito sin persistencia remota comprobada.

## Protocolos IRI V12

Cada prueba puede abrir su protocolo técnico sin abandonar la evaluación. El protocolo incluye:

- capacidad evaluada y límites de interpretación;
- material, configuración y posición inicial;
- ejecución paso a paso;
- observaciones del Coach;
- criterios de validez e invalidación;
- criterios de suspensión;
- datos que deben registrarse;
- interpretación compatible con el protocolo;
- esquema propio de posición inicial y final;
- secuencia visual animada y ejemplos válidos e inválidos.

El catálogo se versiona como `iri-protocols-2026.07-v1`.

## Trazabilidad y reevaluación

Cada resultado conserva:

- identificador y nombre exacto de la prueba;
- área, variante y configuración;
- lado;
- fecha y versión del protocolo;
- validez;
- motivo de adaptación o suspensión;
- resultado bruto estructurado.

La aplicación advierte cuando una reevaluación cambia de versión, variante o configuración y evita presentar esos resultados como directamente comparables.

## Informes

- Cliente: 7 páginas A4 verificadas. Explica qué se observó, por qué importa, el resultado y la decisión de entrenamiento.
- Coach/Admin: 14 páginas base más anexos íntegros. Incorpora una tabla de trazabilidad por prueba.
- La impresión elimina páginas en blanco provocadas por rellenos externos y conserva una página A4 por sección.

## Regresión y QA

- Suite completa: 410 pruebas; 409 aprobadas, 0 fallidas y 1 omisión prevista.
- Gates RC29, RC35 y RC36: aprobados.
- Build: aprobado.
- Grafo: 74 módulos, 0 ausentes.
- E2E en Chromium: recorrido Coach y Cliente completo, sin errores de consola.
- Responsive: 360, 768, 1024 y 1440 px sin desbordamiento horizontal.
- PDFs renderizados y revisados visualmente; preflight correcto.

## Despliegue

El despliegue se realiza mediante avance normal de `canary/rc36`, sin `--force`. Cloudflare Pages debe construir el commit exacto y publicar únicamente `m26-canary.iberfit.cl`. El service worker RC36 cambia a `m26-rc36-canary-v2` para evitar reutilizar la caché anterior.
