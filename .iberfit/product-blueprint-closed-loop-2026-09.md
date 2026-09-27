# IBERFIT Product Blueprint — Closed Loop Coaching

Status: **APROBADO**
Fecha de decisión: **2026-09-27**
Base revisada: `canary/rc74-4` @ `46e4d3a9b641e39e5575b9d80fc0af136ae84f6c`

Este documento consolida como decisiones oficiales de producto el análisis de evolución de IBERFIT aceptado íntegramente por producto. No es una lluvia de ideas: es un blueprint de dirección de producto y arquitectura. La implementación seguirá WIP=1, CI, Canary, verificación real y despliegue seguro.

## 1. North Star ampliada

IBERFIT debe evolucionar desde una aplicación de planificación/registro hacia un **sistema operativo del entrenamiento personal**.

Circuito objetivo:

**Diagnóstico inicial → objetivos → planificación → prescripción → ejecución → datos reales → feedback → interpretación → decisión profesional → adaptación → evolución.**

Cada dato debe conducir a una decisión, acción o explicación útil. El producto no debe convertirse en una colección de módulos aislados.

### Principio de separación IRI / Evolución

- **IRI** = fotografía inicial, bienvenida, baseline.
- **Evolución / Reevaluación** = progreso posterior durante el proceso.
- No mezclar ambos conceptos ni renombrar seguimiento posterior como una extensión indistinta del IRI.

## 2. Closed loop coaching

El núcleo funcional debe cerrar el circuito entre lo prescrito y lo realmente ocurrido.

Ejemplo de prescripción:
- Sentadilla 4×8, 70 kg, RIR 2.

Ejemplo de ejecución:
- 8×70 / 8×70 / 7×70 / 6×67,5.
- RPE 9.
- Molestia rodilla 3/10.
- Sueño inferior a tendencia.
- Carrera previa el día anterior.
- FC en reposo elevada respecto a tendencia.
- Adherencia 67% últimas dos semanas.

IBERFIT no debe limitarse a guardar datos; debe convertirlos en contexto accionable para el coach, por ejemplo:

> Revisar próxima sesión de tren inferior. La última sesión quedó por debajo de la prescripción, aumentó el esfuerzo percibido y apareció una molestia nueva.

Las acciones sugeridas pueden incluir mantener, ajustar carga, regresar variante, contactar, reprogramar o reevaluar, siempre con decisión final del coach.

## 3. Identidad, perfiles y fotografía

### Cliente
Debe poder tener:
- foto;
- nombre;
- modalidad;
- coach;
- objetivo principal.

### Coach
Debe poder tener:
- foto;
- nombre;
- especialidad/función;
- breve presentación;
- disponibilidad pertinente;
- modalidad;
- acreditaciones seleccionadas cuando proceda.

### Guardrails de avatar
- upload, cambio, recorte 1:1, eliminación y preview;
- fallback con iniciales;
- almacenamiento protegido, no bucket público indiscriminado;
- autorización por propietario/relación;
- límite de peso;
- validación MIME real;
- resize/compresión;
- eliminación de EXIF/geolocalización;
- reemplazo transaccional;
- limpieza del avatar anterior;
- recuperación ante fallo;
- RLS de Storage;
- Coach solo ve clientes asignados;
- Cliente solo ve el coach pertinente.

## 4. Experiencia Cliente

La aplicación Cliente debe ser la más simple de los tres roles y responder a una pregunta: **¿qué tengo que hacer ahora?**

### Inicio / Hoy
Debe priorizar:
- sesión de hoy;
- duración estimada;
- objetivo/foco;
- por qué toca esa sesión;
- mensaje breve del coach;
- estado del plan;
- CTA dominante `Empezar entrenamiento`.

Después, y con menor jerarquía:
- próxima sesión;
- adherencia;
- progreso;
- mensaje pendiente;
- siguiente cita.

La navegación no debe obligar a interpretar múltiples módulos para encontrar la siguiente acción correcta.

