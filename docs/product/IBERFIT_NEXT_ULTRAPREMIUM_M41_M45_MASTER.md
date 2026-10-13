# IBERFIT NEXT — Contrato maestro de experiencia ultrapremium M41–M45

**Decisión de producto:** aprobada por la dirección de IBERFIT el 13/10/2026.
**Estado:** CONTRATO_CANÓNICO_APROBADO · implementación progresiva obligatoria, sin considerar las funcionalidades ya existentes como trabajo pendiente.
**Ámbito:** app.iberfit.cl (producción), canary certificado, Cliente, Coach, Admin, web pública donde resulte pertinente y experiencias móviles/PWA.
**Precedencia:** seguridad e integridad > no pérdida de datos > evitar bloqueos > funcionalidad > UX > rendimiento > diseño > mejoras adicionales.
**Fuente de verdad:** este documento recoge y desarrolla íntegramente la dirección IBERFIT NEXT. No sustituye los contratos operativos existentes (RC58, RC59, RC64, M39) ni el estado confirmado en CI o producción.

## 0. Visión irrenunciable

IBERFIT debe dejar de percibirse como «una aplicación con ejercicios, informes y registros» y convertirse en **un servicio de entrenamiento personal extraordinario, con metodología, criterio, acompañamiento y una experiencia digital del máximo nivel**.

Promesa comunicativa: **«Entrenamiento personal con criterio: diagnóstico, planificación, control y seguimiento.»**

Cuatro certezas que debe experimentar cada cliente, sin jerga innecesaria:
1. Sé exactamente qué tengo que hacer.
2. Entiendo por qué lo hago.
3. Percibo que el equipo IBERFIT sigue mi evolución real.
4. Veo qué está cambiando, de dónde procede el dato y qué ocurrirá después.

La marca debe ser **premium, humana, cálida, deportiva, sobria, elegante, tecnológica, profesional y memorable**. No fría, estéril, corporativa ni artificial; tampoco depende de una persona o entrenador fundador. El coach asignado tiene presencia humana cuando corresponde, pero metodología, relación, calidad y continuidad pertenecen a IBERFIT. Evitar protagonismo de nombres personales en la identidad general de producto.

Un producto ultrapremium **no es el que más pantallas o métricas tiene**, sino el que resuelve con menos fricción, explica los resultados con criterio y da tranquilidad incluso cuando algo falla.

## 1. Principios derivados de benchmarking (referencias, no copias)

Referentes examinados en la reflexión de producto: Oura, WHOOP, Runna, Hevy, TrainingPeaks, ABC Trainerize, Future y principios de diseño de Apple, accesibilidad WCAG 2.2 y usabilidad de formularios Baymard.

- **Oura — Hoy / salud / historia:** prioritizar qué importa ahora, después contexto profundo.
- **WHOOP — interpretación:** transformar datos con procedencia comprobable en un contexto útil. No copiar puntuaciones propietarias ni inventar índices clínicos.
- **Runna — carrera:** bloques, ritmos, distancias, intervalos, recuperación y comparación previsto/realizado comprensibles.
- **Hevy — ejecución:** cargas, series, descansos y referencias anteriores accesibles en segundos.
- **TrainingPeaks — periodización:** planificación longitudinal con estructura sólida y vista simple para deportista.
- **Trainerize — ecosistema:** unificar entrenamiento, citas, comunicación, hábitos y seguimiento sin producir un panel saturado.
- **Future — acompañamiento humano:** el valor está en la atención individual, no en frases generadas constantemente.
- **Apple/WCAG/Baymard — excelencia de interfaz:** jerarquía, foco, lectura cómoda, controles táctiles, mensajes de error localizados, coherencia y estados recuperables.

IBERFIT combina esos principios en un producto independiente. No afirmar que hemos probado personalmente miles de apps; usar investigación documental, contrastar patrones y validar con clientes reales.

## 2. Identidad visual canónica, con estética de lujo deportivo contemporáneo

