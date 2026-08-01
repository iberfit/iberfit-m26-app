# RC39 · Matriz de QA multidispositivo

No autoriza producción. Debe completarse en `m26-canary.iberfit.cl`.

## Viewports obligatorios

| Familia | Viewport |
|---|---:|
| Android compacto | 320 × 568 |
| Android estándar | 360 × 800 |
| iPhone moderno | 390 × 844 |
| iPhone grande | 430 × 932 |
| iPad vertical | 768 × 1024 |
| iPad Air vertical | 820 × 1180 |
| iPad horizontal | 1024 × 768 |
| Portátil compacto | 1280 × 720 |
| Portátil | 1366 × 768 |
| Escritorio | 1440 × 900 |
| Escritorio grande | 1920 × 1080 |

## Cliente

- Una semana híbrida muestra las tres sesiones por fecha.
- La presencial aparece como `Presencial con Coach`, con hora/lugar y sin botón Comenzar.
- La autónoma muestra contenido completo y botón Comenzar.
- Confirmar/Solicitar cambio aparece solo entre 48 h y 2 h antes.
- Google Calendar y `.ics` conservan fecha, hora, lugar y UID.
- No aparece la navegación móvil genérica junto a la barra Cliente.
- El menú Más no tapa el foco, formularios ni el final del contenido.
- Texto al 200 % y zoom al 400 % sin pérdida de acciones.

## Coach

- Hoy ordena las citas del día y muestra confirmaciones/cambios.
- Carlos puede iniciar una presencial, online o autónoma.
- La sesión presencial requiere cita confirmada.
- Una autónoma puede iniciarse aunque no tenga cita.
- Solicitudes de cambio aparecen con motivo y resolución.
- En iPad se mantiene el rail lateral; en teléfono se usa navegación móvil.
- Recuperación tras bloqueo, cambio de aplicación y pérdida de red.

## Multirrol

- `iberfit.cl@gmail.com` muestra Coach y Admin después del login.
- No se puede elegir un rol no autorizado.
- Cambiar aplicación no exige contraseña.
- No se permite cambiar con una sesión activa.
- Cerrar sesión elimina el contexto elegido.
- Sin RPC RC39, el login sigue funcionando y las funciones nuevas quedan ocultas.

## Salida

Guardar capturas y resultado PASS/FAIL por viewport antes de autorizar cualquier despliegue fuera de canary.