## 5. Modo entrenamiento del Cliente

Al iniciar una sesión, la interfaz debe transformarse en un modo específico de entrenamiento, optimizado para:
- uso con una mano;
- sudor;
- pantalla pequeña;
- cansancio;
- consultas de segundos;
- luz variable;
- mínima fricción.

Cada ejercicio debe mostrar inmediatamente:
- próxima serie;
- carga/reps/duración objetivo;
- RIR/RPE objetivo cuando aplique;
- serie o exposición anterior relevante;
- descanso;
- técnica/media pertinente.

Acciones rápidas:
- completar con un toque;
- cambiar carga;
- cambiar repeticiones;
- registrar RIR/RPE;
- editar descanso;
- registrar dolor/molestia;
- copiar serie anterior;
- deshacer;
- ver técnica;
- solicitar alternativa.

### No puedo hacer este ejercicio
Motivos estructurados:
- equipo ocupado;
- equipo no disponible;
- molestia;
- demasiado difícil;
- demasiado fácil;
- otro.

Las alternativas deben provenir de relaciones validadas por biblioteca/coach; no inventarse sin control durante una sesión real.

## 6. Offline y resiliencia de sesión

Ninguna sesión puede perderse por conectividad.

Debe sobrevivir a:
- señal deficiente;
- Wi-Fi/4G cambiante;
- bloqueo del dispositivo;
- cambio de aplicación;
- retorno desde background;
- token expirado;
- refresh;
- reinicio PWA;
- reintentos diferidos.

Cada serie registrada debe quedar protegida localmente y sincronizarse de manera idempotente. Una sesión de 45 minutos no puede perder datos por actualización o reconexión.

## 7. Modelo de fuerza

Separar estrictamente:

### Prescripción
- series;
- repeticiones;
- carga;
- duración;
- distancia;
- tempo;
- descanso;
- RIR;
- RPE;
- objetivo.

### Resultado
- realmente realizado;
- momento;
- carga;
- repeticiones;
- duración;
- RIR/RPE;
- dolor;
- notas;
- interrupciones.

El modelo debe soportar, aunque no todos los controles estén siempre visibles:
- calentamientos;
- series efectivas;
- top set;
- back-off;
- unilateral derecha/izquierda;
- isometrías;
- drops;
- superseries;
- biseries;
- triseries;
- circuitos;
- rondas;
- AMRAP;
- Tabata;
- trabajo por tiempo;
- trabajo por distancia;
- descansos personalizados.

## 8. Planned vs Actual

Debe ser un concepto transversal.

### Fuerza
Objetivo: 4 × 8 × 70.
Resultado: 8 / 8 / 7 / 6 × 70.

### Running
Objetivo: 6 × 800 m a 4:50/km.
Resultado por intervalo: 4:45 / 4:47 / 4:50 / 4:55 / 5:02 / 5:08.

IBERFIT debe poder detectar desviaciones relevantes, por ejemplo deriva de ritmo o caída de rendimiento, y presentarlas como contexto para revisión profesional, no como diagnóstico automático.

## 9. Running como dominio propio

Running no debe almacenarse como un ejercicio genérico de duración.

Debe soportar sesiones estructuradas:
- calentamiento;
- bloques/repeticiones;
- recuperación;
- vuelta a la calma;
- carrera continua;
- intervalos;
- fartlek;
- progresivos;
- run/walk;
- cuestas;
- treadmill;
- exterior;
- recuperación;
- tempo;
- umbral;
- tirada larga.

Objetivos posibles:
- tiempo;
- distancia;
- ritmo;
- FC;
- zona FC;
- RPE;
- potencia cuando proceda.

## 10. FC y zonas

Las zonas deben ser entidades reales:
- calculadas;
- versionadas;
- fechadas;
- modificables;
- con origen conocido.

Posibles bases:
- FC máx observada;
- FC máx estimada;
- test;
- FC de reserva;
- umbral;
- configuración manual del coach.

