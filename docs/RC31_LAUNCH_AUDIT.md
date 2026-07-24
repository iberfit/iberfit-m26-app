# IBERFIT M26 RC31 — Auditoría maestra de lanzamiento

Estado: EN DESARROLLO
Rama exclusiva: `canary/rc31`
Base inmutable de rollback: RC30, commit `3cfb3958ae77b551696852efcd44df0fb54cb75f`
Canary objetivo: `m26-canary.iberfit.cl`

## 1. Reglas inmutables

- [ ] No modificar `main`.
- [ ] No modificar `iberfit.cl`.
- [ ] No modificar ni reemplazar `app.iberfit.cl`.
- [ ] No modificar ni reemplazar `coach.iberfit.cl`.
- [ ] No utilizar clientes reales durante desarrollo o QA.
- [ ] No utilizar `service_role`.
- [ ] No publicar en producción sin autorización explícita.
- [ ] Todo cambio se valida localmente y después en canary.
- [ ] RC30 permanece disponible como rollback.
- [ ] La IA propone; el Coach decide.
- [ ] Borrador, aprobación y publicación son estados diferentes.
- [ ] Ningún dato ausente se convierte en cero.
- [ ] Ninguna puntuación o clasificación se presenta sin metodología aplicable.
- [ ] Ningún contenido privado del Coach se proyecta al Cliente.

## 2. Evidencia ya aprobada en RC30

- [x] Recuperación de contraseña Coach QA.
- [x] Recuperación de contraseña Cliente QA.
- [x] Login Coach QA.
- [x] Login Cliente QA.
- [x] CI de GitHub Actions verde.
- [x] Cloudflare desplegando el commit autorizado.
- [x] Runtime `qaOnly=true`.
- [x] Producción no modificada.
- [x] PWA instalable en Chrome.
- [x] PWA abre en ventana independiente.
- [x] Icono e identidad IBERFIT presentes.
- [x] Navegación PWA offline de pantallas previamente cargadas.
- [x] Borrador local de bienestar recuperado tras recarga.
- [x] Envío remoto de bienestar Cliente → Coach.
- [x] Bienestar persistente tras recarga.
- [x] Borrador de sesión Coach invisible al Cliente.
- [x] Informes aprobados pero no publicados invisibles al Cliente.
- [x] Nota privada ausente de la navegación y vistas Cliente revisadas.
- [x] Cliente sin sesión publicada no puede iniciar sesión guiada.

## 3. Gates todavía pendientes

- [ ] Cliente B QA con expediente propio.
- [ ] Aislamiento cruzado real Cliente A / Cliente B.
- [ ] RLS autenticado comprobado en backend.
- [ ] Admin QA y navegación Admin.
- [ ] Escritura offline y sincronización sin duplicados.
- [ ] Actualización de PWA tras nuevo despliegue.
- [ ] Responsive en móvil físico.
- [ ] Publicar y retirar contenido válido de prueba.
- [ ] Limpieza final de datos QA.
- [ ] Verificación completa en Cloudflare RC31.
- [ ] GO final explícito.

---

# 4. Hallazgos transversales

## GLOBAL-001 — Retícula y alineación visual
Severidad: Alta

- Botones del mismo grupo deben tener altura, padding y alineación coherentes.
- Acción principal, secundaria, destructiva y deshabilitada deben distinguirse.
- Campos, botones y tarjetas deben seguir una misma retícula.
- El diseño debe validarse en escritorio, portátil, tableta y móvil.
- No debe haber dobles scrolls internos.
- No debe haber textos cortados, controles flotantes ni grandes espacios muertos.

Criterio de aceptación:
- Capturas visuales en anchos 360, 768, 1024 y 1440 px.
- Sin overflow horizontal.
- Botones del mismo grupo alineados y con estados de foco visibles.

## GLOBAL-002 — Lenguaje de producto
Severidad: Alta

Eliminar de las vistas Coach y Cliente expresiones técnicas como:

