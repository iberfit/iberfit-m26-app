# IBERFIT UNIVERSAL 360 · Mapa maestro de producto web y aceptación piloto
**Revisión: 06/11/2026 · fuente de verdad: GitHub/CI + LIVE PROD + Supabase lectura + App Intelligence (06/11) + Innovation Radar (05/11) + decisiones del proyecto.**

> Este documento **consolida** lo existente y las decisiones anteriores, no declara desplegadas las funciones en revisión ni autoriza datos reales, bypass de RLS o borrados físicos. Prioridad permanente: **aplicación web/PWA** para trabajar ya, sin compras ni distribución nativa. Los wearables nativos se mantienen preparados para una fase futura.

## 1. Punto de partida verificable y límites

- Repo `iberfit/iberfit-m26-app`; rama protegida `canary/rc74-4`. Base UNIVERSAL #1286 integró en Canary SHA `38bd10505387a0fbab4bb84f3747f28308d3b670`.
- PROD `https://app.iberfit.cl` y Canary `https://m26-canary.iberfit.cl` sirven ese **mismo SHA de frontend**, con Supabase **PROD** `pjhmrhejsoofmouedavw` y **QA** `gjztkdwfmunnzhtvxrsu` separados. Release oficial #42231198583 SUCCESS, Lighthouse lab entrada 0,99, LCP mediano ~2115 ms, CLS 0, TBT 0, Chromium productivo 3/3. No extrapolar a velocidad de todas las vistas autenticadas.
- 8 migraciones U30–U60 + V47 owner history instaladas de forma versionada en PROD; 9/9 comprobadas. Restauración DB+Storage cifrada M44 post migración en job #42220157013 (segundo intento) SUCCESS. Restauración global de Auth/servicios externos no equivalente a este resultado.
- **Diferencia funcional consciente:** U60 mantiene su interfaz de ocurrencias activable solo en Canary/QA, y sus dos RPC no tienen EXECUTE autenticado en PROD. **No conceder GRANT sin retirar también el gate de UI y certificar todo el flujo con migración segura**. El entrenamiento web ordinario independiente de citas sigue siendo la ruta productiva.
- **PR única de continuidad #1287:** corregir experiencia inicial wearable y sesión guiada sobre la base productiva; integración mediante un squash y gates exactos antes de nueva promoción. No abrir micro-PR adicionales.
- No hay verificación de hardware Health Connect/HealthKit en este cierre; una web/PWA no obtiene automáticamente esos datos desde el SO. La futura aplicación nativa deberá confirmar permisos, fuente, propietario, sincronización y revocación antes de etiquetar como conectado.

## 2. Criterio de aceptación antes de utilizar la web con clientes

**P0 · Flujo A: Cliente autónomo (running/fuerza/natación/mixto)**
1. Coach selecciona cliente, prepara el borrador, revisa series/descanso/intensidad y publica. Se distingue `publicada` de `disponible`; **sin disponibilidad backend no hay inicio**.
2. Cliente accede por su propia cuenta, encuentra una sola acción principal **«Comenzar entrenamiento»** visible y pulsable en móvil, tablet y escritorio. Un primer clic **abre la sesión correcta**; no requiere cita si está publicada como guiada-en-app autónoma, con visibilidad completa, ejercicio real y autorización server-side.
3. El comando `SESION_INICIAR` obtiene **ACK real**; si falla, no se muestra cronómetro activo falso, aparece causa y reintento recuperable. No crear dos ejecuciones con doble clic, cambio de ruta, sesión suspendida, refresh o red lenta.
4. Cronómetro arranca tras ACK y reanuda desde marca temporal; pausa/reanuda, series/repeticiones/carga/tiempo/distancia, RPE/RIR, descansos, sustitución y omisión se registran con identidad y revisión correctas. El reloj es opcional, nunca una dependencia del entrenamiento.
5. Finalizar exige feedback; `EJECUCION_COMPLETAR` confirmado; no se reenvían mutaciones después del cierre. Tras recarga queda **una sola ejecución** en el historial, con resultados íntegros. Coach independiente verifica progreso y feedback finales.
6. Mismo contrato con pantalla móvil 320/390, tablet táctil, escritorio y web PWA. Ensayar offline/online, 401 refresh, storage cuota, background, cambio de cuenta, error y recuperación. **Nunca presentar un mock como ACK real.**

