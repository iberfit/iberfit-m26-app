# IBERFIT · Product Contract

Estado: canónico. Este documento resume decisiones de producto duraderas. Los documentos RC históricos aportan evidencia y contexto, pero no sustituyen este contrato.

## Propuesta de valor

IBERFIT es entrenamiento personal con criterio: diagnóstico, planificación, control y seguimiento.

El producto debe convertir datos y observaciones en decisiones útiles, no limitarse a registrar información.

Bucle de valor:

`señal -> decisión Coach -> intervención -> resultado -> aprendizaje -> siguiente decisión`

## Roles

### Cliente

Objetivo: claridad, motivación, progreso y simplicidad.

Debe responder rápidamente:
- qué tengo que hacer ahora;
- cómo voy;
- qué ha cambiado;
- qué significa;
- qué debo completar o comunicar.

Prioridad móvil. Densidad baja. Sin lenguaje técnico innecesario.

### Coach

Objetivo: velocidad, precisión y mínima fricción durante una sesión real.

Debe favorecer:
- preparación rápida;
- ejecución de sesión;
- ajustes de carga, series, repeticiones y descansos;
- alternativas, progresiones y regresiones;
- comparación histórica útil;
- feedback accionable;
- navegación y edición eficientes con touch y teclado.

El Coach no renombra ejercicios de la biblioteca canónica.

### Admin

Objetivo: control, gestión, trazabilidad y visibilidad.

Debe permitir:
- gobierno de usuarios, roles y datos;
- acceso a biblioteca de ejercicios;
- renombrar y gobernar ejercicios;
- trazabilidad de operaciones;
- observabilidad de configuración y estado;
- gestión con densidad y precisión superiores.

## IRI y seguimiento

El Diagnóstico IRI inicial y el seguimiento/evolución son conceptos distintos.

- IRI = punto de partida, bienvenida y baseline inicial.
- Seguimiento = cambio longitudinal durante el proceso.
- El baseline IRI no debe reutilizarse como contenedor genérico de reevaluaciones.
- La fotogrametría es una capa complementaria, privada y longitudinal; no un diagnóstico clínico automático.
- Original fotográfico y análisis derivado deben permanecer separados.
- Los landmarks automáticos, cuando existan, son propuestas; el Coach valida/corrige antes de convertirlos en dato interpretado.
- La calidad del dato y el protocolo deben ser visibles.
- Las fotos no se incluyen por defecto en reportes compartibles.
- Protocolos de capacidad funcional distintos no comparten baremos automáticamente; 1MSTS y YMCA 3-min deben tratarse como protocolos diferentes.

No mezclar IRI y seguimiento en copy, navegación, métricas ni interpretación. Separar siempre dato, interpretación y decisión.

## Entrenamiento

IBERFIT debe soportar el trabajo real de entrenamiento personal:
- planificación;
- ejercicios y variantes;
- series, repeticiones, carga y descansos;
- progresiones y regresiones;
- alternativas si un ejercicio no se completa;
- biseries, triseries, circuitos, AMRAP y Tabata cuando corresponda;
- feedback y adherencia;
- historial y evolución;
- observaciones del Coach.

La velocidad durante una sesión real es una prioridad de producto.

## Métricas y gráficas

No añadir métricas porque estén disponibles.

Toda métrica debe:
1. tener significado;
2. ser interpretable;
3. apoyar una decisión;
4. indicar unidad, periodo y ausencia de datos;
5. evitar inferencias clínicas automáticas no justificadas.

Las gráficas deben facilitar comparación, tendencia y siguiente acción.

## Genio IBERFIT

El onboarding debe ser dinámico y contextual, no un cuestionario lineal de pasos.

El Genio IBERFIT:
- aparece cuando aporta valor;
- explica la interfaz en contexto;
- guía sin bloquear;
- recuerda progreso relevante;
- no sustituye decisiones profesionales del Coach;
- no se convierte en un asistente invasivo permanente.

## Experiencia por dispositivo

- desktop = construir y analizar;
- tablet = entrenar y operar;
- móvil = actuar y completar.

Responsive no significa la misma interfaz comprimida. Las tareas críticas deben seguir siendo cómodas con mouse, touch y teclado.

## Estados obligatorios

Todo flujo importante debe contemplar, cuando aplique:
- loading;
- success;
- empty;
- error;
- retry/recovery;
- offline/sync;
- conflict.

No se considera terminado un flujo que sólo cubre el happy path.

## Seguridad y confianza

Seguridad y facilidad de uso deben coexistir.

Especialmente:
- separación Cliente/Coach/Admin;
- autorización real en backend/RLS/RPC, no sólo UI;
- sesiones robustas;
- recuperación segura;
- mínimo acceso a datos;
- secretos fuera del cliente;
- fail-closed para privilegios;
- trazabilidad proporcional al riesgo.