- “dentro del alcance visible”;
- “confirmación segura”;
- “función disponible”;
- “arquitectura preparada”;
- “en pausa por coste”;
- “no activar”;
- “evaluación gratuita”;
- “en espera”.

Criterio de aceptación:
- Los textos explican al usuario qué puede hacer, qué falta y cuál es el siguiente paso.

## GLOBAL-003 — Estados ambiguos
Severidad: Bloqueante

Eliminar o redefinir:

- `Sin estado`;
- `Estado: Confirmado`;
- `Todo confirmado`;
- `Seguimiento activo`;
- `Seguimiento confirmado`;
- `Contexto disponible` cuando el contexto está incompleto.

Criterio de aceptación:
- Cada estado identifica exactamente la entidad: expediente, acceso, publicación, sincronización, planificación o cita.
- `Todo confirmado` no parece botón si no es interactivo.
- Estado de sincronización: “Sin cambios pendientes” y última actualización.

## GLOBAL-004 — Estados vacíos
Severidad: Alta

- Reducir tarjetas vacías gigantes.
- Sustituir lenguaje técnico por explicación humana.
- Incluir una acción útil cuando corresponda.

## GLOBAL-005 — Fechas civiles y zona horaria
Severidad: Bloqueante

Defecto observado:
- IRI mostrado el 17 jul 2026 al Coach y el 16 jul 2026 al Cliente.

Criterio de aceptación:
- Fechas de evaluación iguales en Coach, Cliente, informes y exportaciones.
- Las fechas sin hora no deben convertirse accidentalmente desde UTC.
- Zona horaria explícita para citas.

## GLOBAL-006 — Foto de perfil opcional
Severidad: Alta, no bloqueante

- Cliente puede subir, cambiar o eliminar foto.
- Se muestra en cartera, expediente, agenda y portal Cliente.
- Si no hay imagen, se utiliza la inicial.
- JPG, PNG y WEBP; recorte cuadrado y tamaño limitado.
- Acceso exclusivo del Cliente y Coach/Admin autorizados.

## GLOBAL-007 — Siguiente acción recomendada
Severidad: Alta

Las pantallas deben guiar:

`Diagnóstico → Objetivos → Ciclo → Sesiones → Revisión → Publicación → Seguimiento`

---

# 5. Clientes y expediente

## CLIENT-001 — Tarjeta de cliente
Severidad: Alta

- Acción explícita “Abrir expediente”.
- Estado del expediente, acceso y plan claramente separados.
- Próxima cita y tarea pendiente.
- Accesibilidad mediante teclado.

## CLIENT-002 — Eliminar `IRI 80`
Severidad: Bloqueante

No mostrar una puntuación global sin validación metodológica.

Sustituir por:

- fecha de última evaluación;
- estado de la evaluación;
- resumen por dominios;
- próxima reevaluación.

## CLIENT-003 — Contexto operativo del expediente
Severidad: Alta

Mostrar:

- modalidad;
- fecha de ingreso;
- Coach asignado;
- objetivo principal;
- ciclo vigente;
- próxima sesión;
- estado de acceso;
- tarea recomendada.

## CLIENT-004 — Archivos y mediciones
Severidad: Bloqueante

Área protegida para:

- bioimpedancia;
- fotografías o PDF;
- informes externos;
- mediciones;
- fecha, autor, dispositivo y procedencia.

---

# 6. Diagnóstico IRI

## IRI-001 — Evaluación guiada por etapas
Severidad: Bloqueante

Flujo mínimo:

1. Identificación y objetivo.
2. Antecedentes y limitaciones.
3. Composición corporal.
4. Capacidad cardiorrespiratoria.
5. Fuerza y función.
6. Movilidad.
7. Revisión.
8. Aprobación.
9. Informe.
10. Publicación.

## IRI-002 — Evidencia científica
Severidad: Bloqueante

Cada prueba debe contener:

