# IBERFIT M26 · RC24 · Cierre funcional integral

RC24 continúa desde RC23 y permanece exclusivamente local.

## Correcciones funcionales

- La edad usada por el Motor IBERFIT deja de ser un valor fijo de demostración.
- La edad se deriva de la fecha de nacimiento del expediente y de la fecha actual del contexto.
- Si falta una fecha de nacimiento válida, la generación de propuestas queda bloqueada de forma explícita.
- La Biblioteca muestra y permite buscar los 367 ejercicios canónicos, no solo los primeros 120.
- La búsqueda conserva los alias históricos, los nombres en castellano y la insensibilidad a tildes.

## Límites de validación

No se ha desplegado, no se ha conectado a Supabase real y no se han realizado pruebas físicas. Los gates remotos siguen cerrados.