El Step Test/ΔFC puede integrarse como parte metodológica.

El histórico debe conservar las zonas utilizadas en el momento de la prescripción. Cambiar zonas futuras no debe reinterpretar retroactivamente sesiones antiguas.

## 11. Wearables — arquitectura y dirección

IBERFIT ya contempla proveedores y bridges para:
- Apple Health / HealthKit;
- Health Connect;
- Samsung Health;
- Wear OS Health Services;
- BLE;
- Strava;
- Garmin Connect;
- Fitbit / Google Health;
- Oura;
- archivo normalizado.

El objetivo futuro es activar progresivamente conexiones reales sin fingir integraciones no disponibles.

### Métricas relevantes
- pasos;
- minutos activos;
- sueño;
- FC reposo;
- HRV/VFC;
- energía activa;
- minutos de entrenamiento;
- métricas específicas de actividad cuando proceda.

### Principio
Los wearables complementan el feedback subjetivo; no lo sustituyen.

## 12. Separar lectura y prescripción wearable

Dos flujos independientes:

### A. Leer lo ocurrido
Wearable → IBERFIT.

Ejemplos:
- distancia;
- tiempo;
- FC;
- cadencia;
- desnivel;
- splits;
- zonas.

### B. Enviar lo prescrito
IBERFIT → wearable.

Ejemplos:
- duración;
- intervalos;
- ritmo;
- zonas;
- recuperación;
- calentamiento/enfriamiento.

No mezclar ambos problemas en una única abstracción opaca.

## 13. Apple Watch / HealthKit / WorkoutKit

Dirección aprobada:
- HealthKit para lectura/autorización de datos pertinentes;
- WorkoutKit para entregar sesiones estructuradas cuando la plataforma lo permita;
- posible experiencia `Enviar a Apple Watch`;
- integración de intervalos, objetivos de ritmo/FC y bloques de recuperación;
- consentimiento por categorías;
- bridge nativo ligero, no reescritura completa del producto.

## 14. Garmin

Dirección aprobada:
- evaluar Training API para publicar entrenamientos/planes;
- Garmin Connect como fuente de actividades;
- circuito objetivo: IBERFIT prescribe → Garmin recibe → cliente ejecuta → Garmin registra → IBERFIT importa → Coach revisa.

## 15. Health Connect / Android

Dirección aprobada:
- Health Connect como integración principal para Android moderno;
- permisos mínimos por capacidad;
- lectura histórica limitada y gobernada;
- no solicitar full history/background/write de forma indiscriminada;
- bridge nativo Android ligero cuando sea necesario.

## 16. Strava

Strava puede funcionar como proveedor adicional de interoperabilidad:
- OAuth;
- actividades;
- rutas/equipamiento cuando sea útil;
- webhooks;
- importación automática.

No debe convertirse en el centro de la arquitectura ni duplicar actividades ya recibidas por otro proveedor.

## 17. Oura / WHOOP y readiness

Pueden aportar contexto de:
- sueño;
- HRV/VFC;
- FC reposo;
- recovery/readiness;
- workouts;
- actividad.

Guardrail: IBERFIT no debe obedecer ciegamente un readiness score propietario. Debe exponer señales explicables y dejar la decisión al coach.

## 18. Deduplicación de actividades

Una misma actividad puede llegar por múltiples rutas, p. ej. Apple Watch → Health → Strava e independientemente Strava → IBERFIT.

Modelo mínimo:
- `external_activity_id`;
- proveedor;
- dispositivo;
- inicio;
- fin;
- duración;
- distancia;
- fingerprint;
- relación entre copias;
- fuente preferida;
- procedencia por métrica.

La deduplicación debe ser determinista, idempotente y más robusta que `mismo día + misma distancia`.

## 19. Histórico inmutable y versionado

Separar:
- plantilla actual;
- plan/version;
- sesión prescrita;
- snapshot de prescripción ejecutada;
- ejecución real.

Editar una plantilla futura no puede modificar retrospectivamente el historial real de una sesión ya prescrita/ejecutada.