- objetivo;
- protocolo exacto;
- población validada;
- condiciones previas;
- unidades;
- criterio de interrupción;
- resultado bruto;
- fórmula;
- baremo por edad/sexo/población cuando exista;
- fuente científica;
- versión del baremo;
- límites de aplicabilidad.

Cuando no exista baremo aplicable:

> Resultado registrado, sin clasificación por falta de baremo aplicable.

## IRI-003 — Prohibición de extrapolación
Severidad: Bloqueante

- No extrapolar baremos fuera de edad, sexo o población.
- No inventar puntuaciones.
- No clasificar cuando falten variables.
- Dato bruto e interpretación deben almacenarse separados.

## IRI-004 — Composición corporal completa
Severidad: Bloqueante

- Peso.
- Talla.
- IMC calculado.
- Porcentaje y masa grasa.
- Masa libre de grasa.
- Masa muscular cuando el equipo la entregue.
- Agua corporal.
- Grasa visceral.
- Perímetros.
- Marca y modelo del equipo.
- Condiciones y hora de medición.
- Archivo original.

## IRI-005 — Bioimpedancia adjunta
Severidad: Bloqueante

- Imagen o PDF.
- Vista previa.
- Reemplazo sin destruir historial.
- Aislamiento por cliente.
- Métricas ausentes como “Sin registro”, nunca cero.

## IRI-006 — Step test
Severidad: Bloqueante

- Protocolo.
- Altura del escalón.
- Duración.
- Cadencia.
- FC basal.
- FC final.
- FC al minuto.
- `ΔFC = FC final − FC al minuto`.
- RPE.
- Síntomas.
- Motivo de interrupción.

## IRI-007 — Fuerza por patrones
Severidad: Bloqueante

- Sentadilla.
- Bisagra.
- Empuje.
- Tracción.
- Estabilidad del tronco.
- Transporte o agarre.
- Función de extremidades inferiores.
- Lado derecho/izquierdo cuando corresponda.
- Carga, repeticiones, tiempo y unidad.
- Baremo aplicable.

## IRI-008 — Movilidad y dolor
Severidad: Bloqueante

- Tobillo.
- Cadera.
- Columna torácica.
- Hombro.
- Asimetrías.
- Dolor y limitaciones.
- Sin diagnósticos automáticos.

## IRI-009 — Resultado por dominios
Severidad: Bloqueante

No utilizar una puntuación global artificial.

Estados permitidos:

- Dentro del rango de referencia.
- Área a desarrollar.
- Requiere seguimiento.
- Sin datos suficientes.
- Sin baremo aplicable.

## IRI-010 — Flujo editorial
Severidad: Bloqueante

`Borrador → Completo → Aprobado → Publicado`

Aprobar no publica.

## IRI-011 — Historial y comparación
Severidad: Alta

- Evaluaciones anteriores.
- Comparación por variables equivalentes.
- Procedencia y condiciones comparables.
- Trazabilidad de autor y modificaciones.

---

# 7. Planificación

## PLAN-001 — Planificación estructurada
Severidad: Bloqueante

No limitar el ciclo a nombre, fechas y texto libre.

Debe incluir:

- Coach.
- modalidad;
- IRI de referencia;
- objetivo principal y secundarios;
- limitaciones;
- disponibilidad;
- material;
- frecuencia semanal;
- duración por sesión;
- distribución presencial/guiada/autónoma;
- número estimado de sesiones.

## PLAN-002 — Fases del ciclo
Severidad: Bloqueante

Cada fase:

- nombre;
- fechas;
- objetivo;
- frecuencia;
- volumen;
- intensidad;
- progresión;
- criterios de ajuste;
- reevaluación.

## PLAN-003 — Objetivos medibles
Severidad: Bloqueante

- Variable.
- Unidad.
- valor inicial;
- objetivo;
- plazo;
- criterio de cumplimiento.

## PLAN-004 — Guardado
Severidad: Bloqueante

- Guardar borrador.
- Autoguardado o confirmación.
- Última modificación.
- Recuperación.
- Control de versiones.