**P0 · Flujo B: Coach guiando presencial/online**
1. Prescripción y cita válida, cuando el contrato exige cita. Coach acreditado con WebAuthn entra al cliente y sesión correcta.
2. Coach **inicia y controla la ejecución** en la cuenta autorizada; el Cliente solo puede consultar si es coach-led. El temporizador, cambios de serie, descanso y notas responden en vivo.
3. Cierre remoto con feedback y readback del Cliente/Coach; cambios concurrentes se rechazan de forma explícita, no se borran ni pisan progresos.

**P0 · Flujo C: quitar/borrar sesiones sin perder historial**
- **Borrador nunca publicado:** «Descartar borrador» con confirmación, borrado de copia sincronizada antes de copia local, dueño/cliente comprobados, no destruir sesiones publicadas.
- **Sesión publicada:** acción Coach **«Retirar sesión»** con motivo y confirmación. Es un **borrado lógico**: desaparece de la planificación activa del Cliente, pero se conservan receta original, comandos, auditoría y ejecuciones completadas. Admin/Cliente no pueden elevarse al rol Coach mediante el frontend.
- **En curso:** no retirar; primero finalizar/cancelar ejecución y resolver cualquier cita, bloqueo y fecha activa. Datos ambiguos o revisiones concurrentes = denegar con mensaje/reintento.
- **Sesiones U60 en varias fechas:** no permitir retirada si hay ocurrencias no terminales. No ejecutar DELETE CASCADE de sesiones, ejecuciones ni citas, ni solicitar eliminación masiva de cuentas reales sin autorización y copia recuperable.
- Prueba mínima: retirar una sesión sintética de QA tras finalización, comprobar que no aparece iniciable en Cliente y que el histórico completado sigue en Coach. Ensayar cita cancelada y cita confirmada.

**P0 · Flujo D: acceso y experiencia premium**
- Primer y segundo login Cliente/Coach/Admin; renovación JWT, WebAuthn, regreso de segundo plano, pérdida de red y cambios de rol sin bucles; UX loading/success/empty/error/retry.
- Cliente: acción principal y progreso comprensibles; Coach: búsqueda/edición táctil rápidas y visibilidad de estados; Admin: control, trazabilidad y no apropiación de cuentas. Navegación y acciones comprobadas con teclado y touch, safe areas, modales, foco, zoom, scroll y sin overlays.
- En QA de historial masivo los clics autenticados de navegación Coach registraron ~7–9 s en el gate; no confundirlo con producción. El bootstrap SQL acumulado en PROD tenía media ~80 ms versus QA ~950 ms en una muestra de otro tamaño; medir **tiempo real de clic a pantalla**, no inferir SLA desde SQL.

## 3. Wearables: decisión WEB AHORA / NATIVO DESPUÉS

**Web/PWA ahora**: no comprar servicios ni prometer acceso directo al reloj; ofrecer **Dispositivos** de forma clara, consentimientos, importación explícita donde esté certificada, fecha/fuente/frescura/calidad, estado «Sin sincronización automática confirmada» cuando corresponda. Los datos previos no demuestran conexión actual. Entrenar y guardar manualmente debe funcionar aunque no haya reloj ni datos recientes.

**Nativo futuro**: reutilizar Connected360 V47, contratos de fuentes/propiedad, Android Health Connect, HealthKit y canal seguro, con consentimiento granular, permisos SO independientes, readback, idempotencia/deduplicación, revocación, permisos denegados y cuentas múltiples. No clasificar una observación de wearable como entrenamiento IBERFIT ejecutado; no usar Bluetooth genérico del navegador como sustituto.

**Alcance factual PROD actual:** hay consentimiento y datos de salud históricos en la cuenta piloto, pero ninguna sincronización automática nueva certificada; la web no debe presentar esas filas antiguas como «enlace activo». La PR #1287 aborda especialmente esta fricción; su merge/deploy **no certifica** instalación nativa ni una medición física.

## 4. Cartera de 22 capacidades (fuente: BACKLOG UNIVERSAL + Innovation/Intelligence)

Los estados son **clasificación de entrega**, no porcentajes. `BASE`=módulo presente, su uso real completo debe acreditarse; `QA`=pruebas específicas; `GATE`=operación/producto pendiente; `FUTURO`=no prometer ya.

