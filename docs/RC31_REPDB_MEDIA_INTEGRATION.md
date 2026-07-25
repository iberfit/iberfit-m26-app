# RC31 · Integración visual RepDB

## Alcance

Este bloque incorpora el snapshot gratuito de RepDB como recurso visual interno de la aplicación IBERFIT. No reemplaza el catálogo canónico ni modifica los identificadores `exercise_id`.

## Reglas

- El ID IBERFIT sigue siendo la fuente principal.
- RepDB se almacena como mapping externo.
- El Cliente solo puede recibir coincidencias A o B.
- Las candidatas C son visibles únicamente para revisión del Coach.
- Sin imagen es preferible a una asociación incorrecta.
- No se incluyen archivos de `upgrade-samples/`.
- La atribución visible es obligatoria.
- Los WebP se sirven localmente para funcionar sin conexión.
- El isotipo se superpone mediante CSS; las imágenes originales no se reescriben.

## Atribución

Exercise data by [RepDB](https://repdb.co/free-exercise-dataset)

## Archivos

- `public/vendor/repdb/images/flat/`
- `public/vendor/repdb/free.es.json`
- `public/vendor/repdb/free.en.json`
- `public/vendor/repdb/iberfit-media-map-v2.json`
- `public/vendor/repdb/iberfit-exercise-media.css`
- `src/m26/library/exercise-media.js`

## Pendiente de este mismo RC

Conectar `resolveExerciseMedia()` con:

1. la ficha de biblioteca Coach;
2. el constructor de sesiones;
3. la vista previa de publicación;
4. la ejecución guiada Cliente;
5. Créditos/Acerca de.

La conexión visual se hará después de auditar las funciones exactas de renderizado del RC31.
