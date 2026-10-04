export const IRI_PROTOCOL_CATALOG_VERSION='iri-protocols-2026.10-v3';

const freezeList=(items=[])=>Object.freeze(items.map((item)=>String(item)));
const freezeProtocol=(protocol)=>Object.freeze({
  ...protocol,
  variants:Object.freeze((protocol.variants||[]).map((item)=>Object.freeze({...item}))),
  material:freezeList(protocol.material),
  startPosition:freezeList(protocol.startPosition),
  steps:freezeList(protocol.steps),
  observe:freezeList(protocol.observe),
  valid:freezeList(protocol.valid),
  invalid:freezeList(protocol.invalid),
  stop:freezeList(protocol.stop),
  record:freezeList(protocol.record),
  interpretation:freezeList(protocol.interpretation),
  visual:Object.freeze({...protocol.visual}),
  form:Object.freeze({...protocol.form}),
  sides:freezeList(protocol.sides||['not-applicable']),
});

const PROTOCOLS=[
  {
    id:'body-composition',step:'composicion',name:'Composición corporal estructurada',area:'Composición corporal',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Medición descriptiva para seguimiento mediante un método y equipo identificados.',
    evaluates:'Peso, distribución corporal y métricas aportadas por el método utilizado en condiciones registradas.',
    doesNotDiagnose:'No diagnostica enfermedad, estado de hidratación ni composición corporal clínica. La bioimpedancia depende de las condiciones de medición.',
    variants:[
      {id:'bioimpedancia-segmental',label:'Bioimpedancia segmental'},
      {id:'bioimpedancia-tetrapolar',label:'Bioimpedancia tetrapolar'},
      {id:'antropometria',label:'Antropometría'},
      {id:'otro',label:'Otro método documentado'},
    ],defaultVariant:'bioimpedancia-segmental',
    material:['Equipo identificado por marca y modelo.','Superficie estable y condiciones compatibles con el fabricante.','Registro de hora, ingesta, hidratación y ejercicio reciente.'],
    startPosition:['Aplicar las indicaciones del equipo o método exacto.','Retirar elementos que alteren la medición cuando corresponda.','Mantener las mismas condiciones en reevaluaciones.'],
    steps:['Confirmar identidad y fecha.','Registrar método, equipo y condiciones antes de medir.','Realizar la medición según el fabricante o protocolo antropométrico.','Revisar valores improbables antes de aceptarlos.'],
    observe:['Condiciones que alteren la comparación.','Posicionamiento y contacto correcto con electrodos o puntos anatómicos.','Coherencia interna de las métricas.'],
    valid:['Método y equipo identificados.','Condiciones registradas.','Medición completada sin error técnico.'],
    invalid:['Equipo sin identificar.','Cambio de método no documentado.','Error técnico, contacto deficiente o condiciones no comparables.'],
    stop:['Malestar de la persona.','Imposibilidad de aplicar el método con seguridad.','Error persistente del equipo.'],
    record:['Método y equipo.','Condiciones de medición.','Métricas disponibles.','Validez, adaptación o motivo de suspensión.'],
    interpretation:['Comparar tendencias solo con método y condiciones compatibles.','Presentar cada métrica de forma descriptiva.','No convertir el conjunto en una puntuación global.'],
    visual:{kind:'body-composition',start:'Preparación y condiciones',finish:'Medición documentada',validCue:'Equipo, postura y condiciones registrados',invalidCue:'Método o condiciones sin documentar'},
    form:{variant:'bodyCompositionMethod',configuration:'bodyCompositionProtocolConfiguration',valid:'bodyCompositionValid',adaptation:'bodyCompositionAdaptationReason',stop:'bodyCompositionProtocolStopReason',target:'bodyCompositionMethod'},sides:['not-applicable'],
  },
  {
    id:'weight-bearing-lunge',step:'movilidad',name:'Rodilla a pared',area:'Movilidad de tobillo',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Dorsiflexión de tobillo en carga medida en centímetros, con tres intentos por lado.',
    evaluates:'Amplitud funcional de dorsiflexión en apoyo y diferencia entre lados.',
    doesNotDiagnose:'No identifica por sí sola la causa anatómica de una limitación ni sustituye una valoración clínica.',
    variants:[{id:'standard-barefoot',label:'Estándar descalzo'},{id:'standard-footwear',label:'Estándar con calzado registrado'},{id:'supported-adaptation',label:'Adaptada con apoyo estable'}],defaultVariant:'standard-barefoot',
    material:['Pared vertical.','Cinta métrica fijada perpendicularmente a la pared.','Superficie firme y estable.'],
    startPosition:['Pie orientado hacia la pared y completamente apoyado.','Talón en contacto con el suelo.','Rodilla alineada con el segundo dedo del pie.'],
    steps:['Acercar la rodilla a la pared sin levantar el talón.','Alejar progresivamente el pie hasta encontrar la máxima distancia válida.','Medir desde el primer dedo o referencia acordada hasta la pared.','Realizar tres intentos por lado con la misma configuración.'],
    observe:['Talón apoyado.','Alineación de rodilla y pie.','Colapso del arco, rotación o desplazamiento del pie.','Dolor y control.'],
    valid:['Rodilla contacta con la pared.','Talón y pie permanecen apoyados.','No cambia la referencia de medición.','La alineación se mantiene dentro del criterio definido.'],
    invalid:['Talón se despega.','Pie gira o se desplaza.','Rodilla no contacta con la pared.','Se cambia la referencia entre intentos.'],
    stop:['Dolor.','Pérdida de equilibrio.','Incapacidad para mantener el apoyo o la alineación.'],
    record:['Tres intentos por lado en centímetros.','Mejor resultado y asimetría.','Variante, calzado, superficie y apoyo.','Dolor, compensaciones, validez y motivo de adaptación o suspensión.'],
    interpretation:['Comparar izquierda y derecha.','Usar la evolución personal con la misma configuración.','Aplicar un baremo solo si coincide con el protocolo exacto.'],
    visual:{kind:'wall-lunge',start:'Pie próximo a la pared',finish:'Máxima distancia válida',validCue:'Talón apoyado y rodilla alineada',invalidCue:'Talón levantado o pie desplazado'},
    form:{variant:'ankleProtocolVariant',configuration:'ankleConfiguration',valid:'ankleValid',adaptation:'ankleAdaptationReason',stop:'ankleStopReason',target:'ankleLeft1'},sides:['left','right'],
  },
  {
    id:'back-saver',step:'movilidad',name:'Back-saver sit-and-reach',area:'Cadena posterior',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Alcance anterior unilateral medido en centímetros con tres intentos por lado.',
    evaluates:'Alcance funcional de la cadena posterior y diferencia entre lados en una configuración estandarizada.',
    doesNotDiagnose:'No determina qué tejido limita el movimiento ni diagnostica una lesión.',
    variants:[{id:'box-standard',label:'Estándar con cajón'},{id:'bench-ruler',label:'Banco y regla milimetrada'},{id:'floor-mat-adapted',label:'Suelo/colchoneta · referencia inicial adaptada'},{id:'adapted-supported',label:'Adaptada con apoyo'}],defaultVariant:'box-standard',
    material:['Cajón o banco estable.','Regla o escala fija en centímetros.','Superficie antideslizante.'],
    startPosition:['Una pierna extendida y la contraria flexionada según el protocolo.','Pelvis orientada al frente.','Manos superpuestas y brazos extendidos.'],
    steps:['Alinear la planta del pie con la referencia.','Avanzar lentamente ambas manos sin rebotes.','Mantener la posición final el tiempo suficiente para leer la medida.','Realizar tres intentos por lado con descanso breve.'],
    observe:['Flexión de la rodilla extendida.','Rotación de pelvis o tronco.','Rebote, impulso o avance asimétrico de manos.','Dolor.'],
    valid:['Rodilla de la pierna evaluada permanece extendida.','Manos avanzan juntas.','No hay rebote.','La configuración se mantiene.'],
    invalid:['Rodilla se flexiona.','Pelvis rota o se desplaza.','Una mano avanza más que la otra.','Se usa impulso.'],
    stop:['Dolor irradiado o agudo.','Mareo.','Pérdida de la posición segura.'],
    record:['Tres intentos por lado.','Mejor resultado y asimetría.','Altura y referencia del cajón o banco.','Validez, dolor y motivo de adaptación o suspensión.'],
    interpretation:['Comparar lados y evolución personal.','No atribuir la limitación a un tejido concreto sin evaluación adicional.','No mezclar resultados de configuraciones distintas.'],
    visual:{kind:'seated-reach',start:'Posición unilateral estable',finish:'Alcance sin rebote',validCue:'Rodilla extendida y manos juntas',invalidCue:'Rebote, rodilla flexionada o pelvis rotada'},
    form:{variant:'posteriorProtocolVariant',configuration:'posteriorConfiguration',valid:'posteriorValid',adaptation:'posteriorAdaptationReason',stop:'posteriorStopReason',target:'posteriorLeft1'},sides:['left','right'],
  },
  {
    id:'modified-thomas',step:'movilidad',name:'Thomas modificado',area:'Movilidad de cadera',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Observación estandarizada de la posición de cadera y muslo con pelvis controlada.',
    evaluates:'Respuesta de la cadera y el muslo al mantener una pierna flexionada con control pélvico.',
    doesNotDiagnose:'No diagnostica acortamientos musculares ni patología de cadera.',
    variants:[{id:'table-edge-standard',label:'Estándar en borde de camilla'},{id:'bench-supported',label:'Adaptada en banco estable'},{id:'floor-mat-observation',label:'Suelo/colchoneta · observación adaptada (no Thomas estándar)'}],defaultVariant:'table-edge-standard',
    material:['Camilla o banco estable de altura documentada.','Espacio para controlar la pierna libre.'],
    startPosition:['Persona en decúbito supino cerca del borde.','Una rodilla llevada al pecho sin perder control lumbar.','Pierna evaluada libre y relajada.'],
    steps:['Estabilizar la pelvis.','Mantener una rodilla hacia el pecho.','Observar la posición del muslo y la rodilla de la pierna evaluada.','Repetir en el lado contrario con la misma configuración.'],
    observe:['Basculación pélvica.','Separación lateral o rotación del muslo.','Posición de cadera y rodilla.','Dolor o protección.'],
    valid:['Pelvis controlada.','Posición inicial reproducible.','Observación bilateral con la misma altura.'],
    invalid:['Pelvis pierde la posición.','La persona se desplaza en la camilla.','La pierna es empujada por el coach.'],
    stop:['Dolor lumbar o de cadera.','Calambre intenso.','Inseguridad en el borde de la camilla.'],
    record:['Resultado por lado.','Altura del apoyo y control pélvico.','Dolor, validez y adaptación.'],
    interpretation:['Usar como observación funcional.','Comparar lados y repetir la misma configuración.','No asignar grados no medidos.'],
    visual:{kind:'supine-leg',start:'Pelvis controlada',finish:'Pierna libre observada',validCue:'Pelvis estable y apoyo seguro',invalidCue:'Basculación o empuje externo'},
    form:{variant:'thomasProtocolVariant',configuration:'thomasConfiguration',valid:'thomasValid',adaptation:'thomasAdaptationReason',stop:'thomasStopReason',target:'thomasLeft'},sides:['left','right'],
  },
  {
    id:'hip-rotation-observation',step:'movilidad',name:'Rotación de cadera observacional',area:'Movilidad de cadera',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Comparación bilateral estructurada de rotación de cadera sin estimar grados no medidos.',
    evaluates:'Simetría, control y respuesta durante una rotación de cadera en posición documentada.',
    doesNotDiagnose:'No cuantifica el rango articular sin goniómetro ni identifica la causa de una asimetría.',
    variants:[{id:'seated-90-90',label:'Sentado 90/90'},{id:'prone-knee-flexed',label:'Prono con rodillas flexionadas'}],defaultVariant:'seated-90-90',
    material:['Banco o camilla estable.','Referencia visual de posición.'],
    startPosition:['Pelvis nivelada.','Cadera y rodilla colocadas según la variante.','Tronco estable.'],
    steps:['Confirmar la posición inicial.','Realizar el movimiento de forma lenta y sin impulso.','Comparar ambos lados con la misma variante.','Repetir si existe una compensación corregible.'],
    observe:['Movimiento de pelvis o tronco.','Asimetría visible.','Dolor, bloqueo o protección.','Control del final de rango.'],
    valid:['Misma posición en ambos lados.','Movimiento sin impulso.','Pelvis y tronco permanecen controlados.'],
    invalid:['Cambio de posición entre lados.','Compensación que impide observar la cadera.','Movimiento forzado por el coach.'],
    stop:['Dolor.','Sensación de bloqueo.','Pérdida de la posición segura.'],
    record:['Variante.','Resultado bilateral.','Compensaciones, dolor y validez.','Motivo de adaptación o suspensión.'],
    interpretation:['Describir simetría y control.','Usar evolución personal con la misma variante.','No aplicar percentiles sin medida angular y protocolo compatible.'],
    visual:{kind:'hip-rotation',start:'Pelvis y tronco estables',finish:'Comparación bilateral',validCue:'Misma posición y movimiento controlado',invalidCue:'Pelvis rota o variante diferente'},
    form:{variant:'hipRotationProtocolVariant',configuration:'hipRotationConfiguration',valid:'hipRotationValid',adaptation:'hipRotationAdaptationReason',stop:'hipRotationStopReason',target:'hipRotationResult'},sides:['bilateral'],
  },
  {
    id:'assisted-squat',step:'movilidad',name:'Sentadilla profunda asistida',area:'Patrón de sentadilla',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Observación del patrón de sentadilla y de la respuesta a una asistencia estandarizada.',
    evaluates:'Profundidad, control, alineación y cambios al usar apoyo o elevación documentados.',
    doesNotDiagnose:'No determina por sí sola la causa de una compensación ni sustituye una valoración clínica.',
    variants:[{id:'counterbalance-support',label:'Apoyo anterior estable'},{id:'heel-elevation',label:'Elevación de talones documentada'},{id:'bodyweight-observation',label:'Sin asistencia'}],defaultVariant:'counterbalance-support',
    material:['Apoyo firme o contrapeso identificado.','Elevación de talones medible cuando se use.','Superficie antideslizante.'],
    startPosition:['Base de pies documentada.','Tronco erguido y apoyo disponible.','Pies completamente apoyados.'],
    steps:['Realizar una sentadilla sin rebote.','Observar profundidad y control.','Repetir con la asistencia definida.','Comparar qué cambia y registrar la configuración.'],
    observe:['Talones.','Trayectoria de rodillas.','Tronco y pelvis.','Desplazamiento lateral.','Dolor y estabilidad.'],
    valid:['Base y asistencia constantes.','Movimiento controlado.','Profundidad identificable.','Sin pérdida de equilibrio.'],
    invalid:['Cambio de base no registrado.','Uso de impulso.','Apoyo inestable.','Dolor o pérdida de control que impide completar.'],
    stop:['Dolor.','Pérdida de equilibrio.','Deterioro técnico repetido.'],
    record:['Profundidad.','Talones, rodillas, tronco y desplazamiento.','Tipo y altura de asistencia.','Validez, dolor y motivo de finalización.'],
    interpretation:['Relacionar el cambio con la asistencia utilizada.','Usar el hallazgo para seleccionar ejercicios y progresiones.','Comparar reevaluaciones solo con la misma configuración.'],
    visual:{kind:'squat',start:'Base y apoyo registrados',finish:'Profundidad controlada',validCue:'Talones apoyados y control',invalidCue:'Impulso, desequilibrio o configuración distinta'},
    form:{variant:'squatProtocolVariant',configuration:'squatConfiguration',valid:'squatValid',adaptation:'squatAdaptationReason',stop:'squatStopReason',target:'squatDepth'},sides:['bilateral'],
  },
  {
    id:'chair-stand-30s',step:'fuerza',name:'Chair Stand de 30 segundos',area:'Fuerza funcional de tren inferior',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Número de incorporaciones completas en 30 segundos con silla y técnica documentadas.',
    evaluates:'Capacidad funcional repetida de sentarse y levantarse bajo un protocolo definido.',
    doesNotDiagnose:'No mide fuerza máxima ni diagnostica una limitación clínica.',
    variants:[{id:'standard-arms-crossed',label:'Estándar con brazos cruzados'},{id:'adapted-arm-support',label:'Adaptada con apoyo de brazos'}],defaultVariant:'standard-arms-crossed',
    material:['Silla estable sin ruedas.','Cronómetro.','Altura de asiento medida.','Pared detrás de la silla cuando sea necesario.'],
    startPosition:['Sentado en el centro de la silla.','Pies apoyados y colocación documentada.','Brazos cruzados en la variante estándar.'],
    steps:['Dar una demostración.','Iniciar el tiempo con la orden acordada.','Contar cada incorporación completa y regreso controlado.','Detener al cumplirse 30 segundos.'],
    observe:['Extensión completa.','Contacto controlado con la silla.','Uso de brazos o impulso.','Alineación, equilibrio y dolor.'],
    valid:['Se alcanza la posición de pie definida.','Se regresa de forma controlada.','No se usa apoyo no permitido.','Se respeta exactamente el tiempo.'],
    invalid:['No completa la extensión.','Se deja caer sobre la silla.','Usa brazos en la variante estándar.','Pierde la base o cambia la silla.'],
    stop:['Dolor.','Mareo.','Pérdida de equilibrio.','Deterioro técnico que comprometa seguridad.'],
    record:['Repeticiones completas.','Altura de silla.','Variante y posición de pies.','Validez, dolor, adaptación y motivo de finalización.'],
    interpretation:['Aplicar baremo solo a la variante estándar compatible.','Usar evolución personal con la misma silla y técnica.','No comparar apoyo de brazos con protocolo estándar.'],
    visual:{kind:'chair-stand',start:'Sentado según protocolo',finish:'Extensión completa',validCue:'Repetición completa y controlada',invalidCue:'Uso de brazos o extensión incompleta'},
    form:{variant:'chairStandProtocolVariant',configuration:'chairStandConfiguration',valid:'chairStandValid',adaptation:'chairStandAdaptationReason',stop:'chairStandStopReason',target:'chairStand30s'},sides:['not-applicable'],
  },
  {
    id:'push-test',step:'fuerza',name:'Prueba de empuje',area:'Fuerza-resistencia de empuje',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Repeticiones válidas de empuje bajo una variante y rango de movimiento definidos.',
    evaluates:'Capacidad de empuje repetido y control técnico en la variante seleccionada.',
    doesNotDiagnose:'No mide fuerza máxima y las variantes no son intercambiables para baremos.',
    variants:[{id:'standard',label:'Flexión estándar'},{id:'knees',label:'Flexión con rodillas'},{id:'incline',label:'Flexión elevada'}],defaultVariant:'standard',
    material:['Suelo o apoyo estable.','Cinta métrica para altura del apoyo elevado.','Referencia de profundidad cuando se utilice.'],
    startPosition:['Manos y base colocadas según la variante.','Cuerpo alineado desde la base de apoyo.','Rango objetivo explicado antes de comenzar.'],
    steps:['Seleccionar y registrar la variante.','Demostrar el rango válido.','Contar solo repeticiones que alcanzan el rango y regresan a la posición inicial.','Finalizar cuando se pierde el criterio técnico o la persona se detiene.'],
    observe:['Alineación de tronco y pelvis.','Profundidad y extensión.','Posición de manos.','Dolor y velocidad.'],
    valid:['Rango completo definido.','Cuerpo mantiene la alineación.','No hay pausas o apoyos no permitidos.'],
    invalid:['Rango incompleto.','Pelvis cae o se eleva de forma marcada.','Rebote o cambio de apoyo.','Variante modificada durante la prueba.'],
    stop:['Dolor.','Pérdida repetida de alineación.','Fallo técnico.','Solicitud de la persona.'],
    record:['Variante.','Altura del apoyo cuando exista.','Repeticiones válidas.','Validez, adaptación, dolor y motivo de finalización.'],
    interpretation:['Solo la variante estándar válida usa baremo estándar.','Comparar evolución con la misma variante y altura.','Las variantes adaptadas son referencia individual.'],
    visual:{kind:'push',start:'Alineación inicial',finish:'Rango válido',validCue:'Cuerpo alineado y rango completo',invalidCue:'Rango incompleto o pelvis desalineada'},
    form:{variant:'pushVariant',configuration:'pushConfiguration',valid:'pushValid',adaptation:'pushAdaptationReason',stop:'pushStopReason',target:'pushVariant'},sides:['not-applicable'],
  },
  {
    id:'trx-row',step:'fuerza',name:'Remo TRX estandarizado',area:'Fuerza-resistencia de tracción',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Repeticiones válidas de tracción con geometría corporal y TRX documentados.',
    evaluates:'Capacidad de tracción repetida y control escapular en una configuración reproducible.',
    doesNotDiagnose:'No mide fuerza máxima y el resultado cambia con el ángulo corporal.',
    variants:[{id:'standing-row-standard',label:'Remo de pie estándar'},{id:'reduced-angle',label:'Ángulo reducido adaptado'}],defaultVariant:'standing-row-standard',
    material:['TRX anclado y revisado.','Cinta métrica.','Referencia para altura de asas y posición de talones.'],
    startPosition:['Cuerpo alineado.','Brazos extendidos y asas a la altura registrada.','Talones a distancia medida del anclaje o referencia.'],
    steps:['Registrar altura de asas y posición de pies.','Iniciar desde brazos extendidos.','Traccionar manteniendo el cuerpo alineado.','Contar solo repeticiones que alcanzan el criterio final y regresan con control.'],
    observe:['Alineación corporal.','Control escapular.','Rango de codo y hombro.','Uso de impulso o cambio de pies.'],
    valid:['Geometría constante.','Rango definido completo.','Cuerpo alineado.','Anclaje seguro.'],
    invalid:['Pies cambian de posición.','Cadera se flexiona o cae.','Impulso o rango incompleto.','Altura de asas no registrada.'],
    stop:['Dolor.','Pérdida de agarre.','Inestabilidad del anclaje.','Deterioro técnico repetido.'],
    record:['Repeticiones.','Altura de asas.','Distancia de talones y posición.','Validez, adaptación y motivo de finalización.'],
    interpretation:['Comparar solo con la misma geometría.','Usar principalmente evolución individual.','No aplicar un baremo si no coincide la configuración.'],
    visual:{kind:'trx-row',start:'Cuerpo inclinado y brazos extendidos',finish:'Tracción con cuerpo alineado',validCue:'Pies y geometría constantes',invalidCue:'Cadera cae o pies se desplazan'},
    form:{variant:'trxProtocolVariant',configuration:'trxConfiguration',valid:'trxValid',adaptation:'trxAdaptationReason',stop:'trxStopReason',target:'trxRowRepetitions'},sides:['not-applicable'],
  },
  {
    id:'core-plank',step:'fuerza',name:'Plancha frontal y lateral',area:'Control del tronco',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Tiempo mantenido con criterios técnicos y lados registrados por separado.',
    evaluates:'Resistencia isométrica y control técnico del tronco en las variantes realizadas.',
    doesNotDiagnose:'No diagnostica estabilidad lumbar ni dolor de origen específico.',
    variants:[{id:'front-and-side-standard',label:'Frontal y laterales estándar'},{id:'front-only',label:'Solo frontal'},{id:'knees-supported',label:'Adaptada con rodillas apoyadas'}],defaultVariant:'front-and-side-standard',
    material:['Colchoneta.','Cronómetro.','Superficie firme.'],
    startPosition:['Apoyos según la variante.','Cabeza, tronco y pelvis alineados.','Respiración libre.'],
    steps:['Adoptar la posición sin compensación.','Iniciar el tiempo cuando la alineación sea válida.','Dar una corrección breve si está permitida.','Detener al perder el criterio técnico o alcanzar el límite establecido.'],
    observe:['Alineación de pelvis y columna.','Rotación en plancha lateral.','Apnea, temblor y dolor.','Calidad del apoyo.'],
    valid:['Alineación dentro del criterio.','Apoyos no cambian.','El tiempo comienza y termina con criterio definido.'],
    invalid:['Pelvis cae o se eleva de forma persistente.','Cambia la variante.','Se apoya una extremidad no permitida.'],
    stop:['Dolor.','Pérdida técnica persistente.','Mareo o malestar.','Solicitud de la persona.'],
    record:['Tiempo frontal.','Tiempo lateral izquierdo y derecho.','Variante y apoyos.','Calidad, dolor, validez y motivo de finalización.'],
    interpretation:['Comparar lados y evolución con la misma variante.','Priorizar calidad sobre duración.','No mezclar variantes estándar y adaptadas.'],
    visual:{kind:'plank',start:'Apoyos y alineación',finish:'Tiempo mantenido con calidad',validCue:'Pelvis y tronco alineados',invalidCue:'Pérdida persistente de alineación'},
    form:{variant:'coreProtocolVariant',configuration:'coreConfiguration',valid:'coreValid',adaptation:'coreAdaptationReason',stop:'coreStopReason',target:'frontPlankSeconds'},sides:['bilateral'],
  },
  {
    id:'bodyweight-squat-60s',step:'fuerza',name:'Sentadilla libre · 60 segundos',area:'Fuerza-resistencia de tren inferior',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Máximo número de sentadillas técnicamente válidas en 60 segundos con profundidad y base definidas.',
    evaluates:'Fuerza-resistencia y tolerancia al patrón de sentadilla bajo una configuración reproducible.',
    doesNotDiagnose:'No equivale al Chair Stand/1MSTS y no utiliza sus baremos. Tampoco mide fuerza máxima.',
    variants:[{id:'bodyweight-60s-standard',label:'Peso corporal · 60 s · criterio de profundidad documentado'},{id:'bodyweight-60s-adapted',label:'Adaptada · 60 s · referencia individual'}],defaultVariant:'bodyweight-60s-standard',
    material:['Cronómetro.','Superficie firme y segura.','Referencia de profundidad cuando se disponga.'],
    startPosition:['Base de pies documentada.','Peso corporal, sin carga externa.','Criterio de profundidad explicado antes de comenzar.'],
    steps:['Iniciar el cronómetro durante 60 segundos.','Contar sólo repeticiones que alcancen el criterio de profundidad y extensión acordados.','Mantener la misma base y técnica durante toda la prueba.','Detener al perder el criterio técnico o por seguridad.'],
    observe:['Profundidad.','Extensión final.','Talones, rodillas y tronco.','Ritmo, fatiga, dolor y compensaciones.'],
    valid:['Duración exacta de 60 segundos.','Criterio de profundidad definido y mantenido.','Repeticiones completas contabilizadas.','Sin carga o asistencia no documentada.'],
    invalid:['Duración distinta.','Profundidad variable sin criterio.','Repeticiones parciales contabilizadas.','Cambio de base o apoyo no registrado.'],
    stop:['Dolor.','Mareo.','Pérdida de equilibrio.','Deterioro técnico repetido.','Solicitud de la persona.'],
    record:['Repeticiones válidas.','Criterio de profundidad.','Base y calzado/superficie.','RPE, dolor, validez y motivo de finalización.'],
    interpretation:['Usar como baseline individual y para seguimiento con la misma configuración.','No convertir a percentiles del Chair Stand ni del 1MSTS.','No extrapolar escalas de otros squat tests a este protocolo.'],
    visual:{kind:'squat',start:'Base y profundidad definidas',finish:'60 s · repeticiones válidas',validCue:'Profundidad y extensión consistentes',invalidCue:'Profundidad variable o técnica deteriorada'},
    form:{variant:'squat60ProtocolVariant',configuration:'squat60Configuration',valid:'squat60Valid',adaptation:'squat60AdaptationReason',stop:'squat60StopReason',target:'squat60Repetitions'},sides:['not-applicable'],
  },
  {
    id:'posterior-chain-endurance',step:'fuerza',name:'Resistencia de cadena posterior',area:'Cadena posterior',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Tiempo de mantenimiento bajo una variante y equipamiento compatibles.',
    evaluates:'Resistencia isométrica de la cadena posterior en una configuración documentada.',
    doesNotDiagnose:'No diagnostica patología lumbar y variantes de banco no son directamente equivalentes.',
    variants:[{id:'sorensen-horizontal',label:'Biering–Sørensen horizontal'},{id:'sorensen-45',label:'Banco de 45° documentado'},{id:'not-performed',label:'No realizada por falta de equipo compatible'}],defaultVariant:'not-performed',
    material:['Banco compatible y estable.','Sujeción segura prevista por el equipo.','Cronómetro.'],
    startPosition:['Pelvis apoyada en la referencia del banco.','Extremidades inferiores sujetas de forma segura.','Tronco en la posición definida por la variante.'],
    steps:['Comprobar compatibilidad y seguridad del equipo.','Adoptar la posición sin improvisar sujeciones.','Iniciar el tiempo con alineación válida.','Detener al perder el criterio técnico o por seguridad.'],
    observe:['Alineación del tronco.','Seguridad de las sujeciones.','Dolor lumbar.','Uso de brazos o apoyo no permitido.'],
    valid:['Equipo compatible.','Sujeción segura.','Variante y ángulo registrados.','Criterio técnico mantenido.'],
    invalid:['Sujeción improvisada.','Ángulo no identificado.','Cambio de apoyo.','Pérdida de alineación persistente.'],
    stop:['Dolor.','Fallo de sujeción.','Mareo.','Deterioro técnico.'],
    record:['Variante y ángulo.','Equipo.','Tiempo.','Validez, dolor y motivo de no realización o finalización.'],
    interpretation:['No comparar banco horizontal con 45°.','Usar evolución individual con el mismo equipo.','No realizar sin equipamiento compatible.'],
    visual:{kind:'posterior-chain',start:'Apoyo y sujeción segura',finish:'Tronco alineado según variante',validCue:'Equipo compatible y ángulo registrado',invalidCue:'Sujeción improvisada o ángulo distinto'},
    form:{variant:'posteriorChainProtocol',configuration:'posteriorChainConfiguration',valid:'posteriorChainValid',adaptation:'posteriorChainAdaptationReason',stop:'posteriorChainStopReason',target:'posteriorChainProtocol'},sides:['not-applicable'],
  },
  {
    id:'one-minute-sit-to-stand',step:'cardio',name:'1MSTS · Sit-to-Stand de 1 minuto',area:'Capacidad funcional',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Número de ciclos completos de sentarse y levantarse durante 60 segundos en una silla documentada.',
    evaluates:'Capacidad funcional submáxima y respuesta individual al esfuerzo mediante un protocolo reproducible.',
    doesNotDiagnose:'No diagnostica enfermedad cardiovascular o respiratoria ni sustituye una prueba clínica de esfuerzo.',
    variants:[{id:'1msts-standard',label:'1MSTS estándar · 60 s · referencia individual'}],defaultVariant:'1msts-standard',
    material:['Silla estable y sin ruedas con altura registrada.','Cronómetro.','Medición de frecuencia cardiaca opcional cuando sea útil y fiable.'],
    startPosition:['Sentado, pies apoyados y posición reproducible.','Brazos cruzados o configuración documentada sin ayuda de las manos.','Silla apoyada de forma segura contra una pared cuando corresponda.'],
    steps:['Confirmar altura de silla y criterio técnico.','Iniciar el cronómetro durante exactamente 60 segundos.','Contar únicamente ciclos completos de ponerse de pie y volver a sentarse.','Registrar repeticiones, RPE, síntomas y, si se midió, FC final y al minuto.'],
    observe:['Control al ponerse de pie y sentarse.','Uso involuntario de brazos o apoyos.','Equilibrio, síntomas y tolerancia.','Pérdida del criterio técnico.'],
    valid:['Duración exacta de 60 segundos.','Altura de silla y configuración registradas.','Repeticiones completas contabilizadas.','Sin ayuda externa que invalide el protocolo.'],
    invalid:['Duración distinta de 60 segundos.','Uso de manos no documentado.','Cambio de silla o configuración sin registrarlo.','Repeticiones parciales contabilizadas como completas.'],
    stop:['Dolor.','Mareo.','Disnea desproporcionada.','Pérdida de equilibrio.','Solicitud de la persona.','Cualquier motivo de seguridad.'],
    record:['Repeticiones completas en 60 s.','Altura de silla y configuración.','RPE y síntomas.','FC en reposo/final/recuperación solo si se recogió de forma fiable.','Validez y motivo de finalización.'],
    interpretation:['Usar como referencia individual reproducible.','Comparar solo con el mismo protocolo y una configuración equivalente.','No aplicar baremos automáticos no validados ni convertir el resultado en una puntuación global.'],
    visual:{kind:'chair-stand',start:'Sentado · pies estables',finish:'De pie · ciclo completo',validCue:'60 s exactos y ciclos completos',invalidCue:'Apoyo no documentado o repetición parcial'},
    form:{variant:'cardioProtocol',configuration:'cardioConfiguration',valid:'cardioValid',adaptation:'cardioAdaptationReason',stop:'cardioStopReason',target:'cardioProtocol'},sides:['not-applicable'],
  },
  {
    id:'ymca-three-minute-step',step:'cardio',name:'YMCA Step Test · 3 minutos',area:'Fitness cardiorrespiratorio',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Step test submáximo estandarizado de 3 minutos con escalón de 30,5 cm y cadencia de 96 pulsos/min.',
    evaluates:'Respuesta cardiorrespiratoria submáxima bajo el protocolo YMCA estandarizado.',
    doesNotDiagnose:'No es una prueba clínica diagnóstica ni sustituye una prueba de esfuerzo máxima.',
    variants:[{id:'ymca-3min-standard',label:'YMCA estándar · 30,5 cm · 96 bpm · 180 s'}],defaultVariant:'ymca-3min-standard',
    material:['Escalón estable de 30,5 cm.','Metrónomo a 96 pulsos/min.','Cronómetro.','Medición fiable de frecuencia cardiaca.'],
    startPosition:['De pie frente al escalón y con espacio seguro.','Confirmar escalón de 30,5 cm y cadencia de 96 pulsos/min.'],
    steps:['Mantener la secuencia subir, subir, bajar, bajar al ritmo de 96 pulsos/min.','Completar exactamente 180 segundos salvo criterio de detención.','Registrar FC final y FC de recuperación al minuto según el protocolo usado.'],
    observe:['Cadencia sostenida.','Técnica segura al subir y bajar.','Síntomas y tolerancia.','Motivos de interrupción.'],
    valid:['Escalón de 30,5 cm.','Cadencia de 96 pulsos/min.','Duración de 180 segundos.','Frecuencia cardiaca registrada de forma fiable.'],
    invalid:['Altura de escalón distinta.','Cadencia distinta o no mantenida.','Duración distinta de 180 segundos sin causa documentada.','FC no fiable.'],
    stop:['Dolor.','Mareo.','Disnea desproporcionada.','Inestabilidad.','Solicitud de la persona.','Cualquier motivo de seguridad.'],
    record:['Altura de escalón.','Cadencia.','Duración.','FC final y al minuto.','RPE, síntomas, validez y motivo de finalización.'],
    interpretation:['No mezclar con 1MSTS.','No aplicar ecuaciones o baremos YMCA si el protocolo no fue exactamente estandarizado.','Para seguimiento, repetir la misma configuración.'],
    visual:{kind:'step-test',start:'Frente al escalón',finish:'180 s a cadencia estandarizada',validCue:'30,5 cm · 96 bpm · 180 s',invalidCue:'Altura, cadencia o duración diferentes'},
    form:{variant:'cardioProtocol',configuration:'cardioConfiguration',valid:'cardioValid',adaptation:'cardioAdaptationReason',stop:'cardioStopReason',target:'cardioProtocol'},sides:['not-applicable'],
  },
  {
    id:'treadmill-three-minute-field',step:'cardio',name:'Cinta · 3 minutos · perfil de recuperación',area:'Respuesta al esfuerzo de campo',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Tres minutos a velocidad e inclinación documentadas, seguidos de FC inmediata, al minuto y a los dos minutos.',
    evaluates:'Respuesta y recuperación de frecuencia cardiaca ante una carga submáxima reproducible de campo.',
    doesNotDiagnose:'No es una prueba clínica de esfuerzo, no estima VO2máx y no usa umbrales pronósticos de otros protocolos.',
    variants:[{id:'treadmill-3min-self-selected',label:'Ritmo cómodo individual documentado'},{id:'treadmill-3min-prescribed',label:'Velocidad/inclinación prescritas y documentadas'}],defaultVariant:'treadmill-3min-self-selected',
    material:['Cinta de correr segura.','Cronómetro.','Método de frecuencia cardiaca identificado.'],
    startPosition:['Velocidad e inclinación registradas antes del inicio.','Calzado y modo de locomoción documentados.','Método de recuperación acordado antes de finalizar.'],
    steps:['Mantener tres minutos la carga definida sin cambios no documentados.','Registrar FC al terminar.','Registrar FC a 60 s y 120 s manteniendo la recuperación definida.','Registrar RPE y síntomas.'],
    observe:['Tolerancia al ritmo.','Cambios de velocidad/inclinación.','Síntomas.','Fiabilidad de la medición de FC.','Postura o marcha durante la recuperación.'],
    valid:['Duración exacta de 180 s.','Velocidad e inclinación registradas.','FC final y de recuperación medidas con el mismo método.','Recuperación documentada.'],
    invalid:['Cambio de carga no registrado.','FC no fiable.','Duración distinta sin motivo.','Método/postura de recuperación desconocidos.'],
    stop:['Dolor torácico.','Mareo.','Disnea desproporcionada.','Inestabilidad.','Solicitud de la persona.','Cualquier motivo de seguridad.'],
    record:['Velocidad (km/h).','Inclinación (%).','Caminar/trotar/correr.','FC final, +1 min y +2 min.','Método de FC.','Recuperación activa/pasiva y postura.','RPE, síntomas y validez.'],
    interpretation:['Comparar principalmente contra la propia persona usando la misma carga y recuperación.','HRR1 y HRR2 se muestran como diferencias absolutas de FC.','No aplicar puntos de corte pronósticos de pruebas máximas o con recuperación distinta.'],
    visual:{kind:'treadmill',start:'Carga documentada',finish:'180 s + recuperación 1–2 min',validCue:'Carga y recuperación reproducibles',invalidCue:'Carga o recuperación no documentadas'},
    form:{variant:'cardioProtocol',configuration:'cardioConfiguration',valid:'cardioValid',adaptation:'cardioAdaptationReason',stop:'cardioStopReason',target:'cardioProtocol'},sides:['not-applicable'],
  },
  {
    id:'legacy-iberfit-three-minute-step-adapted',step:'cardio',name:'Step 3 min adaptado IBERFIT · histórico',area:'Seguimiento funcional histórico',version:IRI_PROTOCOL_CATALOG_VERSION,
    summary:'Compatibilidad de lectura para registros históricos del step adaptado. No se ofrece como protocolo nuevo.',
    evaluates:'Sólo continuidad de registros históricos realizados bajo una configuración documentada.',
    doesNotDiagnose:'No equivale al YMCA y no dispone de baremos YMCA válidos.',
    variants:[{id:'iberfit-3min-adapted',label:'Adaptado IBERFIT · histórico'}],defaultVariant:'iberfit-3min-adapted',
    material:['Configuración histórica registrada.'],
    startPosition:['Reproducir únicamente si existe una medición histórica que justifique continuidad.'],
    steps:['Mantener exactamente la configuración histórica documentada.'],
    observe:['Técnica, síntomas y tolerancia.'],
    valid:['Configuración histórica completa y reproducible.'],
    invalid:['Configuración desconocida o distinta.'],
    stop:['Dolor.','Mareo.','Disnea desproporcionada.','Solicitud de la persona.'],
    record:['Altura, cadencia, duración, FC, RPE y síntomas cuando existan.'],
    interpretation:['No usar para nuevas altas.','No mezclar con YMCA ni 1MSTS.','No usar baremos YMCA.'],
    visual:{kind:'step-test',start:'Configuración histórica',finish:'Configuración histórica',validCue:'Sólo continuidad',invalidCue:'No usar como protocolo nuevo'},
    form:{variant:'cardioProtocol',configuration:'cardioConfiguration',valid:'cardioValid',adaptation:'cardioAdaptationReason',stop:'cardioStopReason',target:'cardioProtocol'},sides:['not-applicable'],
  },
].map(freezeProtocol);