| # | Capacidad | Estado / siguiente prueba que aporta valor |
|---|---|---|
| 01 | Primer clic y sesión Cliente con cronómetro | BASE+QA real; certificar clic→ACK→tick→cierre→Coach en versión productiva |
| 02 | Mi Semana y fechas independientes | U30–U60 SQL instalado PROD pero UI/grants **QA-only**; GATE de activación independiente |
| 03 | Gráficas longitudinales por variable | BASE; comparar 7/28/90/365, fechas, unidades y ausencia de datos |
| 04 | Comparar periodos y objetivos | BASE; ventanas equivalentes, límites, sin sumar métricas incomparables |
| 05 | Planificado frente a realizado | BASE; usar solo ejecución confirmada para fuerza/running/natación/mixto |
| 06 | Capacidades físicas/deportivas | BASE; IRI inicial separado de progresión y reevaluación |
| 07 | Sueño/recuperación/bienestar | BASE+Connected360; ausencia de reloj no equivale a recuperación mala |
| 08 | Running y natación: ritmo, duración, distancia | BASE; unidades km/100m correctas, prueba real de cronómetro y registro |
| 09 | Fuerza: memoria de ejercicio | BASE; series, carga por mancuerna, RIR/RPE, referencias sin autofill inseguro |
| 10 | Check-in sencillo | BASE; test móvil <20 s, reintento, privacidad |
| 11 | Coach Decision Brief | BASE; explicar evidencia y mostrar decisión humana, no automatismo |
| 12 | Report Studio (tipos y PDF) | BASE; reevaluación longitudinal bloqueada sin protocolo comprobado |
| 13 | Cambios desde última revisión | BASE; dos mediciones comparables y recomendación Coach trazable |
| 14 | Hitos útiles no coercitivos | BASE; no inventar rachas ni penalizaciones |
| 15 | Objetivos vinculados al plan | BASE; atribución de cambios autorizados al Coach |
| 16 | Hábitos limitados por ciclo | BASE; 1–3 opt-in, consentimiento, no prescripción automática |
| 17 | Alternativas de ejercicio | BASE; equivalencia comprobada y conservación de progreso |
| 18 | Coach preparado en 60 segundos | BASE; GATE con histórico real/paginado, WebAuthn y móviles |
| 19 | Capture (notas/voz opcionales) | Parcial; cualquier nueva captura queda en borrador revisable, NUNCA publicación automática |
| 20 | Cockpit/alertas Coach | BASE; alertas con causa, estado, acción siguiente; sin falsos positivos por carga fallida |
| 21 | Connected360 físico real | Canal y contrato preparados; **FUTURO NATIVO**, no conexión actual de PWA |
| 22 | First28 y comunicaciones | BASE; recordatorios consentidos, seguimiento humano y anti-spam |

## 5. Hallazgos consolidados: App Intelligence + Innovation Radar

**App Intelligence, 06/11 08:49 CL:** informe auditó SHA antiguo `35760590`; desde entonces UNIVERSAL #1286 **sí fue fusionada y promocionada** a SHA `38bd1050`, con CI/Canary/PROD confirmados y migraciones U30–U60 PROD instaladas. Los bloqueos administrativos de ese informe **ya no deben citarse como actuales**. Persisten: el recorrido Coach→Cliente→Coach no se ha ejecutado con escrituras auténticas en PROD; multi-fecha continúa QA-only; hardware físico sin certificar; latencia Coach con historial QA; Supabase Free debe medirse en GB facturados, no peticiones ni tamaño JSON; Auth/IRI tienen antecedentes que deben vigilarse.

**Innovation Radar, 05/11:**
- **AHORA SIN NUEVO MÓDULO**: acompañamiento premium / *Hybrid Circle* como piloto comercial opcional, sin alterar individualización ni prometer función tecnológica.
- **Arquitectura de interoperabilidad**: cierre documentado de Fitbit Web API y futura transición a Google Health API solo si existe dependencia real. Preservar IDs externos, consentimiento, tokens, revocaciones, fuente/fecha y deduplicación; no desarrollar proveedor nuevo sin validación/coste.
- **PRÓXIMO**, condicionado a start/finish fiables: Training Zones con objetivos de ritmo/FC/potencia prescritos por Coach, fuente y fecha; no convertir zona estimada por reloj en prueba fisiológica.
- **VIGILAR**: sensores de fuerza, fitness conectado propio y experiencias grupales premium. **DESCARTAR/POSponer** hardware propio, puntuaciones opacas y predicción automática de fallo muscular sin validez.
- **Reusar, no duplicar**: First28, seguimiento, reportes, biblioteca, Coach cockpit, comunicación, agenda, CRM, IRI y Connected360 existentes. Nuevas ideas deben aportar una decisión o reducir fricción medible.