## 20. Coach — Home y Action Center

La Home del Coach debe priorizar decisiones, no dashboards.

Ejemplos de señales:
- carrera por debajo del objetivo + esfuerzo alto;
- molestia nueva;
- sesiones omitidas;
- plan que termina pronto;
- progresión consistente que merece revisión;
- feedback sin revisar;
- reevaluación pendiente.

Cada señal debe enlazar directamente a una acción.

### Coach Action Center
Debe combinar señales procedentes de:
- sesiones;
- feedback;
- adherencia;
- dolor;
- objetivos;
- calendario;
- running;
- wearables;
- IRI inicial;
- reevaluaciones;
- cambios de plan.

Y convertirlas en acciones como:
- revisar;
- progresar;
- mantener;
- contactar;
- reprogramar;
- reevaluar.

## 21. Coach Session Cockpit

Durante una sesión presencial, Coach necesita una superficie ultrarrápida específica para móvil/tablet.

Debe mostrar:
- cliente seleccionado;
- ejercicio actual;
- histórico inmediato relevante;
- serie actual;
- descanso;
- progreso de la sesión.

Acciones grandes y táctiles:
- Completar;
- +2,5 kg;
- −2,5 kg;
- Alternativa;
- Molestia;
- Nota.

Todo lo no esencial debe desaparecer durante la ejecución.

## 22. Motor de planificación

La planificación debe entender:
- bloques;
- semanas;
- objetivo de bloque;
- foco;
- frecuencia;
- progresión;
- regresión;
- volumen;
- intensidad;
- recuperación;
- variantes;
- equipamiento;
- restricciones;
- fuerza;
- running;
- circuitos.

Operaciones rápidas:
- duplicar semana;
- duplicar sesión;
- aplicar progresión;
- reemplazar ejercicio en bloque;
- reemplazar solo hoy;
- aplicar alternativa a un cliente;
- desplazar semana;
- descargar volumen;
- conservar siempre el histórico.

## 23. Contexto previo durante planificación

Al planificar un ejercicio, Coach debe poder ver exposiciones previas y tendencias relevantes.

Ejemplo:
- Press banca: 70×8×3 → 72,5×8/8/7 → 72,5×8×3;
- RIR 3 → 2 → 2.

IBERFIT puede presentar una señal explicable como `Progresión consistente`, con acciones `Mantener`, `+2,5 kg`, `Personalizar`. La decisión final es profesional.

## 24. IA — papel aprobado

La IA debe ser transversal, casi invisible y orientada a ahorrar interpretación manual.

Usos adecuados:
- briefing previo a atender a un cliente;
- resumen de dos semanas;
- detección de anomalías;
- preparar decisiones;
- borradores de informes;
- sugerir revisión de alternativas ya permitidas;
- priorizar señales.

No debe:
- cambiar silenciosamente cargas;
- diagnosticar;
- sustituir criterio profesional;
- modificar permisos;
- inventar restricciones;
- ejecutar cambios relevantes sin aceptación cuando impliquen una decisión del coach.

## 25. Admin Command Center

Admin debe ser una experiencia distinta a Coach.

### Personas
- clientes;
- coaches;
- asignaciones;
- roles;
- estados.

### Operación
- agenda;
- planes pendientes;
- incidencias;
- actividad;
- sincronizaciones fallidas.

### Calidad
- ejercicios;
- multimedia;
- contenido;
- duplicados;
- datos incompletos.

### Seguridad
- cambios de rol;
- accesos;
- acciones sensibles;
- fallos de autorización;
- auditoría.

### Negocio
- leads;
- IRI;
- conversión;
- modalidades;
- renovaciones;
- sesiones;
- retención;
- ingresos.

### Producto
- activación;
- abandono de onboarding;
- uso;
- adherencia;
- errores por flujo;
- rendimiento.

## 26. Reordenación del roadmap