## PLAN-005 — Validar, aprobar y publicar
Severidad: Bloqueante

`Guardar borrador → Revisar → Validar → Aprobar → Publicar`

## PLAN-006 — Vista previa Cliente
Severidad: Bloqueante

La vista previa debe coincidir con lo publicado.

## PLAN-007 — Trazabilidad
Severidad: Alta

Registrar quién creó, modificó, validó, aprobó y publicó.

---

# 8. Constructor de sesiones

## SESSION-001 — Contexto persistente
Severidad: Bloqueante

Siempre mostrar:

- cliente;
- ciclo;
- fase;
- semana;
- objetivo;
- modalidad.

## SESSION-002 — Tipo de sesión
Severidad: Bloqueante

- Vinculada a ciclo.
- Evaluación.
- Independiente, con justificación.

## SESSION-003 — Estructura
Severidad: Bloqueante

- Preparación.
- Parte principal.
- Complementarios.
- Vuelta a la calma.

## SESSION-004 — Guardado seguro
Severidad: Bloqueante

- Guardar borrador.
- Indicador de guardado.
- Protección frente a salida y pérdida de conexión.

## SESSION-005 — Prescripción objetiva
Severidad: Bloqueante

Según ejercicio:

- kg totales;
- kg por mano;
- peso corporal;
- banda;
- placa;
- tiempo;
- distancia;
- velocidad;
- vatios;
- inclinación;
- repeticiones;
- descanso;
- tempo;
- rango.

## SESSION-006 — Unidades estructuradas
Severidad: Bloqueante

No mezclar repeticiones y tiempo en un campo libre.

## SESSION-007 — Trabajo unilateral
Severidad: Bloqueante

- lado derecho;
- lado izquierdo;
- ambos;
- repeticiones por lado;
- carga por lado;
- asimetría.

## SESSION-008 — Series individualizables
Severidad: Alta

- Prescripción común.
- Edición serie a serie.
- Aproximación, efectiva, progresiva o descendente.

## SESSION-009 — RPE y RIR
Severidad: Alta

- Métrica principal.
- Coherencia entre ambas.
- “No aplica”.
- Advertir combinaciones incompatibles.

## SESSION-010 — Tempo
Severidad: Alta

- Tempo estructurado como `3-1-1-0`.
- Indicación cualitativa separada.

## SESSION-011 — Alternativas
Severidad: Bloqueante

- Ejercicio del catálogo.
- Mismo patrón u objetivo.
- Material compatible.
- Motivo de uso.
- No texto libre como sustituto.

## SESSION-012 — Instrucciones
Severidad: Bloqueante

- Indicaciones visibles al Cliente.
- Foco técnico.
- Respiración.
- Rango.
- Criterio para detenerse.
- Nota privada separada.

## SESSION-013 — Progresión
Severidad: Alta

Criterio explícito para mantener, aumentar o reducir.

## SESSION-014 — Grupos
Severidad: Bloqueante

Configurar realmente:

- biserie;
- triserie;
- circuito;
- AMRAP;
- Tabata.

Incluyendo orden, rondas, transiciones, trabajo y descanso.

## SESSION-015 — Biblioteca visual integrada
Severidad: Bloqueante para sesiones autónomas

- Imagen o animación.
- Ficha técnica.
- Errores frecuentes.
- Regresión.
- Progresión.
- Reutilización en Biblioteca, Constructor y Cliente.

## SESSION-016 — Revisión real
Severidad: Bloqueante

Errores bloqueantes:

- sin objetivo;
- sin ciclo o tipo independiente;
- dosificación incompleta;
- unilateral sin lado;
- carga/unidad ausente cuando aplique;
- duración incompatible;
- estructura inválida.

Advertencias:

- sin alternativa;
- sin calentamiento;
- escasa cobertura;
- descanso ausente;
- material incompatible.

## SESSION-017 — Publicación
Severidad: Bloqueante

No habilitar publicación antes de:

- guardar;
- revisar;
- validar;
- aprobar.

