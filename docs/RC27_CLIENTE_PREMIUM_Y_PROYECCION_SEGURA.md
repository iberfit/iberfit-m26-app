# RC27 · Cliente premium y proyección segura

## Objetivo

RC27 separa la experiencia Cliente de la lógica editorial del Coach y reduce el estado Cliente a datos expresamente permitidos. No se considera suficiente ocultar controles en la interfaz: el Cliente no debe conservar en memoria notas privadas, metadatos internos, auditorías, costes, credenciales ni copias completas de registros Coach.

## Proyección por lista permitida

`src/m26/security/role-projection.js` aplica una lista explícita de campos por colección antes de construir el estado Cliente. Las colecciones privadas del Coach permanecen vacías. Las colecciones de publicación solo incluyen registros propios y publicados. Las colecciones desconocidas fallan cerradas y no se proyectan.

Las sesiones conservan únicamente los datos necesarios para su ejecución: identificadores, título, objetivo, duración y bloques normalizados. Los bloques no admiten notas internas. Los informes conservan título, periodo, resumen, conclusiones y próximos pasos. Los planes conservan título, objetivo y periodo. Las ejecuciones conservan resultados funcionales, pero no auditorías ni observaciones del Coach.

El auditor rechaza la reintroducción de claves como `body`, `raw`, notas internas, comandos, costes, tokens o secretos.

## Vista Cliente específica

El Cliente recibe tarjetas propias, sin etiquetas editoriales como “Publicado”, “Visible para el cliente”, “Borrador” o “Aprobado”. Cada tarjeta explica el contenido en lenguaje de acción y permite consultar únicamente los detalles destinados al Cliente.

Los informes no repiten el resumen dentro del desplegable. Las sesiones muestran duración, número de bloques y contenido seguro. Cada sesión tiene una acción asociada a su identificador exacto; seleccionar una sesión nunca puede iniciar silenciosamente otra más reciente.

## Vista previa Coach

El Coach conserva la gestión editorial y ve una sección “Así lo verá el cliente”. Esa vista previa se construye con la misma función de lista permitida que la pantalla Cliente. La confirmación de publicación se refiere, por tanto, a una representación real del contenido visible y no a una promesa genérica.

## Seguridad local y límite de alcance

RC27 mejora la defensa en profundidad local, pero no sustituye la seguridad remota. Antes de publicar deben demostrarse con cuentas QA reales:

- identidad derivada de `auth.uid()`;
- RLS por cliente y rol;
- API Cliente sin campos internos;
- denegación de identificadores ajenos;
- comandos Coach inaccesibles para Cliente;
- ausencia de contenido no publicado en las respuestas de red.

## Estado

- Trabajo exclusivamente local.
- Producción no modificada.
- `deployable: false`.
- Sin GitHub, Supabase, Cloudflare o DNS.