## 6. Reglas de UX/UI, negocio y seguridad transversales

- Identidad SIGNATURE R49: verde bosque oscuro, crema y dorado discreto, tipografía nítida, sin brillos/neón/tarjetas gratuitas, responsive real, accesible. Cliente/Coach/Admin **tres experiencias diferenciadas**, no una misma vista con permisos.
- Una acción principal por pantalla, enlaces con nombres comprensibles, estados reales y recuperación. En Cliente priorizar entrenamiento/progreso/actividad; en Coach edición y decisiones; Admin trazabilidad. No interrumpir entrenamiento con invitación de wearable.
- IRI = diagnóstico inicial/punto de partida; evolución = seguimiento separado. No auto-diagnosticar ni usar dato faltante como cero. Verde/rojo en gráficos solo si mejora/regresión se deduce de valores comparables; ambiguo neutral.
- Separación tenant y cuentas: permisos en backend/RLS, no en DOM; WebAuthn, token refresh, ABAC, CAS, filas privadas, idempotencia y no reenvíos tras terminal. Logs sin PII, secretos ni evidencia clínica.
- Coste: Supabase Free, evitar polling, N+1, bootstrap pesado y tráfico QA innecesario; no debilitar gates ni truncar historia para ahorrar GB. No habilitar pagos ni APIs de pago.
- No confundir código preparado, test unitario, CI verde, QA autenticado, Canary LIVE, PROD LIVE, hardware y aceptación de usuario.

## 7. Aceptación y publicación de ESTE bloque único

1. Revisar exacto HEAD/base y alcance de la PR #1287; sin cambios de datos, secrets, SQL, Edge/Hosted Auth ni direct prod writes.
2. Pruebas unitarias y regresión, CI, Device Gate móvil/tablet/escritorio, Admin, Authenticated Client, seguridad, App Audit; **QA Real Write y Coach MFA E2E** en SHA integrado.
3. Un merge squash en Canary; confirmar LIVE QA SHA y 16 gates postmerge; M44 recuperación reciente; promoción oficial frontend-only con previousLiveSha controlado y rollback Pages.
4. Verificar PROD LIVE/QA identidad y login, comienzo exacto, tick, progreso y finalización desde **cuentas sintéticas autorizadas**. Si un E2E PROD no puede ejecutarse sin riesgo, declarar `PENDIENTE`, no certificar 95 % por CI. No usar la cuenta de un cliente para pruebas de escritura sin su sesión/consentimiento.
5. **Go/no-go**: QA cuentas de prueba sí si E2E auténtico verde; PROD piloto acotado solo para superficies realmente certificadas. El 90–95 % integral requiere pruebas de terreno de Coach/Cliente y aceptación funcional, no una estimación basada en tamaño de código.

## 8. Evidencia enlazada y continuidad

- PR UNIVERSAL #1286 y release #42231198583 (frontend `38bd1050`); [Mapa Maestro #1260](https://github.com/iberfit/iberfit-m26-app/issues/1260); [Product Excellence #1259](https://github.com/iberfit/iberfit-m26-app/issues/1259).
- PR única de continuidad [#1287](https://github.com/iberfit/iberfit-m26-app/pull/1287), estado de merge/promoción a actualizar tras ejecución, nunca supuesto.
- Incidencias históricas para comprobación diferencial: #919 (inicio), #1078 (Coach–Cliente), #1075 (bootstrap Coach), #1064 (multi-fecha), #944 (wearables), #1209 (Supabase Free), #1262 (IRI). Un issue abierto no invalida por sí solo una corrección demostrada; un test previo no prueba hardware.
- Mantener aquí la matriz **HECHO / QA / PROD / PENDIENTE**. Evitar PR duplicadas, etiquetas de versión U nuevas y otro módulo que replique funciones ya presentes.