## SESSION-018 — Defectos visuales
Severidad: Alta

- Eliminar doble scroll.
- Nombre completo.
- Tarjeta plegable.
- Corregir numeración `1. 1.`.
- Alinear acciones.

---

# 9. Progreso

## PROGRESS-001 — Eliminar puntuación IRI global
Severidad: Bloqueante

Comparar resultados concretos por dominio y prueba.

## PROGRESS-002 — Volumen por unidades compatibles
Severidad: Bloqueante

No promediar métricas heterogéneas.

## PROGRESS-003 — Adherencia
Severidad: Bloqueante

Mostrar:

- completadas;
- planificadas;
- porcentaje;
- periodo;
- reglas para canceladas y parciales.

## PROGRESS-004 — RPE
Severidad: Alta

- Tipo de RPE.
- Número de registros.
- Rango.
- Tendencia.
- Datos ausentes.

## PROGRESS-005 — Filtros temporales
Severidad: Alta

- 7 días.
- 28 días.
- 12 semanas.
- Ciclo.
- Rango personalizado.

## PROGRESS-006 — Evolución por ejercicio
Severidad: Alta

Carga, repeticiones, tiempo, RIR/RPE, fecha, incidencias y tendencia.

## PROGRESS-007 — Evolución de evaluaciones
Severidad: Bloqueante

Comparar variables equivalentes, no `80 → 84`.

## PROGRESS-008 — Lenguaje Cliente
Severidad: Alta

Eliminar reglas internas como:

> no convertir el dato ausente en cero.

Sustituir por explicación comprensible.

## PROGRESS-009 — Singular y plural
Severidad: Baja

Corregir `1 eventos` por `1 evento`.

---

# 10. Actividad, bienestar y hábitos

## ACTIVITY-001 — Origen del registro
Severidad: Bloqueante

Diferenciar:

- registrado por Cliente;
- registrado por Coach a petición del Cliente.

## ACTIVITY-002 — Escalas ancladas
Severidad: Bloqueante

- Energía: 0 sin energía, 10 excelente.
- Sueño: 0 muy malo, 10 excelente.
- Estrés: 0 ninguno, 10 máximo.
- Dolor: 0 sin dolor, 10 máximo imaginable.

## ACTIVITY-003 — Contexto de dolor
Severidad: Bloqueante

Si dolor > 0:

- localización;
- inicio;
- actividad desencadenante;
- limitación;
- observación;
- alerta al Coach.

## ACTIVITY-004 — Detalle del registro
Severidad: Bloqueante

Defecto observado:
- Actividad muestra solo fecha y frase genérica.
- Progreso sí muestra 7 / 6 / 4 / 0.

Coach y Cliente deben ver los valores permitidos y abrir el detalle.

## ACTIVITY-005 — Borrador local
Severidad: Alta

- Asociado a usuario y expediente.
- Caducidad.
- No visible en otra cuenta del mismo dispositivo.
- Se elimina al confirmar.

## ACTIVITY-006 — Hábitos
Severidad: Bloqueante o función oculta

Completar o esconder.

Debe incluir:

- cantidad;
- unidad;
- frecuencia;
- días;
- inicio y término;
- cómo registrar cumplimiento;
- estado;
- vista previa;
- publicar y retirar.

## ACTIVITY-007 — Contradicción de disponibilidad
Severidad: Bloqueante

No mostrar simultáneamente que Hábitos está disponible y no disponible.

## ACTIVITY-008 — Integraciones internas
Severidad: Bloqueante visual

Retirar de Cliente y Coach:

- costes;
- roadmap;
- arquitectura;
- “no activar”;
- estados técnicos.

## ACTIVITY-009 — Importación normalizada
Severidad: Alta

- JSON/CSV.
- Esquema.
- Unidades.
- tamaño;
- validación;
- sanitización;
- vista previa;
- confirmación;
- idempotencia;
- errores por fila.

---

# 11. Informes

## REPORT-001 — Informe IRI único
Severidad: Bloqueante

