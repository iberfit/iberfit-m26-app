# RC26 · Publicación premium y visibilidad

RC26 separa de forma explícita **aprobar** y **publicar**. Aprobar confirma la revisión interna del entrenador; publicar es la decisión posterior que hace el contenido visible para el cliente.

## Ciclo editorial

- **Borrador**: contenido interno en construcción.
- **Pendiente de aprobación**: revisión profesional pendiente.
- **Aprobado**: revisado, pero todavía invisible para el cliente.
- **Publicado**: visible para el cliente dentro de su propio ámbito.
- **Retirado o archivado**: deja de ser visible y conserva trazabilidad.

Las publicaciones requieren una confirmación expresa de vista previa. Las retiradas, archivos y reaperturas requieren un motivo. Las operaciones editoriales se bloquean sin conexión y nunca se consideran confirmadas por una mutación optimista local.

## Experiencia por rol

El Coach gestiona estados, revisiones y publicación. El Cliente recibe únicamente contenido publicado para su identidad y no ve controles, notas ni estados internos. Esta separación se aplica en navegación, comandos, proyección local de datos y contratos previstos de servidor.

## Informes

El informe premium exige una evaluación IRI trazable, periodo válido, contenido sustantivo y revisión editorial expresa. La aprobación crea contenido interno con formato A4 premium; no lo publica. La publicación posterior sigue siendo una acción independiente.

## Límites de esta validación

La validación local no sustituye las pruebas reales de Supabase, RLS, autenticación, canario, dispositivos ni rollback. Antes de producción deberá demostrarse que la API del Cliente nunca devuelve datos internos del Coach y que un intento directo de acceso cruzado es rechazado en servidor.