Antes de escalar CRM/retención/pagos, priorizar el núcleo que mejora el servicio por el que paga el cliente:
1. ejecución fiable/offline;
2. Planned vs Actual + snapshots históricos;
3. modelo fuerza/running;
4. perfiles/foto Cliente-Coach;
5. Coach Session Cockpit;
6. Cliente `Hoy`;
7. running estructurado;
8. Connected Health real;
9. Apple Watch/Garmin workout delivery;
10. Progress Hub accionable;
11. Coach Action Center;
12. después CRM/retención/pagos;
13. IA transversal sobre una base de datos fiable.

## 27. Health Score / Retention

Evitar un score opaco tipo `76/100` como superficie principal.

Preferir señales explicables:
- adherencia;
- plan próximo a vencer;
- esfuerzo elevado repetido;
- cancelaciones;
- ausencia de contacto;
- evolución;
- renovación.

Puede existir una clasificación interna de riesgo, pero toda acción debe poder explicarse.

## 28. Progress Hub

Debe contar una historia, no acumular gráficas.

Ejemplo:
- objetivo;
- consistencia;
- evolución running;
- evolución fuerza;
- molestias;
- composición corporal cuando sea relevante;
- lectura/comentario del coach.

Cada métrica debe justificar una decisión.

### Gráficas por ejercicio
Posibles ejes:
- carga;
- repeticiones;
- volumen útil;
- RIR;
- e1RM cuando metodológicamente proceda;
- histórico;
- récords pertinentes.

Filtros:
- 4 semanas;
- 3 meses;
- 1 año.

Marcadores de contexto:
- cambio de variante;
- descarga;
- molestia;
- nuevo bloque.

## 29. Calendario unificado

Una sola cronología/calendario debe poder representar:
- sesión presencial;
- fuerza autónoma;
- running;
- descanso;
- reevaluación;
- IRI;
- cita;
- competición/evento objetivo.

Estados:
- prescrito;
- realizado;
- reprogramado;
- omitido.

## 30. Objetivos estructurados

No limitar objetivos a texto libre.

Debe poder existir:
- objetivo principal;
- fecha esperada;
- métrica asociada;
- baseline;
- estado actual;
- objetivos secundarios;
- evidencia conectada;
- relación con planificación.

## 31. Feedback subjetivo

Mantener como pieza indispensable:
- RPE;
- RIR;
- molestias;
- sensación;
- energía;
- comentario.

Sensores y wearables no sustituyen contexto humano como miedo, molestias, enfermedad, equipo disponible, guardias, incomodidad o percepción de esfuerzo.

## 32. Comunicación contextual Coach-Cliente

No convertir automáticamente IBERFIT en un clon de WhatsApp.

La comunicación debe poder quedar asociada a:
- sesión;
- ejercicio;
- plan;
- feedback;
- objetivo.

Ejemplo:
- comentario del Coach en una sesión;
- respuesta del Cliente con molestia;
- trazabilidad vinculada a esa sesión.

## 33. Modalidades Presencial / Híbrida / Online

Misma base de datos y plan unificado, experiencia adaptada.

### Presencial
- agenda;
- Coach;
- sesión guiada;
- registro ultrarrápido.

### Online
- siguiente tarea;
- vídeo/técnica;
- feedback;
- adherencia;
- comunicación;
- autogestión.

### Híbrida
Combinar presencial, running autónomo y fuerza online dentro de un único plan, sin duplicación.

## 34. Vídeo técnico del Cliente

Dirección futura aprobada para coaching online/híbrido:
- solicitar vídeo en una serie concreta;
- Cliente graba/sube;
- Coach recibe cola de revisión;
- marcar visto;
- comentario;
- posible anotación futura;
- relación con ejercicio/sesión;
- retención y privacidad estrictas.

## 35. Biblioteca de ejercicios como conocimiento