Evitar dos informes independientes para la misma evaluación. Usar versiones.

## REPORT-002 — Eliminar `80/100` y `Performance`
Severidad: Bloqueante

Resultados por dominio, protocolo, unidad y baremo.

## REPORT-003 — Eliminar contenido ficticio
Severidad: Crítica

No permitir frases como:

- “evaluación ficticia”;
- conclusiones no respaldadas;
- restricciones no evaluadas;
- movilidad no registrada;
- adherencia inexistente.

## REPORT-004 — Trazabilidad de afirmaciones
Severidad: Bloqueante

Cada afirmación debe enlazarse a:

- medición confirmada;
- observación;
- interpretación firmada por Coach.

## REPORT-005 — Autocompletado
Severidad: Alta

Datos objetivos desde el expediente; interpretación editable separada.

## REPORT-006 — Borrador y versiones
Severidad: Bloqueante

- Guardar borrador.
- Autor.
- última modificación;
- número de versión;
- historial.

## REPORT-007 — Vista previa real
Severidad: Bloqueante

La vista previa debe ser el documento final:

- portada;
- tablas;
- gráficos;
- paginación;
- firma;
- fecha;
- versión;
- PDF.

## REPORT-008 — Gestión de publicación
Severidad: Bloqueante

- Publicar.
- Retirar.
- Archivar.
- Sustituir.
- Motivo.
- Autor y fecha.

## REPORT-009 — Validación automática
Severidad: Bloqueante

Detectar:

- periodo inválido;
- evaluación ausente;
- datos de otro cliente;
- contenido ficticio;
- afirmaciones sin fuente;
- campos vacíos;
- contradicciones;
- lenguaje diagnóstico inadecuado.

---

# 12. Notas privadas

## NOTE-001 — Aislamiento
Severidad: Bloqueante

- Solo Coach/Admin autorizado.
- Nunca Cliente.
- Nunca informes, cronologías Cliente ni exportaciones Cliente.

## NOTE-002 — Trazabilidad
Severidad: Alta

- Autor.
- fecha y hora;
- categoría;
- edición con historial;
- archivo;
- fijar nota importante.

## NOTE-003 — Diseño
Severidad: Alta

- Evitar título duplicado.
- Formulario visible arriba.
- Historial compacto.
- Mensaje específico al guardar.

## NOTE-004 — Evidencia QA
Nota creada:

`QA RC30 — nota privada de aislamiento. No contiene datos reales.`

Debe eliminarse durante la limpieza final.

---

# 13. Inteligencia IBERFIT

## AI-001 — Contexto completo
Severidad: Bloqueante

Usar:

- IRI confirmado;
- ciclo;
- fase;
- objetivo;
- experiencia;
- cargas previas;
- adherencia;
- dolor;
- recuperación;
- material;
- modalidad;
- disponibilidad.

## AI-002 — Datos estructurados
Severidad: Bloqueante

Objetivo y material no deben depender de texto libre.

## AI-003 — Falla cerrada
Severidad: Bloqueante

Bloquear o advertir ante:

- dolor;
- alerta pendiente;
- IRI ausente o antiguo;
- edad ausente;
- objetivo ausente;
- material no confirmado;
- cliente ausente.

## AI-004 — Explicabilidad
Severidad: Bloqueante

Cada propuesta debe explicar qué datos justifican cada decisión.

## AI-005 — Propuesta completa
Severidad: Bloqueante

Compatible con el constructor:

- estructura;
- ejercicios;
- carga;
- unidad;
- descanso;
- tempo;
- esfuerzo;
- lado;
- alternativa;
- ajuste.

## AI-006 — Supervisión
Severidad: Inmutable

- La IA no aprueba.
- La IA no publica.
- La IA no progresa cargas automáticamente.
- Coach acepta, modifica o descarta.

## AI-007 — Auditoría
Severidad: Alta

Guardar:

- versión del motor;
- datos utilizados;
- propuesta;
- cambios del Coach;
- decisión final.