- **Identidad:** verde oscuro profundo; **lienzo cálido:** crema/papel; **acento:** dorado medido. Un toque de dorado tiene valor porque no se repite arbitrariamente en todo.
- Fuentes y colores derivan de los tokens/brand truth existentes: `src/m26/design/tokens.css` (generado, no editar manualmente), `src/m26/design/brand-vision.css`, `docs/RC58_5A_BRAND_TRUTH.md`. El isotipo oficial se preserva sin recolorearlo.
- Jerarquía editorial fuerte: título claro, subtítulo útil, datos numéricos con alineación tabular, secciones legibles, espacios generosos. **Prohibido usar microtipografía como norma para texto funcional**, aunque ya existan estilos anteriores de ~10–11px.
- Tipografía Inter Variable en controles/lectura operativa; Source Serif 4 solo para titulares editoriales/informes donde verdaderamente aporte; ambas autohospedadas y sin forzar descargas nuevas.
- Control táctil y foco reales: objetivo de 48px en Cliente y 44px para controles profesionales; teclado, select, focus-visible, scroll, reduced-motion, safe areas y WCAG 2.2 AA; no depender de color para estados.
- El cliente necesita **aire**: menos tarjetas, bordes, chip/badges y elementos visuales sin función. Separar secciones con composición, tipografía y espacios.
- Efectos, degradados, brillos, sombras y movimiento: puntuales y funcionales, nunca como estética genérica SaaS/IA ni neón. Fotografías y medios de ejercicio precisos, consistentes, aprobados y con encuadre correcto.
- Coherencia multidispositivo: móvil, tablet, portátil y escritorio; orientación, zoom y teclado. La estética premium debe sobrevivir al modo de una sola columna y al equipo de gama media.
- Tres productos visualmente distintos sobre primitives/tokens compartidos: **Cliente** calmado/explicativo, **Coach** rápido/táctico, **Admin** densidad y control.

## 3. Las cinco experiencias fundamentales del Cliente

### 3.1 Hoy: la pantalla que enamora y conduce

Primer nivel: **una sola acción principal relevante para el estado actual**, no un tablero de 8 métricas/7 botones.

Estados con transiciones fiables: nuevo usuario; perfil incompleto; IRI inicial en curso; IRI ya confirmado; sin servicio de entrenamiento; servicio activo sin ciclo; plan publicado; sesión presencial con coach; sesión guiada autónoma sin cita; día de descanso; sesión en curso; sesión terminada; próximo objetivo; servicio suspendido/caducado; falta de conexión; operaciones en conflicto.

Prioridades: **qué toca, por qué, cuándo, cómo acceder**. Mostrar la sesión de hoy con título humano, modalidad, duración, objetivo real de la prescripción, material necesario, próxima cita si existe y CTA seguro. Por debajo: semana, un hito reciente, mensaje pertinente o invitación optativa a registrar bienestar. No afirmar que existe una sesión si no está publicada y habilitada.

El sistema ya tiene `deriveClientExperience`, `experienceNextAction`, `renderClientHoyRoute` y proyecciones RC39. Evolucionar **esa misma lógica y rutas**, no crear un motor paralelo.

### 3.2 Mi plan: comprensión y sentido longitudinal

Vista de ciclo, fase, semanas y sesiones con calendario+itinerario; metas y explicaciones breves, programado vs realizado, siguientes semanas y cambios publicados. La vista Cliente es intuitiva; el Coach conserva periodización, cargas, variantes, prescripción y criterios técnicos.

Casos deportivos: fuerza; carrera continua, suave, fartlek, intervalos; natación técnica, tiempo y distancias; complementarios de movilidad/recuperación. No imponer el mismo esquema de métricas a todos.

### 3.3 Entrenar: antes, durante y después sin fricción

**Antes:** objetivo, duración, bloques, equipo, vista previa, tiempos/ritmos/recomendaciones y decisión segura de inicio.

**Durante:** una tarea clara, controles grandes, progreso en bloques/series, descansos y timers robustos, demostraciones aprobadas, referencias anteriores si son fiables, cambios y sustituciones razonadas, feedback, continuidad offline y recuperación de estado.

**Fuerza:** series/repeticiones/carga/RPE/RIR/descansos/progresiones/alternativas/circuitos/biseries/triseries/AMRAP/Tabata, donde correspondan.

