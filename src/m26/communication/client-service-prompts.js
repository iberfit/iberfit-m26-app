// IBERFIT Private Coach: assisted draft composition, never a server command.
// Requests use the already authorized Client–Coach message thread. No upload,
// calendar permission, diagnosis, automatic booking or priority SLA is implied.
export const CLIENT_SERVICE_PROMPTS=Object.freeze([
  Object.freeze({
    key:'agenda',label:'Ajustar agenda',
    draft:'Quisiera revisar la fecha, la hora o el lugar de una próxima sesión. Mi disponibilidad alternativa es: [indica opciones]. Prefiero: [presencial, domicilio, oficina u online]. ¿Podemos confirmarlo juntos?',
  }),
  Object.freeze({
    key:'viaje',label:'Viaje y entrenamiento',
    draft:'Voy a viajar y quiero mantener la continuidad del ciclo sin cambiar el plan por mi cuenta. Fechas: [inicio y fin]. Destino y huso horario: [si quieres compartirlos]. Días y tiempo disponible: [indica]. Material y espacio: [si los conoces]. ¿Puedes revisar qué sesiones y variantes son adecuadas y confirmarme los cambios?',
  }),
  Object.freeze({
    key:'tecnica',label:'Consultar técnica',
    draft:'Tengo una consulta sobre la ejecución de un ejercicio: [nombre]. Lo que me genera dudas es: [descripción]. ¿Puedes explicarme qué puntos técnicos debo comprobar? Por ahora prefiero resolverlo sin envío de vídeo.',
  }),
  Object.freeze({
    key:'habitos',label:'Comidas y hábitos',
    draft:'Esta semana tendré comidas fuera de casa o cambios de rutina. Me gustaría recibir orientaciones generales y prácticas compatibles con mi entrenamiento, sin una dieta restrictiva. Contexto: [si quieres, añade detalles].',
  }),
  Object.freeze({
    key:'hotel',group:'executive',label:'Gimnasio de hotel',
    draft:'Estaré en un hotel o apartamento. Material confirmado: [mancuernas, bandas, máquinas, ninguno o no lo sé]. Espacio disponible: [habitación o gimnasio]. Duración máxima por sesión: [minutos]. ¿Puedes proponerme alternativas compatibles con el objetivo de mi ciclo? Prefiero que no se cambie la sesión publicada hasta que tú lo confirmes.',
  }),
  Object.freeze({
    key:'jetlag',group:'executive',label:'Cambio de horario',
    draft:'Voy a cambiar de huso horario y me gustaría organizar el entrenamiento sin descuidar el descanso. Destino y fechas: [opcional]. Diferencia horaria: [si la conoces]. Sueño y energía percibidos: [si quieres]. ¿Podemos revisar el mejor momento para entrenar y unas pautas generales de descanso? No necesito recomendaciones médicas.',
  }),
  Object.freeze({
    key:'recuperacion',group:'executive',label:'Recuperación y carga',
    draft:'Antes de nuestra próxima sesión quiero comentar cómo he recuperado. Sueño, fatiga y energía: [opcional]. Molestias o limitaciones: [opcional]. ¿Podemos revisar juntos si conviene ajustar el trabajo? Prefiero que la prescripción la decidas tú al valorar mi situación.',
  }),
]);
const BY_KEY=Object.freeze(Object.fromEntries(CLIENT_SERVICE_PROMPTS.map(x=>[x.key,x])));
export function clientServicePrompt(key){
  return typeof key==='string'&&Object.hasOwn(BY_KEY,key)?BY_KEY[key]:null;
}
