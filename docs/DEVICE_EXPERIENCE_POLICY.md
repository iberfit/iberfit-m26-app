# IBERFIT · Device Experience Policy

Estado: Phase A GREEN · Phase B foundation activa
Fecha: 2026-10-05

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

**Coach post-WebAuthn recurrente = GREEN.** Desde el 20/09/2026, el workflow `IBERFIT Coach WebAuthn Recurring` ejecuta en cada push a `canary/rc74-4` una certificación aislada y autocontenida sobre fuente actual y QA real. El ciclo:
- obtiene autorización mediante GitHub OIDC limitada al repositorio, rama, workflow, SHA y run actuales;
- resetea únicamente el estado WebAuthn/assurance de la fixture `qa.rc74.coach@iberfit.cl`, que debe permanecer sin clientes asignados;
- completa registro WebAuthn real mediante virtual platform authenticator;
- verifica que el workspace Coach sólo queda accesible después del assurance;
- cierra sesión y realiza un segundo login para completar `authentication-options` + `authentication-verify` con la misma credencial;
- valida el shell Coach en desktop, tablet portrait, tablet landscape y móvil;
- ejecuta cleanup obligatorio y deja 0 credenciales WebAuthn activas, 0 challenges y 0 assurances activas.

La primera evidencia recurrente GREEN quedó registrada en el run `35547888935` sobre Canary `b079361169a22e9f019a5df02feabf0118f89f35`. El job live, el contrato y el gate final terminaron en `success`; la comprobación independiente posterior confirmó estado residual cero en QA. No se usa bypass de MFA ni `service_role` en GitHub Actions.

### Admin
Phase A certifica de forma recurrente mediante fixture sintético canónico:
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

**Admin autenticado real recurrente = GREEN en Canary.** El workflow dedicado `IBERFIT Admin WebAuthn Recurring` ejecuta en cada push a `canary/rc74-4` una certificación aislada sobre fuente actual y QA real. La ceremonia:
- usa GitHub OIDC limitado al workflow/branch/run autorizado para preparar temporalmente la fixture multiapp `qa.rc74.client-a@iberfit.cl`;
- exige contraseña + registro WebAuthn real en el primer acceso y autenticación con la misma credencial en el segundo;
- mantiene Client/Admin inaccesibles hasta completar assurance y exige elección explícita de la app Admin;
- valida Admin autenticado en desktop, tablet portrait, tablet landscape y móvil;
- comprueba navegación/touch real, ausencia de overflow horizontal y consola/page errors limpios;
- permite solo bootstrap/lecturas autorizadas y registra `businessMutationsPerformed:false`;
- ejecuta cleanup obligatorio y exige 0 credenciales, challenges, assurances y rol Admin temporal residual.

En pull requests no se exponen secretos ni se ejecuta la ceremonia live: únicamente se valida el contrato. La evidencia real recurrente pertenece al push confiable de Canary. Esto evita convertir una fixture sintética o un PR no confiable en prueba de autenticación.

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
- **YELLOW**: evidencia parcial o sintética explícita, o cobertura real existente pero todavía no recurrente.
- **RED**: regresión demostrada o gate crítico fallido.

Nunca convertir YELLOW en GREEN por wording, screenshot o ausencia de fallos.

## Fases

### Phase A
Unifica en gates recurrentes:
- Cliente QA real;
- Coach fail-closed antes de WebAuthn y certificación post-WebAuthn real recurrente en gate dedicado;
- Admin sintético con tareas reales + gate Admin autenticado/WebAuthn recurrente separado en push confiable de Canary;
- PWA upgrade;
- cuatro perfiles principales donde aplica.

La matriz sintética Admin del Device Gate sigue siendo una prueba de interacción/layout. La evidencia de autenticación real recurrente procede exclusivamente de `IBERFIT Admin WebAuthn Recurring`; no se mezclan ambas semánticas.

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

La UI Coach de esta capa se etiqueta `synthetic-post-assurance-ui`: valida el workspace que debe existir después del assurance, pero **no** suplanta WebAuthn ni constituye por sí sola la evidencia auth GREEN. La evidencia recurrente post-WebAuthn real procede exclusivamente de `IBERFIT Coach WebAuthn Recurring`.

Admin se etiqueta `synthetic-authorized-ui`: valida tareas y responsive. Esta fixture **no** se presenta como evidencia auth; la autenticación Admin real recurrente queda cubierta por el workflow dedicado de Canary.

#### Pendiente para cerrar Phase B
1. teclado virtual/orientación/modales/scroll largo en tareas críticas.
2. error recovery task-level con estados de red y reanudación.
3. ampliar PWA a tablet landscape si la tarea instalada lo requiere.
4. mantener la ceremonia Admin/Coach recurrente alineada con la fuente actual y cleanup fail-closed.

## Regla de producto

Una mejora que se vea correcta en cuatro viewports pero obligue al usuario a realizar la misma secuencia ineficiente en todos ellos **no pasa la definición de experiencia multidispositivo premium**.
