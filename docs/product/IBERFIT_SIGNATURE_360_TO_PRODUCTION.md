## Checkpoint vigente · 20-10-2026 · U25 PROD certificado, U26 en rama sin promoción

**Producción vigente U25:** fuente exacta `4c58d70e5f7a984e8bd2663633f7cf9abd68b4e6`, PR #1057 MERGED, Canary Exact Deploy [#39476716519](https://github.com/iberfit/iberfit-m26-app/actions/runs/39476716519) SUCCESS y Production Promotion [#39479637032](https://github.com/iberfit/iberfit-m26-app/actions/runs/39479637032) SUCCESS (M44 fresco, Lighthouse, Chromium, QA y auditoría postdeploy). El scroll horizontal en Admin Centro de Media a 320 px se corrigió y pasó Device Gate antes y después de merge. El bloque U25 usa renderer de producción pero identidad sintética; **no** acredita aceptación funcional de 43 rutas.

**U26 en rama aislada, NO fusionada ni publicada:** ampliar las sesiones reales WebAuthn ya existentes de Coach y Admin con una auditoría de navegación real de rutas profesionales en escritorio 1440 px y móvil 390 px. No hay nueva vía MFA: se usa el broker OIDC y la limpieza existente, las pruebas remotas continúan solo en push confiable de Canary, nunca en PR externo. El auditor comprueba shell del rol correcto, salida de inert, ruta seleccionada, contenido real no placeholder, heading, no overflow y ausencia de peticiones ajenas/mutantes mediante el perímetro preexistente; rutas ocultas o no expuestas permanecen explícitamente sin certificar. Evidencias: áreas técnicas, booleanos y lista de rutas; jamás datos de clientes, tokens ni contraseñas. Estados con datos alternativos, escrituras autorizadas, fallo de red, conflicto y expiración siguen excluidos. **Todas las 43 aceptaciones integrales permanecen pending.**

**Límites:** U26 no cambia Auth, SQL, RLS, Edge, backend ni datos de negocio. Cualquier promoción a producción exige controles premerge y postmerge, SHA exacto Canary en vivo y M44 válido; no se considera completa antes de certificar los flujos reales.

---

## U25 checkpoint · 20-10-2026 · 43 rutas con renderer real y estado sintético

U24 publicado en PROD: SHA exacto `32e02bb0a2bd00cab5b4cd7e18c80ff3058a04b3`, Canary #39444520756 SUCCESS, Production Promotion #39451349112 SUCCESS, M44 restauración aislada certificada.

U25 WIP: fixture opt-in `body=real` que utiliza `createRouteViewModel` + `renderRouteView` productivos para las 43 rutas (Cliente 9, Coach 17, Admin 17), con identidad y colecciones sintéticas y matriz Device Gate a 320/390/768/1024/1440. Verifica composición, contenido, heading, aislamiento de rol, ausencia de bloqueo, overflow y peticiones mutantes. Las pruebas U24 autenticadas y los gates WebAuthn profesionales quedan independientes. No implica aceptación autenticada por pantalla de Coach/Admin, estados poblados, offline, expiración, conflictos, retries, ni escrituras; **43 aceptaciones siguen pending**.

---