Debe evolucionar desde `ejercicio + vídeo` hacia una base de conocimiento con:
- patrón;
- musculatura;
- equipamiento;
- dificultad;
- unilateralidad;
- movilidad requerida;
- regresiones;
- progresiones;
- alternativas;
- contraindicaciones relativas configurables;
- instrucciones;
- errores frecuentes;
- cues;
- variantes.

Guardrail existente se mantiene: Coach usa la biblioteca; Admin gobierna catálogo/nomenclatura.

## 36. Resúmenes wearable accionables

No volcar muestras crudas por defecto. Transformación objetivo:

**raw → resumen → señal → decisión**.

Ejemplo running:
- 52:18;
- 7,8 km;
- FC media 147;
- Z2 68%;
- ritmo 6:42/km;
- comparación con sesiones equivalentes.

## 37. Privacidad y seguridad de Connected Health

Aplicar:
- consentimiento explícito por proveedor;
- permisos mínimos;
- scopes por categoría;
- revocación fácil;
- desconexión;
- última sincronización visible;
- explicación de qué puede ver el Coach;
- eliminación/exportación;
- trazabilidad de origen.

OAuth/tokens:
- server-side;
- cifrado;
- refresh controlado;
- nunca logs;
- webhooks validados;
- protección replay;
- idempotencia;
- rate limiting.

## 38. Control del Cliente sobre integraciones

Pantalla `Dispositivos y servicios` con:
- proveedor;
- estado;
- última sincronización;
- categorías compartidas;
- administrar datos;
- desconectar.

Coach puede sugerir conexión, pero no autorizar ni conectar el dispositivo del Cliente.

## 39. Observabilidad Admin para integraciones

Admin necesita monitorización agregada por proveedor:
- conectados;
- sanos;
- errores;
- reconexión requerida;
- última sync;
- reintentos;
- estado seguro.

Nunca exponer tokens o secretos.

## 40. Máquina de estados de sincronización

Mantener estados explícitos y transiciones controladas:
- disponible;
- conectando/autorizando;
- conectado;
- sincronizando;
- pausado;
- revocado;
- error;
- no disponible.

## 41. Accesibilidad

Continuar elevando:
- contraste crema/dorado/verde;
- no comunicar solo mediante color;
- focus visible;
- teclado;
- targets táctiles adecuados;
- reducción de movimiento;
- nombres accesibles;
- timers accesibles;
- gráficas con resumen textual;
- zoom;
- orientación;
- tablet landscape;
- safe areas.

## 42. PWA + capa nativa ligera

Dirección aprobada:
- PWA/web sigue siendo producto principal;
- no reescribir IBERFIT completo en Swift/Kotlin;
- añadir capa/bridge nativo cuando una capacidad lo exija.

### iOS
- HealthKit;
- WorkoutKit;
- background;
- biometría/passkeys;
- notificaciones.

### Android
- Health Connect;
- Health Services;
- background;
- biometría/passkeys;
- notificaciones.

La lógica central y el diseño de IBERFIT permanecen unificados.

## 43. Autenticación premium

Objetivo:
- primer acceso seguro;
- después passkey/Face ID/Touch ID en dispositivo confiable;
- reautenticación ante sesión expirada, dispositivo nuevo o riesgo;
- biometría no sustituye la autenticación real ni debe ser una contraseña local débil.

## 44. Métricas de producto útiles

### Cliente
- IRI → plan preparado;
- plan → primera sesión;
- adherencia;
- feedback completado;
- semanas activas;
- reevaluaciones;
- objetivos;
- renovación.

### Coach
- tiempo hasta preparar plan;
- tiempo de registro de sesión;
- feedback pendiente;
- clientes que requieren atención;
- acciones resueltas;
- planificaciones vencidas.

### Admin
- activación;
- conversión;
- adherencia;
- retención;
- capacidad Coach;
- renovaciones;
- incidencias.

No optimizar el producto para `tiempo en app` como fin en sí mismo.

## 45. No priorizar todavía