---

# 14. Hoy

## TODAY-001 — Contradicción
Severidad: Bloqueante

Defecto:

- “Pendiente de planificación”.
- “Planificación al día”.

Resolver con una única fuente de estado.

## TODAY-002 — Priorización operativa
Severidad: Alta

Mostrar:

- clientes que requieren atención;
- diagnóstico pendiente;
- dolor;
- check-in;
- planificación;
- sesión sin contenido;
- publicación pendiente.

## TODAY-003 — Acciones directas
Severidad: Alta

- Completar IRI.
- Crear planificación.
- Programar cita.
- Revisar alerta.
- Abrir expediente.

## TODAY-004 — Compactar cabecera
Severidad: Alta

Reducir espacio decorativo y mostrar antes la operación diaria.

---

# 15. Agenda

## AGENDA-001 — Modalidad perdida
Severidad: Crítica

Defecto reproducido:

- Se seleccionó “En línea”.
- La propuesta persistió como `Sin modalidad`.
- El error siguió tras recargar.

Criterio de aceptación:
- Modalidad conservada en escritura, lectura, tarjeta, Cliente y backend.

## AGENDA-002 — Propuesta visible al Cliente
Severidad: Crítica

Defecto reproducido:
- Cita en estado `Propuesta` apareció como próxima sesión del Cliente.

Criterio de aceptación:
- Cliente solo ve citas confirmadas/publicadas.
- Propuestas y borradores son solo Coach.

## AGENDA-003 — Campos dinámicos
Severidad: Bloqueante

- Presencial: ubicación.
- En línea: enlace o instrucciones.
- Guiada: sesión publicada.
- Evaluación: tipo de evaluación.

## AGENDA-004 — Estados
Severidad: Bloqueante

- Borrador.
- Propuesta.
- Pendiente.
- Confirmada.
- Reprogramada.
- Cancelada.
- Realizada.
- Ausencia Cliente.
- Ausencia Coach.

## AGENDA-005 — Validaciones
Severidad: Bloqueante

- Inicio y fin.
- fin posterior;
- futuro;
- duración razonable;
- ubicación/enlace;
- cliente;
- modalidad;
- conflicto Coach;
- conflicto Cliente;
- duplicado.

## AGENDA-006 — UX de errores
Severidad: Alta

Mostrar todos los errores simultáneamente y limpiarlos al corregir.

## AGENDA-007 — Vínculo cita–sesión
Severidad: Bloqueante

La cita debe indicar qué contenido se realizará.

## AGENDA-008 — Calendario
Severidad: Alta

- día;
- semana;
- lista;
- filtros;
- disponibilidad;
- conflictos.

## AGENDA-009 — Evidencia QA
La propuesta defectuosa debe conservarse como evidencia hasta corregir y luego eliminarse.

---

# 16. Biblioteca

## LIB-001 — Biblioteca visual
Severidad: Bloqueante para modalidad autónoma/híbrida

Cada tarjeta debe incluir miniatura.

## LIB-002 — Ficha del ejercicio
Severidad: Bloqueante

Al pulsar:

- imagen o animación;
- instrucciones;
- material;
- patrón;
- objetivo;
- nivel;
- errores frecuentes;
- regresión;
- progresión;
- alternativa.

## LIB-003 — Integración única
Severidad: Bloqueante

La misma ficha se utiliza en:

`Biblioteca → Constructor → Vista previa → Ejecución Cliente`

## LIB-004 — Filtros
Severidad: Alta

- patrón;
- material;
- grupo muscular;
- objetivo;
- nivel;
- posición;
- unilateral;
- modalidad.

## LIB-005 — Integridad del catálogo
Severidad: Bloqueante

La UI muestra 367 ejercicios. Verificar contra el catálogo completo preparado previamente y explicar exclusiones, filtros o pérdidas.

## LIB-006 — Favoritos y recientes
Severidad: Media

---

# 17. PWA

## PWA-001 — Nombre
Severidad: Baja