**Running:** calentamiento, carrera continua e intervalos, bloques, distancia/tiempo/ritmo/FC opcional, recuperación, sesión prevista vs real. No inventar repeticiones o FC.

**Natación:** estilo, distancia, tiempo, repeticiones, parciales, pausas y bloques de técnica; sin obligar métricas no aplicables.

**Presencial:** Coach registra, Cliente recibe resumen/seguimiento sin duplicar formularios. **Guiada desde app:** Cliente puede iniciar cuando el backend y la modalidad lo permitan.

**Después:** qué se completó realmente, esfuerzo, molestias, observaciones, comentario posterior de equipo, continuidad del plan. La sesión completada nunca depende de una animación ni un último guardado local frágil.

Fronteras críticas: borrador > validación > previsualización > publicación > disponibilidad > ejecución > confirmación; comandos remotos autoritativos, idempotencia, revisionado, autenticación, seguridad RLS y recuperación ante red/multitab. Error solo si faltan datos reales o hay impedimento de seguridad/servidor comunicado de forma precisa. Nunca errores genéricos si es posible señalar la causa.

### 3.4 Mi evolución: la historia del valor profesional

**El IRI inicial es la fotografía diagnóstica y bienvenida, nunca se mezcla con el seguimiento**. La evolución es otro recorrido longitudinal con fechas, unidad, procedencia, calidad, ventana temporal, comparabilidad, datos confirmados y evidencia.

Responder: ¿me muevo mejor?, ¿soy más fuerte?, ¿mejoró mi carrera?, ¿cómo evolucionan mi constancia y capacidad?, ¿qué decidió el equipo y por qué?

Cada visualización: **dato confirmado → contexto → interpretación prudente → decisión profesional → siguiente paso**. No imponer una «puntuación total de fitness» ni poner métricas por estética. No hacer inferencias clínicas, inventar series, utilizar N/A como 0, confundir correlación con causalidad ni afirmar incremento de volumen sobre métricas no comparables.

Visualizaciones premium sencillas en Cliente y de análisis profundo en Coach/Admin; escalas legibles, unidades y períodos, metas y eventos conocidos, estado sin datos/insuficientes y exploración progresiva. Comparar sólo periodos/material/ejercicios realmente compatibles.

**Narrativa de 3–6 meses:** qué hicimos, qué cambió, qué dificultades hubo, qué decisiones tomó el equipo y cuál es el próximo objetivo. Informe exportable premium donde aporte valor y no dependa de relleno automático.

Ya existen cálculos de progreso, longitudinal, client 360, bienestar y calidad del dato: reutilizarlos y mejorar legibilidad y presentación. `src/m26/ui/client-360.js` actual es una superficie activada para Coach; NO reutilizarla como portada densa del Cliente.

### 3.5 Estoy acompañado: servicio real, no bot omnipresente

Comunicación útil y humana, observaciones de Coach/equipo, revisión de resultados, cambios razonados, agenda, avisos de acciones concretas, reconocimiento de hitos auténticos y seguimiento que demuestra atención sin vigilancia excesiva.

Retos/comunidad optativos, inclusivos, con privacidad y consentimientos. Sin rankings de presión, recompensas ficticias ni exceso de notificaciones.

Usar «equipo IBERFIT» y profesionales asignados donde corresponda, sin construir la identidad sobre el fundador ni simular un acompañamiento humano inexistente. Una decisión real vale más que 20 felicitaciones generadas.

## 4. Cinco macrobloques de integración completos (NO mini-patches eternos)

### M41 — Identidad y sistema premium

**Incluye:** inventario visual por rol y dispositivo; eliminar conflictos/repeticiones de CSS con trazabilidad; tokens semánticos canónicos; jerarquía/tipografía/fuentes; líneas/bordes y superficies; iconografía; ritmo y espacios; components primitives de lectura, acción, error, estado vacío, skeleton, confirmación y retry; foco/contraste/touch/motion; temas en gráficas; no romper impresión/informes; responsive y safe areas.

