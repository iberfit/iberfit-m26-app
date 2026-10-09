# IBERFIT · Acceso sin pérdida durante la transición bootstrap → aplicación

La primera pantalla de acceso es funcional antes de terminar de cargar el módulo de aplicación. Al completarse `mount()` sin una sesión guardada, la UI se reconstruye con `authMessage()`. Esto descarta los valores y el foco si un cliente ya estaba escribiendo. El efecto es especialmente perjudicial en teléfonos/tablets lentos y puede impedir que salga la petición del primer factor sin que Supabase vea un error. **No se asume que sea la causa confirmada de #821**.

Se incorpora un traspaso **síncrono, único y en memoria** para correo, contraseña y foco de los dos campos únicamente en ese primer render de la aplicación completa. No se utiliza almacenamiento, log ni evento de telemetría con credenciales. Si el login mínimo ya está ocupado (`aria-busy=true`) el traspaso no copia nada; si la pantalla nueva no es el formulario de login, tampoco. Un formulario ya rellenado por autofill no se sobrescribe.

No cambia transport, Auth RPC, MFA, RLS, gestión de cookies o sesiones. Las pantallas de error, recuperación, MFA y logout mantienen el comportamiento previo y nunca heredan credenciales por esta función.

Cobertura: tests deterministas de continuidad, foco, cursor, login en vuelo, autofill y privacidad; ejecución del CI/Device gate, Canary Exact Deploy y promoción productiva exacta antes de considerar completado.