Nombre acordado:

`IBERFIT · Entrenamiento personal`

## PWA-002 — Instalación
Estado: Aprobado.

## PWA-003 — Navegación offline
Estado: Aprobado para lectura de pantallas cargadas.

## PWA-004 — Escrituras offline
Estado: Pendiente.

Criterio:
- cola local;
- reintento;
- idempotencia;
- no duplicado;
- confirmación remota;
- resolución de conflicto.

## PWA-005 — Actualización
Estado: Pendiente.

- Detectar nueva versión.
- No mezclar assets.
- Avisar.
- Actualizar de forma segura.

---

# 18. Admin y aislamiento

## SECURITY-001 — Cliente B QA
Severidad: Gate de lanzamiento

Crear:

`iberfit.cl+qa.m26b@gmail.com`

con expediente demo propio y sin datos del Cliente A.

## SECURITY-002 — Matriz A/B
Severidad: Gate de lanzamiento

Comprobar en ambos sentidos:

- expediente;
- bienestar;
- citas;
- sesiones;
- ejecuciones;
- informes;
- hábitos;
- adjuntos;
- notas privadas;
- progreso.

## SECURITY-003 — RLS
Severidad: Gate de lanzamiento

Probar backend autenticado, no solo navegación oculta.

## SECURITY-004 — Admin
Severidad: Gate de lanzamiento

Definir:

- si tiene shell propio;
- altas;
- invitaciones;
- asignación Coach;
- permisos;
- archivos;
- auditoría;
- sin acceso excesivo innecesario.

## SECURITY-005 — Alta de clientes
Severidad: Bloqueante

Flujo seguro:

- crear expediente;
- invitar;
- activar;
- asignar Coach;
- consentimiento;
- acceso;
- foto opcional;
- revocar acceso.

---

# 19. Plan de implementación RC31

## Fase 0 — Documentación y gates
- [ ] Auditoría versionada.
- [ ] Inventario técnico.
- [ ] Mapa frontend/backend/RPC.
- [ ] Tests iniciales RC31.
- [ ] Rama y rollback verificados.

## Fase 1 — Privacidad crítica
- [ ] Propuestas de citas invisibles.
- [ ] Modalidad persistente.
- [ ] Fecha civil.
- [ ] Cliente B y RLS.
- [ ] Notas privadas.
- [ ] Publicación estricta.

## Fase 2 — IRI científico
- [ ] Protocolos.
- [ ] baremos;
- [ ] composición corporal;
- [ ] adjuntos;
- [ ] evaluación guiada;
- [ ] informe único.

## Fase 3 — Planificación y sesiones
- [ ] Ciclos estructurados.
- [ ] Constructor completo.
- [ ] Revisión.
- [ ] aprobación/publicación.
- [ ] biblioteca visual.

## Fase 4 — Seguimiento
- [ ] Bienestar detallado.
- [ ] hábitos;
- [ ] progreso;
- [ ] métricas;
- [ ] Inteligencia IBERFIT.

## Fase 5 — UX global
- [ ] Retícula.
- [ ] botones.
- [ ] estados.
- [ ] textos.
- [ ] responsive.
- [ ] accesibilidad.

## Fase 6 — QA de lanzamiento
- [ ] Tests unitarios.
- [ ] integración.
- [ ] aislamiento.
- [ ] offline.
- [ ] PWA.
- [ ] Cloudflare.
- [ ] limpieza QA.
- [ ] rollback.
- [ ] GO explícito.

## 20. Criterio final de GO

No existe GO de producción hasta cumplir simultáneamente:

- CI verde.
- Build reproducible.
- Cero secretos.
- Cero fallos de aislamiento.
- Cero borradores visibles al Cliente.
- Cero contenido ficticio.
- IRI científicamente trazable.
- Agenda coherente.
- Sesiones ejecutables.
- Informes válidos.
- Responsive aprobado.
- PWA actualizable.
- Rollback comprobado.
- Autorización explícita de lanzamiento.