**Aceptación:** un lenguaje identificable consistente sin degradar Coach/Admin; UI legible en 320px–desktop, zoom 200%, teclado y touch; WCAG 2.2 AA en flujos esenciales, contraste validado; sin CSS «important» especulativo sobre reglas desconocidas; Core Web Vitals y métricas de rendimiento con evidencia; tests visuales antes/después y no perder controles.

**Dependencias:** RC58, tokens generados, Brand Truth. Primero analizar origen y precedencia de CSS antes de editar.

### M42 — Nueva experiencia Cliente

**Incluye:** portada Hoy contextual y adaptativa; navegación móvil simplificada; presentación de plan/ciclo/calendario; incorporación y Guía contextual; qué hacer/por qué; CTA único, estados vacíos útiles; sesiones autónomas/presenciales; resumen de la semana; accesos a progreso/comunicación; personalización con consentimiento y preferencia persistente.

**Aceptación:** sesión publicada alcanzable desde Hoy en <=2 toques en escenario elegible; usuario sabe identificar próximo paso; IRI Solo IRI NO finge entrenamiento activo; no mostrar sesiones no publicadas; sin acciones duplicadas ni estados en conflicto; ningún nivel de permiso adquirido por la ruta visual.

### M43 — Entrenamiento extraordinario

**Incluye:** constructor profesional y ejecución de Cliente/Coach; fuerza, running, natación y modalidades; prescripciones correctas por deporte; borradores independientes por entidad; guardar/revisar/publicar de forma fiable; bloqueos y validaciones precisas; anti-duplicado y ACK remoto; continuidad de sesión offline/reconexión; cronómetro, descanso, historial y feedback; vistas previas reales por rol; tests E2E completos con servidor autorizado.

**Aceptación:** todos los datos válidos pueden publicarse, los inválidos señalan campo específico; borradores recuperables y editables; no doble publicación; robustez en caída de red, reintentos y expiración; cliente recibe y ejecuta exactamente lo publicado cuando su modalidad lo permita. No confundir tests unitarios con aceptación real.

