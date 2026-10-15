# IBERFIT NEXT M44 · Semántica y arquitectura de evolución

Estado: **WIP no certificado**. Documento de diseño técnico sobre la fuente real de M42, para el **único ultramegabloque M44**. No activar reportes/publicación en producción hasta pasar todo el gate.

## 1. Contrato de producto

**Cliente:** «Lo que hemos hecho» → «Qué ha cambiado» → «Qué significa» → «Siguiente paso acordado». Datos legibles y pocos indicadores. Nunca mostrar ceros cuando faltan mediciones ni llamar mejora a un mero cambio de carga.

**Coach:** expediente y resultados comparables en 10–20 s, historial y variantes, contexto de lesiones/bienestar, decisión humana fechada y efecto tras los siguientes entrenamientos. Una recomendación no se publica automáticamente.

**Admin:** integridad, evidencia, permisos, estado del ciclo de informes y trazabilidad; no duplicar el dashboard del Cliente con más botones.

**Diagnóstico IRI inicial:** siempre separado; informa el punto de partida y la bienvenida. No es la unidad del seguimiento posterior, ni requisito para ver entrenamiento o emitir un informe de evolución con pruebas suficientes.

## 2. Semántica canónica de adherencia (primera implementación WIP)

- «Sesión completada» = ejecución con cierre confirmado por servidor o cita marcada canónicamente realizada; deduplicar el par cita/ejecución si hay identidad de vínculo explícita.
- «Compromiso programado» = cita debida confirmada/realizada/no-show o compromiso formal con fecha y estado comparable. Nunca considerar como denominador una sesión autónoma solo por haber ocurrido.
- «Adherencia» = compromisos efectivamente cumplidos / compromisos comparables. **Sin denominador legítimo → `null`, no 0% ni 100%.**
- Sesión guiada autónoma completada no debe rescatar el cumplimiento de una cita presencial no vinculada. Un `sessionId` compartido tampoco prueba vínculo con una `appointmentId` única.
- Mantener por separado actividad autónoma confirmada, citas programadas y cita cumplida. No convertir wearables en ejecuciones IBERFIT ni falsificar adherencia por frecuencia comercial.
- Duplicados del mismo ID: prevalece revisión canónica mayor; igualdad de revisión y estado contradictorio se pone en cuarentena. Eventos sin ID no se utilizan como certeza de denominador.
- Seguir comprobando discrepancias entre planificación semanal/ciclo y citas; ampliar el denominador solo cuando existan compromisos fechados, publicados y trazables.

## 3. Rendimiento comparable y narrativas

- Por ejercicio usar identidad canónica, variante, unilateralidad/lado, unidad, protocolo, rango de movimiento, equipamiento y condiciones. No comparar un peso total con una carga unilateral, ni una plancha con repeticiones.
- Fuerza: evolución de carga por series/reps, volumen **solo en unidades confirmadas**, RPE/RIR, consistencia y notas cualitativas. Sin tratar pesos de ejercicios distintos como un agregado clínicamente interpretable.
- Carrera: tiempo real, distancia, ritmo min/km y FC media (si son fuente confirmada y compatibles), continuidad y recuperación. No interpretar ritmos de intervalos como ritmos continuos.
- Bienestar: sueño h+min, carga percibida y dolor como **contexto**, nunca diagnóstico médico automático.
- Gráfica solo si hay ≥2 observaciones comparables; para una observación presentar un hito, no una pendiente; siempre tabla/lectura textual alternativa.
- Variación acompañada de unidad, ventana, tamaño de muestra, origen, frescura y límites; insuficiente/indeterminado/pendiente deben ser visibles.

## 4. Contrato de informes (sin IRI obligatorio)

Categorías con identidad y fuente propias:
- `iri`: diagnóstico inicial; fuente única `iri_assessment`, protocolo, revisión y consentimiento.
- `post-session`: ejecución confirmada y `executionId`; no requiere IRI.
- `weekly` / `monthly` / `quarterly`: ventana civil explícita, ejecuciones canónicas y evidencias de progreso con calidad; no requiere IRI.
- `reassessment`: medición de seguimiento explícita, protocolo y comparación verificada; **no** «los dos últimos IRI» por proximidad temporal.
- `year-in-iberfit`: historial suficiente y delimitado; nunca añadir resultados inventados.

**Modelo de almacenamiento:** reutilizar tabla `public.reports` con `source_type`, `source_id` donde procede y `content` con versión de schema de informe, ventana, IDs/revisiones de fuentes, capturas de evidencia, calidad, contexto de autorización, autor y comentario editorial. Revisar primero funciones/RLS/índices. Entidades de informe solo nacen de comandos autorizados y auditados; vista Cliente filtra publicación inequívoca.

**Ciclo de vida:** crear borrador → autoguardado recuperable → validar hechos y procedencia → revisión Coach → aprobación interna → previsualizar PDF A4 → publicación explícita → versiones / retirada / auditoría. Revocar una publicación no destruye historial ni permite descargas nuevas del cliente. La autorización backend determina acceso, nunca solo esconder botones.

**Bloqueo de arquitectura observado en PROD:** `INFORME_APROBAR` en `domain_command_registry_v26` tiene `bootstrap_allowed=false`; `report-workflow.js`/ruta de informe exigen `assessmentId`. Antes de exponer informes sin IRI: resolver creación canónica segura + compatibilidad con borradores antiguos, validar la transición y generar PDF desde el snapshot realmente aprobado. No poner un formulario funcionalmente falso por quitar un `required`.

## 5. Contratos de aislamiento y QA

- Mismo cliente, dos dispositivos y reconexión; ningún informe ajeno, incluso si conoce el UUID.
- Cliente sin IRI y con dos entrenamientos confirmados: evolución visible, portafolio no-Iri disponible; IRI independiente pendiente.
- Cliente solo IRI: diagnóstico visible, evolución vacía y **sin** inventar entrenamiento.
- Cita presencial cancelada/rechazada + ejercicio autónomo: mantener métricas independientes.
- Sesión duplicada, ejecución sin ACK, revisión en conflicto, intervalos incompatibles, plan sin actividad, sin métricas: señales insuficientes, no falsos porcentajes.
- Seguimiento de 7/28/90 días con ventanas solapadas explicadas; no sobreinterpretar causalidad.
- Reporte PDF generado y abierto en móvil, tablet, escritorio e impresión A4; verificar bytes, textos, fuentes y RLS, antes de producción.
- Error y recuperación en carga, guardado, aprobación, publicación, archivo, descarga. No bloquear navegación ni perder borradores.
- Perfil Coach optimizado para consulta rápida en sesión real, cliente centrado en claridad, Admin en control.

## 6. Gobernanza de integración

El trabajo M44 puede prepararse en la rama WIP. **No PR para cambios parciales.** Tras cierre del P0 #942, sincronizar la rama contra el SHA PROD verificado, ejecutar todos los tests y E2E, generar *una sola PR M44* con evidencia y promocionar mediante canal oficial a `app.iberfit.cl`. Mantener #939 (corrección visual de carrera) fuera de este ultramegabloque hasta el momento acordado.