export const IRI_PROTOCOL_CATALOG=Object.freeze(Object.fromEntries(PROTOCOLS.map((protocol)=>[protocol.id,protocol])));

export function iriProtocolsForStep(step){return Object.freeze(PROTOCOLS.filter((protocol)=>protocol.step===step));}
export function iriProtocolById(id){return IRI_PROTOCOL_CATALOG[String(id||'')]||null;}

function text(value,max=1200){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function bool(value){return value===true||value==='true'||value==='1'||value==='on'||value===1;}
function firstDefined(...values){return values.find((value)=>value!==undefined&&value!==null&&value!=='');}
function recordKey(record){return `${record?.testId||''}:${record?.side||'not-applicable'}`;}
function recordMap(records=[]){return new Map((Array.isArray(records)?records:[]).map((record)=>[recordKey(record),record]));}
function explicitBool(raw,key){return Object.prototype.hasOwnProperty.call(raw||{},key)?bool(raw[key]):null;}
function number(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
function resultExists(value){if(Array.isArray(value))return value.some(resultExists);if(value&&typeof value==='object')return Object.values(value).some(resultExists);return value!==null&&value!==undefined&&value!==''&&value!==false;}
function protocolApplies(protocolId,parts){
  if(protocolId==='body-composition')return !parts.bodyComposition?.skipped;
  if(['weight-bearing-lunge','back-saver','modified-thomas','hip-rotation-observation','assisted-squat'].includes(protocolId)&&parts.mobility?.skipped)return false;
  if(protocolId==='weight-bearing-lunge'&&parts.mobility?.ankle?.skipped)return false;
  if(protocolId==='back-saver'&&parts.mobility?.posteriorChain?.skipped)return false;
  if(protocolId==='hip-rotation-observation'&&parts.mobility?.hipRotation?.skipped)return false;
  if(protocolId==='assisted-squat'&&parts.mobility?.assistedSquat?.skipped)return false;
  if(['chair-stand-30s','push-test','trx-row','core-plank','bodyweight-squat-60s','posterior-chain-endurance'].includes(protocolId)&&parts.strength?.skipped)return false;
  if(['chair-stand-30s','bodyweight-squat-60s'].includes(protocolId)&&parts.strength?.lowerBody?.skipped)return false;
  if(protocolId==='push-test'&&parts.strength?.push?.skipped)return false;
  if(protocolId==='trx-row'&&parts.strength?.trxRow?.skipped)return false;
  if(protocolId==='core-plank'&&parts.strength?.core?.skipped)return false;
  const selected=parts.cardio?.skipped?'':String(parts.cardio?.protocol||'');
  if(protocolId==='one-minute-sit-to-stand')return selected==='1msts-standard';
  if(protocolId==='ymca-three-minute-step')return selected==='ymca-3min-standard';
  if(protocolId==='treadmill-three-minute-field')return selected==='treadmill-3min-field';
  if(protocolId==='legacy-iberfit-three-minute-step-adapted')return selected==='iberfit-3min-adapted';
  return true;
}
function inferredProtocolValidity(protocolId,result,parts){
  if(protocolId==='body-composition')return !parts.bodyComposition?.skipped&&[result.weightKg,result.bodyFatPercent,result.leanMassKg,result.muscleMassKg,result.waistCm].some((value)=>value!==null);
  if(protocolId==='weight-bearing-lunge'||protocolId==='back-saver')return Array.isArray(result.trials)&&result.trials.length>0;
  if(protocolId==='modified-thomas')return Boolean(result.observation);
  if(protocolId==='hip-rotation-observation')return Boolean(result.result);
  if(protocolId==='assisted-squat')return Boolean(result.depth);
  if(protocolId==='chair-stand-30s'||protocolId==='push-test'||protocolId==='trx-row'||protocolId==='bodyweight-squat-60s')return result.valid===true&&result.repetitions!=null;
  if(protocolId==='core-plank')return result.frontPlankSeconds!==null;
  if(protocolId==='posterior-chain-endurance')return result.equipmentCompatible===true&&result.seconds!==null&&String(result.protocol||'')!=='not-performed';
  if(protocolId==='one-minute-sit-to-stand')return result.valid===true&&result.repetitions!==null&&result.durationSeconds===60;
  if(protocolId==='ymca-three-minute-step')return result.valid===true&&result.stepHeightCm!==null&&Math.abs(result.stepHeightCm-30.5)<=0.05&&result.cadenceBpm===96&&result.durationSeconds===180&&result.finalHr!==null&&result.oneMinuteHr!==null;
  if(protocolId==='treadmill-three-minute-field')return result.valid===true&&result.durationSeconds===180&&result.speedKmh!==null&&result.inclinePercent!==null&&result.finalHr!==null&&result.oneMinuteHr!==null&&Boolean(result.recoveryMode);
  if(protocolId==='legacy-iberfit-three-minute-step-adapted')return result.valid===true&&result.stepHeightCm!==null&&result.cadenceBpm!==null&&result.durationSeconds===180&&result.finalHr!==null&&result.oneMinuteHr!==null;
  return resultExists(result);
}

function protocolResult(protocolId,side,parts){
  const {bodyComposition,mobility,strength,cardio}=parts;
  if(protocolId==='body-composition')return {weightKg:bodyComposition.weightKg,bodyFatPercent:bodyComposition.bodyFatPercent,leanMassKg:bodyComposition.leanMassKg,muscleMassKg:bodyComposition.muscleMassKg,waistCm:bodyComposition.waistCm};
  if(protocolId==='weight-bearing-lunge'){const ankle=mobility.ankle||{};return {trials:side==='left'?ankle.leftTrials:ankle.rightTrials,bestCm:side==='left'?ankle.leftBest:ankle.rightBest,pain:ankle.pain,compensation:ankle.compensation};}
  if(protocolId==='back-saver'){const posterior=mobility.posteriorChain||{};return {trials:side==='left'?posterior.leftTrials:posterior.rightTrials,bestCm:side==='left'?posterior.leftBest:posterior.rightBest,pain:posterior.pain};}
  if(protocolId==='modified-thomas'){const thomas=mobility.modifiedThomas||{};return {observation:side==='left'?thomas.left:thomas.right,pelvicControl:thomas.pelvicControl,pain:thomas.pain};}
  if(protocolId==='hip-rotation-observation')return {...(mobility.hipRotation||{})};
  if(protocolId==='assisted-squat')return {...(mobility.assistedSquat||{})};
  if(protocolId==='chair-stand-30s')return {...(strength.chairStand||{})};
  if(protocolId==='push-test')return {...(strength.push||{})};
  if(protocolId==='trx-row')return {...(strength.trxRow||{})};
  if(protocolId==='core-plank')return {...(strength.core||{})};
  if(protocolId==='bodyweight-squat-60s')return {...(strength.squat60||{})};
  if(protocolId==='posterior-chain-endurance')return {...(strength.posteriorChain||{})};
  if(protocolId==='one-minute-sit-to-stand'||protocolId==='ymca-three-minute-step'||protocolId==='treadmill-three-minute-field'||protocolId==='legacy-iberfit-three-minute-step-adapted')return {...cardio};
  return {};
}

function generatedConfiguration(protocolId,raw,parts){
  const {bodyComposition,strength,cardio}=parts;
  if(protocolId==='body-composition')return [bodyComposition.method,bodyComposition.device,bodyComposition.measurementConditions].filter(Boolean).join(' · ');
  if(protocolId==='weight-bearing-lunge')return [raw.ankleProtocolVariant||'standard-barefoot',`intentos I/D: ${parts.mobility.ankle?.leftTrials?.length||0}/${parts.mobility.ankle?.rightTrials?.length||0}`].join(' · ');
  if(protocolId==='back-saver')return [raw.posteriorProtocolVariant||'box-standard',`intentos I/D: ${parts.mobility.posteriorChain?.leftTrials?.length||0}/${parts.mobility.posteriorChain?.rightTrials?.length||0}`].join(' · ');
  if(protocolId==='modified-thomas')return [raw.thomasProtocolVariant||'table-edge-standard',raw.thomasPelvicControl&&`control pélvico: ${raw.thomasPelvicControl}`].filter(Boolean).join(' · ');
  if(protocolId==='hip-rotation-observation')return 'Posición bilateral reproducible · pelvis y tronco controlados';
  if(protocolId==='assisted-squat')return [raw.squatAssistanceResponse&&`asistencia: ${raw.squatAssistanceResponse}`,raw.squatHeels&&`talones: ${raw.squatHeels}`].filter(Boolean).join(' · ')||'Base y asistencia documentadas';
  if(protocolId==='chair-stand-30s')return [strength.chairStand?.chairHeightCm!==null?`silla ${strength.chairStand.chairHeightCm} cm`:'',raw.chairStandProtocolVariant||''].filter(Boolean).join(' · ');
  if(protocolId==='push-test')return [strength.push?.variant,strength.push?.durationSeconds!=null?`${strength.push.durationSeconds} s`:'',strength.push?.supportHeightCm!==null?`apoyo ${strength.push.supportHeightCm} cm`:''].filter(Boolean).join(' · ');
  if(protocolId==='trx-row')return [strength.trxRow?.bodyAngleDeg!=null?`ángulo ${strength.trxRow.bodyAngleDeg}°`:'',strength.trxRow?.durationSeconds!=null?`${strength.trxRow.durationSeconds} s`:'',strength.trxRow?.handleHeightCm!==null?`asas ${strength.trxRow.handleHeightCm} cm`:'',strength.trxRow?.heelDistanceCm!==null?`talones ${strength.trxRow.heelDistanceCm} cm`:'',strength.trxRow?.position].filter(Boolean).join(' · ');
  if(protocolId==='core-plank')return [raw.coreProtocolVariant||'',strength.core?.quality&&`calidad: ${strength.core.quality}`].filter(Boolean).join(' · ');
  if(protocolId==='bodyweight-squat-60s')return ['60 s',strength.squat60?.depthCriterion&&`profundidad: ${strength.squat60.depthCriterion}`,strength.squat60?.stance&&`base: ${strength.squat60.stance}`].filter(Boolean).join(' · ');
  if(protocolId==='posterior-chain-endurance')return [strength.posteriorChain?.protocol,strength.posteriorChain?.equipmentCompatible?'equipo compatible':'equipo no confirmado'].filter(Boolean).join(' · ');
  if(protocolId==='one-minute-sit-to-stand')return [`silla ${cardio.chairHeightCm??'—'} cm`,`duración ${cardio.durationSeconds??'—'} s`,`repeticiones ${cardio.repetitions??'—'}`].join(' · ');
  if(protocolId==='ymca-three-minute-step'||protocolId==='legacy-iberfit-three-minute-step-adapted')return [`escalón ${cardio.stepHeightCm??'—'} cm`,`cadencia ${cardio.cadenceBpm??'—'} bpm`,`duración ${cardio.durationSeconds??'—'} s`].join(' · ');
  if(protocolId==='treadmill-three-minute-field')return [`cinta ${cardio.speedKmh??'—'} km/h`,`${cardio.inclinePercent??'—'}% inclinación`,cardio.locomotionMode&&`modo ${cardio.locomotionMode}`,cardio.hrMethod&&`FC ${cardio.hrMethod}`,cardio.recoveryMode&&`recuperación ${cardio.recoveryMode}`].filter(Boolean).join(' · ');
  return '';
}

function protocolNormEligible(protocolId,{valid,variant,adaptationReason,result}={}){
  if(valid!==true||String(adaptationReason||'').trim())return false;
  if(protocolId==='weight-bearing-lunge')return ['standard-barefoot','standard-footwear'].includes(variant);
  if(protocolId==='chair-stand-30s')return variant==='standard-arms-crossed'&&Number(result?.chairHeightCm)>=43&&Number(result?.chairHeightCm)<=46;
  if(protocolId==='one-minute-sit-to-stand')return Number(result?.chairHeightCm)>=43&&Number(result?.chairHeightCm)<=46&&Number(result?.durationSeconds)===60;
  if(protocolId==='push-test')return variant==='standard'&&result?.durationSeconds==null;
  return false;
}
function protocolMeasurementClass(protocol,{valid,variant,adaptationReason,normEligible,configuration}={}){
  if(valid!==true)return 'invalid';
  if(normEligible)return 'standard_normed';
  const adapted=Boolean(String(adaptationReason||'').trim())||Boolean(variant&&variant!==protocol.defaultVariant);
  return adapted?'adapted_baseline':String(configuration||'').trim()?'standard_baseline':'baseline_unconfigured';
}

export function buildIriProtocolRecords({raw={},existingRecords=[],assessmentDate='',bodyComposition={},mobility={},strength={},cardio={}}={}){
  const existing=recordMap(existingRecords);const parts={bodyComposition,mobility,strength,cardio};const records=[];
  for(const protocol of PROTOCOLS){
    if(!protocolApplies(protocol.id,parts))continue;
    for(const side of protocol.sides){
      const previous=existing.get(`${protocol.id}:${side}`)||{};
      const result=protocolResult(protocol.id,side,parts);
      const inferredValid=inferredProtocolValidity(protocol.id,result,parts);
      const explicit=explicitBool(raw,protocol.form.valid);
      const variant=text(firstDefined(raw[protocol.form.variant],previous.variant,protocol.defaultVariant),120);
      const configuration=text(firstDefined(raw[protocol.form.configuration],previous.configuration,generatedConfiguration(protocol.id,raw,parts)),800);
      const valid=inferredValid&&(explicit===null?(previous.valid!==undefined?Boolean(previous.valid):true):explicit);
      const adaptationReason=text(firstDefined(raw[protocol.form.adaptation],previous.adaptationReason),600);
      const normEligible=protocolNormEligible(protocol.id,{valid,variant,adaptationReason,result});
      records.push(Object.freeze({
        testId:protocol.id,
        testName:protocol.name,
        area:protocol.area,
        variant,
        configuration,
        side,
        date:text(assessmentDate,10),
        protocolVersion:protocol.version,
        valid,
        executionValid:valid,
        normEligible,
        trackingComparable:Boolean(valid&&configuration&&repeatableSetup(protocol.id,result)),
        protocolMode:normEligible?'standard':(Boolean(adaptationReason)||variant!==protocol.defaultVariant)?'adapted_comparable':'baseline_only',
        measurementClass:protocolMeasurementClass(protocol,{valid,variant,adaptationReason,normEligible,configuration}),
        adaptationReason,
        stopReason:text(firstDefined(raw[protocol.form.stop],previous.stopReason),600),
        result:Object.freeze({...result}),
      }));
    }
  }
  return Object.freeze(records);
}

export function flattenIriProtocolRecords(records=[]){
  const map=recordMap(records);const out={};
  for(const protocol of PROTOCOLS){
    const record=map.get(`${protocol.id}:${protocol.sides[0]}`);if(!record)continue;
    if(protocol.form.variant)out[protocol.form.variant]=record.variant||'';
    if(protocol.form.configuration)out[protocol.form.configuration]=record.configuration||'';
    if(protocol.form.valid)out[protocol.form.valid]=Boolean(record.valid);
    if(protocol.form.adaptation)out[protocol.form.adaptation]=record.adaptationReason||'';
    if(protocol.form.stop)out[protocol.form.stop]=record.stopReason||'';
  }
  return out;
}

function comparableValue(value){return text(value,800).toLocaleLowerCase('es-ES');}
const CARDIO_PROTOCOL_TEST_IDS=new Set(['one-minute-sit-to-stand','ymca-three-minute-step','treadmill-three-minute-field','legacy-iberfit-three-minute-step-adapted']);
const SETUP_FIELDS=Object.freeze({
  'trx-row':['handleHeightCm','heelDistanceCm','bodyAngleDeg','position','durationSeconds'],
  'push-test':['variant','supportHeightCm','durationSeconds'],
  'bodyweight-squat-60s':['depthCriterion','stance'],
  'chair-stand-30s':['chairHeightCm'],
  'one-minute-sit-to-stand':['chairHeightCm','durationSeconds'],
  'treadmill-three-minute-field':['durationSeconds','speedKmh','inclinePercent','locomotionMode','hrMethod','recoveryMode'],
});
function repeatableSetup(id,result={}){
  if(id==='trx-row')return result.handleHeightCm!=null&&(result.heelDistanceCm!=null||result.bodyAngleDeg!=null)&&Boolean(result.position);
  if(id==='bodyweight-squat-60s')return Boolean(result.depthCriterion&&result.stance);
  if(id==='treadmill-three-minute-field')return SETUP_FIELDS[id].every((key)=>result[key]!=null&&result[key]!=='');
  return true;
}
export function protocolComparabilityWarnings(previousRecords=[],currentRecords=[]){
  const previousRows=Array.isArray(previousRecords)?previousRecords:[];
  const currentRows=Array.isArray(currentRecords)?currentRecords:[];
  const previous=recordMap(previousRows);const warnings=[];
  const priorCardio=previousRows.find((record)=>CARDIO_PROTOCOL_TEST_IDS.has(record?.testId)&&resultExists(record?.result));
  const currentCardio=currentRows.find((record)=>CARDIO_PROTOCOL_TEST_IDS.has(record?.testId)&&resultExists(record?.result));
  if(priorCardio&&currentCardio&&priorCardio.testId!==currentCardio.testId){
    warnings.push(`Capacidad de esfuerzo: “${priorCardio.testName}” y “${currentCardio.testName}” son protocolos distintos; sus resultados no son directamente comparables.`);
  }
  for(const current of currentRows){
    const prior=previous.get(recordKey(current));if(!prior||!resultExists(prior.result)||!resultExists(current.result))continue;
    const setupChanged=(SETUP_FIELDS[current.testId]||[]).some((key)=>comparableValue(prior.result?.[key])!==comparableValue(current.result?.[key]));
    if(setupChanged)warnings.push(`“${current.testName}” cambió su configuración medida; los resultados no son directamente comparables.`);
    const side=current.side&&current.side!=='not-applicable'?` · ${current.side==='left'?'izquierda':current.side==='right'?'derecha':current.side}`:'';
    if(prior.protocolVersion&&current.protocolVersion&&prior.protocolVersion!==current.protocolVersion){warnings.push(`“${current.testName}${side}” cambió de versión (${prior.protocolVersion} → ${current.protocolVersion}); los resultados no son directamente comparables.`);continue;}
    if(comparableValue(prior.variant)!==comparableValue(current.variant)){warnings.push(`“${current.testName}${side}” se realizó antes con la variante “${prior.variant||'sin registrar'}”. Mantén la misma variante o interpreta la evolución como no comparable.`);continue;}
    if(comparableValue(prior.configuration)!==comparableValue(current.configuration)){warnings.push(`“${current.testName}${side}” tiene una configuración diferente. Antes: “${prior.configuration||'sin registrar'}”. Ahora: “${current.configuration||'sin registrar'}”.`);}
  }
  return Object.freeze([...new Set(warnings)]);
}

export const __iriProtocolInternals=Object.freeze({PROTOCOLS,recordKey,resultExists,protocolApplies,inferredProtocolValidity,generatedConfiguration});