**Dependencias:** M39 y corrección de sesión M40 (PR #926), issue #925 sobre borradores y revisionado. No iniciar si esas regresiones no están cerradas.

### M44 — Evolución y valor percibido

**Incluye:** gráficos premium sobre motor canónico; IRI inicial separado de evolución, panel narrativo de progresión, comparaciones longitudinales válidas, hitos, constancia/adherencia, fuerza/cardio/movilidad y reportes con estilo IRI; dato-contexto-decisión y recomendaciones revisadas.

**Aceptación:** las comparativas informan origen, ventanas, unidades, calidad y metodología; no se muestran tendencias por insuficiencia de evidencia; visualizaciones legibles móvil/desktop, accesibles sin depender del color; Coach y Cliente interpretan nivel correcto.

### M45 — Acompañamiento y excelencia final

**Incluye:** comunicación profesional, agenda, retos optativos, feedback de entrenador, ajustes y avisos contextuales, preferencia/privacidad, soporte, dispositivos ya conectados sin contratos de coste extra, recuperación de errores, auditorías UX/perf/security/CI/E2E y certificación producción exacta.

**Aceptación:** ciclos completos IRI → plan → sesión → ejecución → devolución → evolución → siguiente decisión, sin rutas muertas; comunicación y notificaciones relevantes pero no intrusivas, consentimiento, privacidad, múltiples dispositivos, accesibilidad y PWA.

## 5. Estándares y métricas de calidad (objetivos, NO logros declarados)

- **<=2 toques** para abrir una sesión disponible desde Hoy en escenario elegible.
- **0 comandos duplicados** de publicación/registro tras ACK confirmado: servidor, reintentos, doble toque, multitab, fallos de limpieza local.
- **100% de errores de validación recuperables** con campo/código y explicación comprensible; separar error de formulario, conexión, permiso, storage y conflicto.
- **WCAG 2.2 AA** objetivo para flujos esenciales, tamaños táctiles, zoom, reader y reduced motion.
- Rendimiento real: rapidez de entrada, tiempo hasta interacción, navegación, rendimiento de sesión y charts en móvil de gama media; presupuestos medidos sobre baseline.
- Estados de loading, empty, offline, retry, recover, success, warning, conflict; no pantalla congelada, focus perdido o overlay invisible.
- Datos: procedencia canónica, solo confirmados, agregación auditable, no distinguir «desconocido» con 0; no extrapolaciones sin fundamento.
- Validaciones: typecheck, lint, unit/integration/E2E, Browser Coach/Cliente/Admin, dispositivo y distintas resoluciones; CI verde; no salida a producción sin certificación posterior a merge.
- Seguridad: RLS, sesiones refresh/expiración, autorización real en servidor, separación de roles y servicio activo, ninguna filtración de imágenes/datos, consentimiento, XSS/CSRF/uploads/secrets/rate limit.
- Negocio: medir adopción de plan, porcentaje de sesiones terminadas, tiempo para acceder a entrenar, feedback útil, adherencia y retención de forma agregada sin inventar causalidad ni convertirlos en vanity metrics.

## 6. Criterios estrictos de ejecución y entrega

1. Antes de cada macrobloque: SHA/rama/PRs existentes, CI actual, código afectado, runtime en producción, rollback, estado de datos/seguridad y revisión de duplicidades.
2. **No eliminar funcionalidades útiles, ni reescribir todo sin necesidad**. Evolucionar fuentes de verdad existentes. No crear un segundo sistema de rutas, colores o cálculos.
3. Acumular cambios coherentes en PR macro; realizar pruebas sobre rama, merge con protección, verificación Canary exacta, promover SHA exacto por release manifest y verificar `app.iberfit.cl` con logs/evidencias/rollback.
4. Diferenciar siempre `concepto`, `implementado en rama`, `PR`, `merge Canary`, `Canary QA PASS`, `prod deploy PASS` y `aceptación real Coach→Cliente`.
5. Comportamiento falla-cerrado y reversibilidad; nunca usar producción real como un entorno de ensayo destructivo.
6. Validar al menos: nuevo, Solo IRI, plan sin sesión, sesión autónoma sin cita, presencial, día de descanso, cliente con historia, sin datos, multi-dispositivo, offline, expiración, doble clic, guardar/reanudar, cambio de cliente, backend 4xx/5xx.
7. **Prioridad inmediata:** cerrar PR #926 y deficiencias previas de fiabilidad; ejecutar M41–M42 como primera transformación de experiencia visible; seguir M43–M45 completos; después revisar integralmente experiencia Coach y Admin con el mismo nivel exigente.

## 7. Comprobación previa de realidad técnica (13/10/2026)

Archivos existentes examinados:
- `src/m26/experience/client-experience.js`: etapas y acción siguiente.
- `src/m26/modules/route-render.js` y `route-view-model.js`: Hoy Cliente/Coach, planning y progreso.
- `src/m26/ui/client-360.js`: vista densa del rol Coach, no portada Cliente.
- `src/m26/design/tokens.css`, `brand-vision.css`, `role-surfaces.css`, `typography.css`: sistema visual por capas, fuente de posibles colisiones y microtipografía.
- `src/m26/workflows/session-controller.js`, `session-builder.js`: constructor y flujo de publicación.
- `docs/RC58_DESIGN_SYSTEM_SCOPE.md`, `docs/ROADMAP_RC58_RC64_PREMIUM.md`: contratos anteriores que se preservan.

Fallo real comunicado: pantalla Coach, sesión «SESIÓN Carrera», 45 min, aviso genérico de operación en `app.iberfit.cl`, 13/10/2026. PR #926 se centra en recuperación y mensajes; **no se considera automáticamente aceptado en producción por abrir el PR o compilar**.

## 8. Definición de terminado

IBERFIT NEXT termina cuando **cada capacidad anterior está integrada** en la app real, sin regresiones significativas, con calidad visual y UX verificadas en todas las plataformas, roles separados, historia real de progreso, errores precisos y publicación segura. El objetivo no es apariencia por sí sola: **claridad, criterio, calidez humana, rendimiento, trazabilidad, continuidad y la sensación de estar atendido por un equipo excepcional.**

> Regla permanente aprobada: **mejorar sin degradar, evolucionar sin duplicar, y no confundir código terminado con producción ni con experiencia certificada.**