## Checkpoint vigente · 20-10-2026 · U23 publicado y certificado en PROD; U24 en revisión de 9 rutas Cliente
**PROD U23:** SHA exacto `65c17b662bd9a70b09261169b6ca8feaf23a469c`, PR [#1055](https://github.com/iberfit/iberfit-m26-app/pull/1055) MERGED. [Canary Exact Deploy #39435366832](https://github.com/iberfit/iberfit-m26-app/actions/runs/39435366832), [Production Promotion #39438915893](https://github.com/iberfit/iberfit-m26-app/actions/runs/39438915893) SUCCESS. M44 encrypted DB+Storage + restore PG17 aislado SUCCESS [#39418044881](https://github.com/iberfit/iberfit-m26-app/actions/runs/39418044881) segundo intento; controles QA, CI, WebAuthn, Device Gate, auditoría, Lighthouse, identidad y Chromium en producción superados.

**U24 (rama, NO fusionado ni promovido):** añadir contratos de cuerpo real y estado observado para las nueve rutas de Cliente a la prueba visual autenticada existente (320/390/1024/1366/1440), bajo la red QA de solo lectura: Hoy, Planificación, Sesiones, Progreso, Informes, Actividad, Mensajes, Retos y Ajustes. Asegurar estado de sesión, ruta sin placeholder, navegación y no overflow, separación IRI/evolución, ausencia de emisión documental no autorizada, sin inicio indebido de sesión, privacidad comunitaria, estados de comunicación y controles de preferencias. Evidencias solo con nombres de área, estados técnicos y booleanos; nunca datos personales ni credenciales. **No se marcan rutas `verified`:** aún faltan comprobaciones completas de estados loading/error/retry/offline/conflict/session-expired, escrituras autorizadas, datos alternativos y aceptación integral por dispositivo/rol.

---

# IBERFIT SIGNATURE 360 · Rediseño visual y funcional integral hasta PRODUCCIÓN

## Checkpoint vigente · 20-10-2026 · U22 certificado en PRODUCCIÓN; U23 en ejecución

**U22 PROD comprobado:** fuente exacta `86a60536595ba8a1cb773c1453b0c6a9988c1ef1`, PR [#1053](https://github.com/iberfit/iberfit-m26-app/pull/1053) y [#1054](https://github.com/iberfit/iberfit-m26-app/pull/1054) MERGED. [Production Promotion #39421889744](https://github.com/iberfit/iberfit-m26-app/actions/runs/39421889744) SUCCESS: manifiesto de fuente exacta, recuperación M44, CI, Lighthouse, browser y comprobación de identidad en vivo de `app.iberfit.cl`. [Android Production Release #39421889748](https://github.com/iberfit/iberfit-m26-app/actions/runs/39421889748) SUCCESS no acredita publicación en Google Play. Canary HEAD coincide con la fuente certificada.

**Correcciones consolidadas:** navegación «Más» accesible y recuperable para tres roles, contratos sintéticos para las 43 rutas y un solo reintento de lectura de bootstrap Coach únicamente frente a HTTP 500/SQLSTATE 57014 exacto, sin reintentar escrituras ni debilitar Auth o RLS. La suite sintética no acredita funcionamiento autenticado de 43 pantallas. No reabrir el P0 U22 por el texto histórico que sigue.

**U23, primera entrega en rama aislada — NO PROMOVIDA:** interacción real de navegación de la shell por controles, foco y Escape, estado `inert`, no recorte de destinos de barra móvil a 320 px, cobertura en anchos 320/390/768/1024/1440 mediante fuente CSS y controlador reales con identidad sintética. Actualizar el baseline documental del inventario sin falsificar aceptaciones: las **43 rutas permanecen `pending`**. Las validaciones autenticadas Cliente/Coach/Admin, rutas y estados de error continúan siendo gates independientes antes de declarar SIGNATURE integral completo. El resultado de U23 solo será entregado tras SHA postmerge, certificación y promoción oficial.

---

## Checkpoint 20-10-2026 · U22 Canary, recuperación P0 de bootstrap Coach

El PR #1053 está integrado en Canary `13a2201b4ae537cc1c3b112e931ee8ae3e3cf7c8`: CI, dispositivo, Cliente, Admin, M44 protegidos SUCCESS; **NO publicado aún en PROD**. Coach WebAuthn real validó la ceremonia de MFA, pero la segunda llamada de arranque `iberfit_bootstrap_v26` falló en QA por HTTP 500 SQLSTATE 57014 (statement timeout autenticado de 8 s). Se repitió en otro intento. La aplicación expuso su recuperación protegida, sin perder credenciales.

El P0 introduce **un único reintento de lectura con el mismo JWT** solo ante el 500/57014 exacto. No reintenta escrituras, errores de autorización ni otros fallos, y conserva el estado recuperable si persiste. Probar con Node y navegador WebAuthn real sobre el nuevo SHA, CI completo, M44 reciente y promoción oficial fail-closed. Las 43 rutas SIGNATURE siguen pendientes de aceptación integral.

---

## Checkpoint histórico · 20-10-2026 · U21 certificado en PRODUCCIÓN, U22 en validación

**U21 PROD:** fuente exacta `d045c6e569d1dd02e454bea200271b9a49b1d822`, PR [#1052](https://github.com/iberfit/iberfit-m26-app/pull/1052), [Production Promotion #39372054403](https://github.com/iberfit/iberfit-m26-app/actions/runs/39372054403) SUCCESS con identidad viva de `app.iberfit.cl`, M44 vigente, CI, Lighthouse, navegador y auditoría read-only. El cierre de Android #39372054429 no confirma publicación en Google Play.

**U22 — trabajo propuesto, NO publicado en este checkpoint:** cerrar bloque de robustez de navegación móvil entre los tres roles; sustituir la semántica incorrecta de menú de aplicación por botones de navegación nativos y restaurar el foco al cerrar «Más» con Escape. En cambios de ruta o rol externos, no mantener abierto el disclosure anterior ni dejar el contenido principal `inert`. Añadir prueba de navegación por las 43 rutas × cinco anchos con entorno sintético y fuente real de la shell, junto a contratos del inventario. El navegador sintético NO acredita autenticación real, contenido funcional de cada área ni estados negativos; todas las rutas siguen pendientes de aceptación integral.

**Invariantes U22:** preservar U21 y anteriores; no cambiar Auth, RLS, esquema, secretos ni escritura backend. CI, Device Experience, Canary Exact Deploy, WebAuthn, Android cuando aplique y promoción exacta con recuperación vigente son condiciones para considerar una release integrada en producción.

---

## Checkpoint histórico · 20-10-2026 · SIGNATURE U20 certificado en PRODUCCIÓN; U21 en desarrollo

**U20 PRODUCCIÓN certificada:** fuente exacta `d8e77ddd35b844617196f98eb5cefd13a1139a07`, merge PR [#1051](https://github.com/iberfit/iberfit-m26-app/pull/1051), [Canary Exact Deploy #39362689347](https://github.com/iberfit/iberfit-m26-app/actions/runs/39362689347) SUCCESS y [Production Promotion #39365028769](https://github.com/iberfit/iberfit-m26-app/actions/runs/39365028769) SUCCESS. La promoción verificó SHA vivo en `app.iberfit.cl`, regresión, Lighthouse, navegador Chromium, auditoría `IBERFIT_CONTINUOUS_AUDIT=PASS` y rollback. Frontend-only: 8 archivos, `unappliedMigrations=0`, `backendWrites=false`, `hostedAuthWrites=false`. También 13 workflows postmerge SUCCESS. El éxito de Android #39365028786 no equivale a publicación comprobada en Google Play.

**Capacidades U20 preservadas:** FC actual con caducidad a los 30 segundos sin nuevas muestras, desconexión/caducidad diferenciadas, referencias históricas honestas, accesibilidad de temporizadores, continuidad de foco y valores reales de cero repeticiones, salida segura ante fallo de persistencia y sincronización manual recuperable. U11–U19 permanecen integrados.

**M44:** [Restauración protegida #39357656908](https://github.com/iberfit/iberfit-m26-app/actions/runs/39357656908) SUCCESS: punto de recuperación cifrado DB+Storage, ensayo aislado PostgreSQL 17 e integridad de objetos. La promoción U20 validó recovery point vigente. No se ha certificado recuperación total de todos los servicios gestionados de Supabase (`platformRecoveryVerified=false`); el gate oficial de frescura máxima de dos horas sigue siendo obligatorio.

**U21 — ultramacrobloque EN DESARROLLO, aún NO en producción:** acceso directo a pausa/reanudación real de Cliente, sin duplicar la pantalla Coach; disposición táctil in-flow de acciones inmediatas y controles RPE; reforzamiento visual diferenciado Cliente/Coach, claridad de resultados observados y regresiones de navegador para 320/390 px, teclado y persistencia de borradores. No tocar Auth, migraciones, RLS ni secretos dentro de este alcance. No declarar U21 entregado hasta aprobar CI, Canary exacto y promoción PROD.

**Cobertura integral pendiente:** `qa/visual/signature-360-coverage.json` mantiene 43 rutas (9 Cliente, 17 Coach y 17 Admin), `evidenceStatus=pending`, `status=WIP_NOT_PRODUCTION`. La certificación de una release incremental no sustituye la aceptación integral de estados negativos, roles y 320/390/768/1024/1440 px.

---

## Checkpoint histórico · 19-10-2026 · U14 en PRODUCCIÓN antes de U15/U16

**PROD y Canary certificados:** `798bc7a7030e82cf971e364daf1d7d91bd327de5`. [Production Promotion #39312618799](https://github.com/iberfit/iberfit-m26-app/actions/runs/39312618799) SUCCESS: identidad de fuente LIVE, regresión integral, Lighthouse, smoke real de entrada desktop/tablet/mobile y evidencia de despliegue/rollback. [Canary Exact Deploy #39311598819](https://github.com/iberfit/iberfit-m26-app/actions/runs/39311598819) SUCCESS sobre el mismo SHA. Diferenciar certificación del pipeline de la comprobación manual independiente no realizada en este checkpoint.

**Incrementos SIGNATURE preservados:** U11–U13 y **U14** (PR #1042, cierre operativo del constructor Coach: estado vacío para iniciar biblioteca, añadir otro ejercicio, guardar borrador y revisar en flujo natural, objetivos táctiles de 48 px sin overlay inferior). U14 superó 11/11 controles de PR, 13/13 postmerge en `0d59d18167341df725072344ddd091211416caec` y llegó a PROD junto con la renovación M44 #1043. No se omitió MFA: la repetición Coach WebAuthn finalizó correctamente.

**Seguridad y restauración:** [M44 Offsite #39311598698](https://github.com/iberfit/iberfit-m26-app/actions/runs/39311598698) SUCCESS con archivo cifrado de DB+Storage y restauración aislada PostgreSQL17. El primer intento de promoción #39310641269 falló de forma segura por `M44_OFFSITE_RUN_TOO_OLD`; la renovación de evidencia y el nuevo release #39312618799 pasaron sin relajar antigüedad ni mutar backend. La restauración integral de servicios alojados/Auth de Supabase no está certificada por ese respaldo: `platformRecoveryVerified=false`.

**Límite de alcance:** `qa/visual/signature-360-coverage.json` conserva 43 rutas con `evidenceStatus=pending` (9 Cliente, 17 Coach y 17 Admin). Las pruebas por incrementos NO equivalen a aceptación exhaustiva de todas las rutas, estados y dispositivos. El programa **SIGNATURE 360 permanece abierto**, aunque U14 ya se sirve en producción. Mantener IRI inicial separado de evolución y preservar la experiencia diferencial Cliente, Coach y Admin.

**Trabajo siguiente U15 (WIP; aún no certificado ni publicado):** robustecer la presentación de FC de sesión real para no convertir datos ausentes en ceros o coordenadas inválidas, añadir regresiones; después continuar la certificación de estados y dispositivos y la eficiencia operativa Coach. Ningún cambio U15 llega a Canary/PROD sin CI y despliegue exacto independientes.

---

## Estado comprobado posterior · 17-10-2026 · Canary certificado, no PROD

La secuencia histórica de WIP que sigue fue escrita antes del merge. **Prevalece este checkpoint:** PR #1019 MERGED, Canary fuente y merge `a497383896043b86548f7fa5781263e2cc71e3d3`; 12/12 workflows postmerge SUCCESS y [Canary Exact Deploy #39078154724](https://github.com/iberfit/iberfit-m26-app/actions/runs/39078154724) con identidad QA-only del SHA servido, escritorio/móvil autenticado read-only y rollback identificado. Cloudflare deployment `bd38c4e3-080c-43f9-a38f-0ad3f9eab8b9`.

El incremento Cliente cubre Hoy, Sesiones, vista previa y ejecución sintética publicada con permisos efectivos, feedback, estados negativos y referencia visual ausente legible; no representa validación de escritura de negocio remota ni publicación en PROD. El inventario mantiene `WIP_NOT_PRODUCTION` y sus 43 rutas pendientes de aceptación integral, con IRI inicial separado del seguimiento.

**Siguiente bloque de SIGNATURE:** Coach, velocidad durante sesiones y controles rápidos realmente utilizables en móvil de 320 px sin solapamientos, bajo CSS canónico, regresión de navegador y evidencia Device Experience del SHA final. No modificar Auth P0 #1017, SQL QA #1006, seguridad ni esquema. La promoción PROD requiere gates independientes y recuperación/custodia verificadas.


**Inicio:** 16-10-2026. **Base histórica de creación del inventario (no HEAD actual):** Canary `656b9d2aaf6afaf43c0262f7979ba6e962a5a1f2`.
**Estrategia aprobada:** ejecución integral con entregas independientes, pequeñas pero completas y certificadas hasta PROD. **Estado inicial:** WIP aislado. **Destino único de aceptación:** `https://app.iberfit.cl` (PRODUCCIÓN), nunca solo un PR, commit, CI o Canary.
**Precedencia:** seguridad/autorización > integridad/no pérdida de datos > no bloqueos > funcionamiento > UX > rendimiento > belleza visual.
**Fuente canónica existente:** `IBERFIT_NEXT_ULTRAPREMIUM_M41_M45_MASTER.md`, sistema M41, tokens de marca y QA del dispositivo. Este documento añade aceptación integral, no sustituye ni duplica esos contratos.

### SIGNATURE · Sesiones publicadas y accesibilidad de referencia ausente (WIP)

La cobertura funcional de sesiones publicadas **ya existe en el SHA `a81f63c9ea42136d08f37347e43e61ee0ce799fd`**: pruebas Playwright de sesiones guiadas autorizadas y supervisadas, vista previa con ejercicios, prescripción, RPE/RIR, ejecución Cliente, registro de series, revocación/solo resumen/pausa, forja de botón rechazada, Coach sin escalada, Chromium/WebKit móvil y capturas 320/390. [Session QA #39074777087](https://github.com/iberfit/iberfit-m26-app/actions/runs/39074777087), **SUCCESS** con datos sintéticos y módulos reales, sin escritura de negocio remota. No equiparar la cuenta sintética a la certificación de sesiones reales de un cliente en producción.

La inspección manual de esas capturas mostró un **defecto reproducible de legibilidad** cuando faltaba una imagen de ejercicio: texto dorado pálido sobre fondo dorado. La siguiente iteración corrige únicamente ese aviso usando tinta bosque oscura sobre oro mate (contraste objetivo al menos 4.5:1), sin crear imágenes falsas ni tapar las instrucciones escritas. Se añade una prueba de contraste **computado en Chromium y WebKit**, además del contrato estático de CSS. Antes de aceptar el incremento exigir el resultado completo del SHA nuevo, capturas 320/390 y la ausencia de regresiones en Sesiones Cliente, Coach y Admin. No desplegar de forma anticipada.

## Checkpoint vigente — 17-10-2026 (no reabrir release anterior)

La **entrega 1/5** ya se integró en la aplicación real: PR #966 y mejora Admin #993; la release incremental posterior preservó sesiones #998/#1014, M44 y M45. SHA certificado en `app.iberfit.cl`: `16fe623215d26bf7d42555fe23bc0d8ec78832b0`. Evidencia live y smoke desktop/tablet/mobile: [Production Promotion #39004291546](https://github.com/iberfit/iberfit-m26-app/actions/runs/39004291546), **SUCCESS**.

Esta certificación **solo cubre las mejoras ya entregadas**, no la aceptación completa de las 43 rutas. El inventario `qa/visual/signature-360-coverage.json` mantiene `status=WIP_NOT_PRODUCTION` como estado **del programa integral**, y las rutas sin evidencia completa continúan `pending`. No cambiar a `PRODUCTION_VERIFIED` ni marcar rutas completas por el mero hecho de haber publicado la base.

**Siguiente entrega activa: 2/5 Cliente.** Primero corregir inconsistencias de acción/destino y preservar la navegación actual; después elevar Hoy, Tu plan, Sesión, Progreso, IRI/Informes, Actividad, Mensajes, Retos y Ajustes con pruebas reales de tarea, estados, dispositivos y datos. Le seguirán Coach, Admin y certificación integral. No introducir una capa genérica de CSS ni tocar seguridad, RLS, migraciones o lógica de sesión para compensar un defecto visual. Cada entrega pasa gates y se promueve por el pipeline oficial antes de considerarse completa.

### Incremento Cliente Hoy · composición editorial (en desarrollo, NO certificado)

A partir de Canary `069ba68298dd57181a62cc88ce6c31112ac92176`, SIGNATURE Cliente Hoy adopta una composición editorial oscura integrada, tras rechazar expresamente la gran superficie blanca observada en capturas reales de QA. Orientación sobre bosque profundo y acción real diferenciada, sin repetición de encabezados ni bloques claros dominantes. La información auxiliar de citas y plan comparte una banda editorial en lugar de tarjetas aisladas; el bloque de salud sin datos pasa a un estado compacto manteniendo la navegación autorizada. La navegación y los estados Solo IRI, entreno pausado, sesión publicada y sin sesiones conservan las mismas decisiones autorizadas. La inserción del contexto de continuidad debe seguir a todo el bloque primario, no quedar desplazada por cambios DOM.

**Estado:** implementación en PR #1019 separada del P0 #1017 y QA-only #1006. SHA de referencia `4009a4fd37ac0fcf28cab001333b0a26ec5cdb1c`: Fast Lane, CI, auditoría, Cliente autenticado, Admin Matrix, Device Experience, evidencia visual y Canary Policy Gate SUCCESS; [captura real QA #39049595003](https://github.com/iberfit/iberfit-m26-app/actions/runs/39049595003). La revisión posterior de calidez y copy voluntario requiere nuevos gates sobre su propio SHA. No implica aceptación completa, merge, Canary o PROD. Las 43 rutas continúan `pending`.

### Incremento Cliente · Planificación y Progreso sin historial (WIP, no publicado)

La evidencia real de QA del cierre móvil `fe066c8be6318aba83b5b553be9dbc88be82d32c` confirmó separación espacial de la barra inferior y contenido, con navegación y acción completa en móviles; 10/10 workflows SUCCESS. La pantalla de Planificación reveló tres KPI de cero sin utilidad y una segunda tarjeta redundante cuando el Coach aún no había publicado sesiones. La pantalla de Progreso mostraba demasiado peso visual para cero registros.

La siguiente revisión agrupa el estado pendiente y dos acciones autorizadas en **una** superficie cálida; mantiene próxima cita confirmada si existe, aunque la semana aún no se haya publicado, y oculta exclusivamente los KPI sin muestras. En Progreso se expresa explícitamente que faltan registros confirmados, con una invitación voluntaria a registrar bienestar o revisar el plan; el Diagnóstico IRI inicial sigue separado del seguimiento. **Cuando sí hay sesiones, citas o registros reales, los KPIs y su detalle permanecen.** QA real verifica 320/390/tablet/desktop, el panel de navegación sin oclusión y los estados condicionales. Estas mejoras no se considerarán certificadas hasta superar CI, pruebas de flujo y captura QA en el SHA posterior exacto.

### Incremento Cliente · Sesiones con criterio (WIP, sin publicación)

Sobre la base certificada `8e25ce8ae5bf8c2b776c3a6208a0396a37abca2f` (10/10 workflows SUCCESS), la siguiente iteración se concentra exclusivamente en **Sesiones Cliente**. La pantalla vacía pasa de error técnico genérico a una orientación cálida y humana, con destinos existentes Planificación y Actividad, sin fabricar sesiones ni CTA de inicio. Las sesiones publicadas distinguen entre entrenamientos autorizados a iniciar y sesiones dirigidas exclusivamente por el Coach; la única ruta de lanzamiento autónomo sigue siendo `Ver sesión → Comenzar entrenamiento`, protegida por el permiso efectivo `actorCanExecuteSession`, la identidad exacta de sesión y los bloques válidos. La lista de sesiones, medios, grupos, calendario, asistencia, historial y cambios no se eliminan ni se simplifican.

El refinamiento visual se aplica exclusivamente a la ruta de Cliente en `src/m26/rc39/rc39.css`: superficies bosque mate, curvas cálidas, texto marfil, chips compactos, foco y controles táctiles de tamaño mínimo; Coach/Admin conservan su composición y operaciones. La evidencia añade navegación y captura de Sesiones al mismo flujo Playwright autenticado en 320/390/1024/1440, más tests negativos de sesiones supervisadas, visibilidad contradictoria y ausencia de ejecución. Esta iteración **no está certificada ni publicada hasta pasar sus propios gates y revisión visual**.

### Sesiones publicadas · certificación visual y de permisos en navegador (entrega siguiente)

Se añade una fixture QA **sintética, aislada y sin credenciales** que genera dos sesiones desde las proyecciones y políticas reales: (A) guiada en app, publicada, visible y autorizada, con prescripción y botón solo después de `Ver sesión`; (B) presencial dirigida por Coach, visible solo como resumen y nunca iniciable por Cliente. Se comprueba que no se filtran notas privadas, ni sesiones ocultas, ni se confunde visibilidad con capacidad de ejecución.

El recorrido del Cliente enlaza esa vista previa al **controlador real de ejecución**, registra una serie y protege frente a doble inicio. Los casos adversos `summary_only`, borrador retirado, ya en curso y semana vacía prueban tanto ausencia del botón como rechazo de un intento de click DOM fabricado mediante la política real. QA multi-dispositivo (Chromium escritorio/tablet/móvil y WebKit móvil), pantallas 390 px, medidas táctiles, ausencia de scroll horizontal y capturas adjuntas al workflow de Session QA.

**Límite explícito:** la transición vista previa → ejecución utiliza un adaptador sintético de QA alrededor de los módulos de producción; **no** demuestra un ACK remoto real de `SESION_INICIAR`, publicación en Supabase, recuperación entre dispositivos ni pruebas autenticadas con una sesión publicada en la cuenta QA. Esas comprobaciones requieren un escenario remoto de datos exclusivamente QA preparado y autorizado, con pruebas de integridad previas y limpieza segura; no se escribirán sesiones en PROD ni en cuentas reales de clientes. Mantener el gate de identidad, los checks remotos existentes y los tests de autorización canónicos.

## 1. Resultado esperado (tres productos, una marca)

- **Cliente:** la primera capa comunica qué toca, por qué, cuándo y cómo avanzar. Editorial, humana, cálida, motivadora sin manipulación ni mensajes de culpa. Sesión disponible alcanzable en <=2 toques. Persona Solo IRI ve diagnóstico, no una falsa suscripción de entrenamiento. IRI inicial separado de evolución.
- **Coach:** velocidad operativa durante una sesión presencial real. Buscar y registrar sin saltos de foco, teclado, scroll o pérdida de cliente seleccionado; trabajo compacto y visualmente sofisticado. Mantener prescripción completa (series, tempo, RPE/RIR, descansos, cardio, circuitos, biseries, triseries, AMRAP, Tabata, sustituciones, revisión y publicación).
- **Admin:** centro de decisiones empresarial y de seguridad, no réplica de la interfaz del Coach ni tabla CRUD como portada. Datos operativos en lenguaje humano, decisiones priorizadas, auditoría accesible, permisos comprobados en backend, confirmación segura ante acciones críticas.

## 2. Dirección gráfica y comportamiento

Paleta estrictamente acorde con `src/m26/design/tokens.css` / fuente de generación: bosque profundo `#0B1310`, `#13221C`, crema `#F5F5F0`, oro sobrio `#C5A059`. No retocar el isotipo ni cambiar fuentes autohospedadas. Inter para la interfaz operativa; serif editorial selectiva para títulos del Cliente. Dorado no significa éxito: los colores semánticos de estados son independientes.

Eliminar ruido **sin eliminar datos ni funcionalidades**: menos tarjetas anidadas, menos bordes redundantes, sin gradientes/neón/glow, sin hover/focus que mueva campos bajo el dedo. Definir y auditar jerarquía tipográfica, contraste, iconografía, estados y espacios; no introducir otra hoja "override final". Consolidar reglas existentes con evidencias de compatibilidad.

### Cada pantalla y estado son parte del programa
El inventario machine-readable `qa/visual/signature-360-coverage.json` contiene **todas las rutas navegables por rol** del contrato actual. Un test Node obliga a actualizar el inventario si se modifica navegación. La presencia en inventario **NO equivale** a pantalla rediseñada ni certificada.

Para **cada ruta** se exige matriz en móvil 320/390px, tablet 768/1024px y escritorio 1440px, además de dispositivo táctil real cuando corresponda. Capturar:
1. Primer acceso, carga, empty, contenido normal, datos extensos, conexión deficiente, error recuperable y reintento.
2. Módulos internos: scroll, pestañas, overlays, diálogos, formularios, teclado físico y virtual, selects nativos, menús "Más", navegación y safe areas.
3. Estado visual y funcional de cada CTA, accesibilidad WCAG 2.2 AA, zoom 200%, contraste, focus-visible, lector de pantalla y reduced motion.
4. Autenticación/sesión expirada, refresh, back/forward, PWA y multi-dispositivo, cuidando idempotencia y persistencia de borradores.
5. Descripciones humanas, datos fiables y trazabilidad: no mostrar éxito por un guardado local, ni permitir iniciar sesión retirada o no publicada.
6. Cambios visuales verificados mediante comparación con la base exacta y pruebas de usuario/tarea; no aceptar solo un screenshot bonito.

### Puntos de control específicos
- **Cliente:** Hoy, Plan, Sesiones/Live, Progreso, Informes IRI, Actividad, Mensajes, Retos, Ajustes, estado Solo IRI, sin servicio, pausa, entrenamiento supervisado/autónomo.
- **Coach:** Hoy, cartera, expediente, IRI, builder y catálogo, borradores/plantillas, aprobación/publicación, agenda, Live, descanso/feedback, progreso, comunicación, herramientas profesionales.
- **Admin:** Command Center, usuarios/roles, CRM, equipo, agenda, operación, auditoría, automatizaciones, analítica, Media, configuración, permisos. Identificadores técnicos solo en divulgaciones avanzadas, nunca como nombre principal de persona.
- **Transversal:** login, WebAuthn/OTP, recuperación, conectividad, PWA, modales, navegación por rol, consentimiento, errores, pagos no disponibles y protecciones RLS.

## 3. Protección del trabajo paralelo

Frente de **solo experiencia y diseño**. No cambiar RLS, migraciones, backups, secretos, release branch ni lógica de sesión sin revisión de dependencias. Los PR en paralelo M44 (#964/#965) y sesiones (#963, creado contra `main`) no deben ser fusionados a ciegas ni modificados desde aquí. Recapturar SHA y conflictos antes de integrar; no duplicar M41 ni M45.

## 4. Definición contractual de terminado — PRODUCCIÓN

Un cierre válido exige **las siete evidencias**:
1. Integración de una macrounidad completa, sin funciones perdidas ni CSS duplicado; pruebas unitarias, integración, E2E, accesibilidad y visual.
2. Auditoría de los tres roles y de las rutas **afectadas por el incremento**, incluyendo sus variantes de diálogo/scroll/dispositivo, con evidencia independiente de aceptación. Para declarar SIGNATURE 360 completo, todas las rutas inventariadas deben estar verificadas. Inventario = cobertura, no aprobación.
3. PR final sobre `canary/rc74-4` rehecho contra SHA actual; branch protection y gates requeridos verdes, incluidos Device Experience y evidencia visual real autenticada.
4. Merge exacto y **Canary realmente desplegado**, SHA certificado por `IBERFIT Canary Exact Deploy`, WebAuthn/QA real cuando sea aplicable; sin bloqueos conocidos.
5. Promoción por la **pipeline existente** `.github/workflows/production-promote.yml`, basada en `release/prod-<SHA>` + `.iberfit/production-release.json`, con garantías de backup/rollback y autorización apropiada. NO desplegar manualmente al margen.
6. Verificar por fuente confiable `https://app.iberfit.cl/m26/version.json` y artefactos de despliegue/rollback que PROD efectivamente sirve el SHA exacto esperado; smoke real de Cliente, Coach y Admin, PWA y navegación, sin mutar datos reales.
7. Comparación postproducción de flujos críticos, métricas de error/rendimiento y confirmación de que la recuperación sigue operativa. Si algún gate falla, **no proclamar PROD listo** y aplicar la política de rollback.

**La palabra "terminado" queda prohibida para estado Draft, PR, CI verde, merge o Canary.** Cada entrega solo queda `INCREMENTO EN PRODUCCIÓN VERIFICADO` tras las siete evidencias; el programa entero solo queda `SIGNATURE 360 COMPLETO EN PRODUCCIÓN` cuando todas las 43 rutas y estados relevantes están verificadas.

## 5. Orden del macrobloque

Trabajar la excelencia de cada rincón bajo un programa único, publicando **incrementos coherentes y certificados**: primera entrega de gramática visual compartida y legibilidad operativa, después Cliente, Coach, Admin y certificación integral. Un incremento de formularios + navegación Cliente + agenda Admin no significa que 43 rutas estén rediseñadas. No publicar ajustes sueltos como si fueran una entrega integral ni esperar al cierre de 43 rutas para publicar lo ya certificado. Cada incremento permanece Draft hasta que su **propio** alcance está íntegro, verde en QA real y sincronizado con el SHA actual de Canary. Tras promoverlo a producción, registrar su SHA y pruebas antes de empezar el siguiente cierre.