Evitar desviar recursos hacia:
- feed social genérico;
- monedas;
- badges infantiles;
- marketplace;
- chatbot IA omnipresente;
- contador de calorías genérico;
- clon de Strava;
- dashboards excesivos;
- ranking entre clientes;
- readiness opaco;
- sistema operativo de smartwatch propio.

## 46. Matriz mínima de QA para esta evolución

Proteger especialmente:
- sesión ejecutada con pérdida de conexión;
- cierre de app durante serie;
- background/foreground;
- cambio de Coach con sesiones existentes;
- edición del plan tras ejecución;
- conflicto Coach/Cliente;
- misma actividad externa recibida dos veces;
- Garmin + Strava duplicados;
- OAuth expirado;
- revocación de permisos;
- webhook repetido;
- webhook fuera de orden;
- cambios de zona horaria;
- actividad que cruza medianoche;
- km/millas;
- kg/lb;
- wearable sin FC;
- valores corruptos;
- imagen falsa con extensión JPG;
- imagen enorme;
- EXIF;
- upload interrumpido;
- sesión expirada durante entrenamiento;
- cache antigua tras despliegue.

## 47. Arquitectura conceptual de producto

Seis motores:

1. **Identity** — Cliente / Coach / Admin, perfil, foto, roles, relaciones.
2. **Coaching** — objetivos, notas, decisiones, feedback, Action Center.
3. **Training** — plan, bloques, fuerza, running, sesiones, resultados.
4. **Intelligence** — progreso, comparación, alertas, tendencias, recomendaciones explicables.
5. **Connected Health** — Apple, Garmin, Health Connect, Strava, Oura, WHOOP y futuros proveedores.
6. **Operations** — agenda, CRM, pagos, renovaciones, Admin, observabilidad.

## 48. Jerarquía de ejecución aprobada

### Fundacional
- ejecución fiable/offline;
- Planned vs Actual;
- snapshots históricos;
- modelo fuerza/running.

### Alta
- foto/perfiles Cliente-Coach;
- Coach Session Cockpit;
- Cliente `Hoy`;
- running estructurado;
- Connected Health real;
- Apple Watch/Garmin workout delivery;
- Progress Hub accionable;
- Coach Action Center.

### Después
- CRM/retención/pagos;
- IA transversal más profunda;
- capacidades experimentales.

## 49. Experiencia objetivo de referencia

Coach prescribe una carrera estructurada para Isabella:
- 10' Z2;
- 6×800 m @ 4:50–5:00/km;
- 90'' recuperación;
- 10' Z2.

Cliente ve:
- `Mañana · Intervalos`;
- CTA `Enviar a Apple Watch`.

Ejecuta sin introducir datos manualmente.

IBERFIT recibe:
- distancia;
- tiempos;
- splits;
- FC;
- zonas;
- ejecución real.

Cliente aporta:
- RPE 8;
- gemelo 2/10.

Coach recibe:
- señal de revisión;
- desviación de los últimos intervalos;
- FC respecto a sesión comparable;
- nueva molestia leve;
- acceso directo a la sesión.

El Coach decide la adaptación siguiente. Esa decisión pasa a ser contexto del proceso.

## 50. Definición final de producto

IBERFIT debe ser una plataforma de coaching premium donde:
- el IRI establece el punto de partida;
- la planificación tiene intención y versión;
- la ejecución real nunca se pierde;
- lo planificado se compara con lo realizado;
- los sensores complementan, no sustituyen, la experiencia humana;
- cada dato conserva procedencia;
- el Coach recibe decisiones preparadas, no ruido;
- el Cliente recibe claridad, no complejidad;
- Admin recibe control y trazabilidad;
- la IA ayuda sin usurpar criterio profesional;
- el histórico es fiable;
- las integraciones son seguras y explícitas;
- todo cambio relevante pasa por QA, Canary y verificación real antes de producción.

Este blueprint queda aceptado íntegramente como referencia de dirección de producto. Las futuras lluvias de ideas deberán clasificarse respecto a este documento como: **imprescindible, diferencial, experimental o descartable**, sin degradar los principios aquí establecidos.