## Calidad de lanzamiento

Una mejora no está terminada por existir en código, PR o Canary.

El cierre real exige funcionamiento verificado en `https://app.iberfit.cl` cuando la tarea esté destinada a producción.

Ver `docs/DEFINITION_OF_DONE.md` y `docs/RELEASE_POLICY.md`.


## Radar · Capture y continuidad con supervisión (07/11/2026)

- Coach Capture interpreta **solo notas textuales introducidas voluntariamente** en el constructor actual. No es OCR, dictado de voz, IA externa, otro planificador ni publicación automática.
- Cada ejercicio requiere selección explícita del catálogo; las cargas sin especificar total o por mancuerna son ambiguas y bloquean la incorporación. Los parámetros omitidos usan defaults del constructor, que no representan mediciones extraídas y deben revisarse antes de publicación.
- Las notas son temporales y están aisladas por identidad Coach, cliente y borrador. Incorporación atómica y autoguardado del borrador existente; la aprobación y el ACK servidor de la publicación siguen intactos.
- La navegación mantiene una acción verdadera principal por pantalla y separa Cliente, Coach y Admin. El diagnóstico IRI inicial y la evolución son productos diferentes.
- En web, Connected360 debe distinguir datos recientes, obsoletos y estimados sin declarar que existe una conexión nativa automática.


## Experiencia premium · Private Coach / Concierge 360 (09/11/2026)

El valor premium es tiempo ahorrado, precisión, anticipación y trato individual,
no una cantidad mayor de gráficos o privilegios clínicos.

- **IRI inicial**: punto de partida confirmado. Las proyecciones de escenarios son
  ilustrativas hasta tener un modelo longitudinal validado y deben indicar hipótesis,
  intervalos e incertidumbre. Nunca sustituir IRI por seguimiento.
- **Coach adaptativo**: los registros voluntarios recientes y el contexto autorizado
  de dispositivos producen preguntas y propuestas revisables. No se modifica
  intensidad, volumen, horario, ejercicio ni publicación automáticamente.
  Cualquier recomendación muestra origen, frescura y limitaciones.
- **Concierge privado**: los borradores predefinidos de agenda, viajes, técnica y
  hábitos usan exclusivamente la mensajería Cliente–Coach existente. No otorgan
  prioridad contractual, respuesta inmediata, reserva ni reprogramación automática.
- **Agenda externa**: futura integración Google/Outlook únicamente con autorización
  explícita por persona, mínimo scope free/busy, zonas horarias y conflictos visibles.
  Ningún evento se crea, mueve o borra sin confirmación inequívoca.
- **Wearables**: Apple Health/Health Connect/Oura solo con consentimiento por fuente,
  integraciones nativas/OAuth realmente implementadas, revocación y fechas claras.
  No inventar conexión activa desde permisos web o datos históricos.
- **Técnica visual**: vídeos de ejercicio reales con autoría/consentimiento y ángulos
  aprobados por profesionales. Cualquier subida personal requiere Storage privado,
  RLS, límites, moderación, caducidad, borrado y QA móvil antes de abrir esa acción.
- **Hábitos y nutrición**: pautas generales contextualizadas, nunca diagnósticos ni
  suplementación específica derivada de analíticas sin revisión por profesional competente.
- **SLA empresarial**: el significado de «VIP», prioridad, horario y disponibilidad
  depende del contrato de servicio, nunca se promete por una etiqueta UI.

## Calidad de mercado y experiencia ejecutiva (09/11/2026)

- Valoración externa provisional 6/10: sirve para identificar incertidumbre, no para certificar un resultado comercial. Ninguna puntuación podrá sustituir a tests autenticados, datos de navegación, encuestas de clientes y uso sostenido.
- Éxito premium medible = tiempo ahorrado, comienzo de sesión sin bloqueo, navegación clara, continuidad fiable, resultados explicables y seguimiento humano. Diferenciar latencia de pintado real de wall-clock del harness de Playwright.
- Prioridad de evolución: rendimiento/recuperación/seguridad y recorridos completos antes de funciones de escaparate. Cliente ve siguiente acción; Coach trabaja sin fricción; Admin ve el riesgo y el estado.
- Concierge ejecutivo: Hotel, jet lag y recuperación son solicitudes privadas opcionales; jamás equivalen a un plan ya adaptado o a consejo médico. El Coach revisa y aprueba ajustes. Vídeo técnico bidireccional queda aplazado.
- Sincronización de calendarios, sensores nativos y pagos requieren certificación, permisos granulares y diseño comercial propios. No prometerlos desde UI si sólo existe infraestructura o prueba QA.
- Informes ejecutivos: dar preferencia a resúmenes concisos de evidencia confirmada, con intervención del Coach, exportación explícita y control de identidad; IRI inicial debe mantenerse separado del seguimiento.
