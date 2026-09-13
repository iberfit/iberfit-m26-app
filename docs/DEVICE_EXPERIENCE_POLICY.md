# IBERFIT · Device Experience Policy

Estado: Phase A GREEN · Phase B foundation activa
Fecha: 2026-09-13

## Principio

Responsive no significa únicamente reducir columnas. IBERFIT debe adaptar la experiencia a la tarea dominante de cada dispositivo:

- **Desktop = analizar y construir.**
- **Tablet = entrenar y operar.**
- **Móvil = actuar y completar.**

## Matriz mínima

### Cliente
Debe certificar en:
- 1440×1000 desktop;
- 1024×1366 tablet portrait;
- 1366×1024 tablet landscape;
- 390×844 móvil.

Tareas:
- auth real QA;
- shell interactivo;
- navegación real;
- Progreso / Cliente 360;
- Settings y controles nativos;
- focus y select tras rerender;
- scroll sin bloqueo;
- sin overflow horizontal relevante;
- errores de consola/red críticos = 0.

### Coach
Phase A certifica:
- login QA real;
- privilegio detectado;
- WebAuthn obligatorio;
- shell privilegiado inaccesible antes de assurance;
- gate visible y sin bypass;
- misma matriz de dispositivos.

**No declarar post-WebAuthn GREEN** hasta disponer de un mecanismo QA seguro y reproducible que complete la ceremonia y deje el workspace Coach operativo sin relajar el contrato de seguridad.

### Admin
Phase A certifica mediante fixture sintético canónico:
- desktop;
- tablet portrait;
- tablet landscape;
- móvil;
- formularios;
- inputs/select;
- focus/rerender;
- gestión de usuario;
- wizard de alta de cliente;
- layout y navegación.

**No declarar Admin autenticado real GREEN** mientras no exista una cuenta QA Admin autorizada para esa suite.

### PWA
Suite separada:
- desktop;
- tablet;
- móvil;
- upgrade N-1 → N;
- continuidad de datos locales;
- no cross-release JS;
- no reload loop;
- shell usable durante actualización.

## Estados

- **GREEN**: tarea real certificada en el contexto declarado.
- **YELLOW**: evidencia parcial o sintética explícita.
- **RED**: regresión demostrada o gate crítico fallido.

Nunca convertir YELLOW en GREEN por wording, screenshot o ausencia de fallos.

## Fases

### Phase A
Unifica en un gate:
- Cliente QA real;
- Coach hasta WebAuthn fail-closed;
- Admin sintético con tareas reales;
- PWA upgrade;
- cuatro perfiles principales donde aplica.

### Phase B

#### Foundation V1
Añade una matriz de tareas de fuente actual sobre las cuatro superficies para evitar que el gate sea sólo “renderiza en varios tamaños”.

Valida explícitamente:
- Cliente: Hoy, Progreso, sesión live y feedback.
- Coach: Hoy, Clientes, Expediente y Programar.
- Admin: Usuarios y alta de cliente.
- ausencia de overflow horizontal;
- navegación acorde al dispositivo;
- ruta de foco real;
- acciones táctiles materialmente utilizables;
- interacción del wizard/gestión Admin;
- capturas y métricas por tarea/dispositivo.

La UI Coach de esta capa se etiqueta `synthetic-post-assurance-ui`: valida el workspace que debe existir después del assurance, pero **no** suplanta WebAuthn ni convierte esa evidencia en auth GREEN.

Admin se etiqueta `synthetic-authorized-ui`: valida tareas y responsive, pero **no** afirma autenticación Admin real.

#### Pendiente para cerrar Phase B
1. Coach post-WebAuthn real y reproducible en desktop/tablet portrait/tablet landscape/mobile, sin bypass.
2. Admin autenticado QA real en desktop/tablet/móvil.
3. teclado virtual/orientación/modales/scroll largo.
4. error recovery task-level con estados de red y reanudación.
5. ampliar PWA a tablet landscape si la tarea instalada lo requiere.

## Regla de producto

Una mejora que se vea correcta en cuatro viewports pero obligue al usuario a realizar la misma secuencia ineficiente en todos ellos **no pasa la definición de experiencia multidispositivo premium**.
