# IBERFIT SIGNATURE 360 · Rediseño visual y funcional integral hasta PRODUCCIÓN

**Inicio:** 16-10-2026. **Base histórica de creación del inventario (no HEAD actual):** Canary `656b9d2aaf6afaf43c0262f7979ba6e962a5a1f2`.
**Estrategia aprobada:** ejecución integral con entregas independientes, pequeñas pero completas y certificadas hasta PROD. **Estado inicial:** WIP aislado. **Destino único de aceptación:** `https://app.iberfit.cl` (PRODUCCIÓN), nunca solo un PR, commit, CI o Canary.
**Precedencia:** seguridad/autorización > integridad/no pérdida de datos > no bloqueos > funcionamiento > UX > rendimiento > belleza visual.
**Fuente canónica existente:** `IBERFIT_NEXT_ULTRAPREMIUM_M41_M45_MASTER.md`, sistema M41, tokens de marca y QA del dispositivo. Este documento añade aceptación integral, no sustituye ni duplica esos contratos.

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
