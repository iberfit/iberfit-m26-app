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
    draft:'Voy a viajar y necesito adaptar la planificación a mi disponibilidad y al material que tendré. Fechas aproximadas: [indica periodo]. Lugar o material disponible: [si lo conoces]. ¿Qué alternativa me propones?',
  }),
  Object.freeze({
    key:'tecnica',label:'Consultar técnica',
    draft:'Tengo una consulta sobre la ejecución de un ejercicio: [nombre]. Lo que me genera dudas es: [descripción]. ¿Puedes indicarme qué revisar y si necesitas un registro visual por un canal habilitado?',
  }),
  Object.freeze({
    key:'habitos',label:'Comidas y hábitos',
    draft:'Esta semana tendré comidas fuera de casa o cambios de rutina. Me gustaría recibir orientaciones generales y prácticas compatibles con mi entrenamiento, sin una dieta restrictiva. Contexto: [si quieres, añade detalles].',
  }),
]);
const BY_KEY=Object.freeze(Object.fromEntries(CLIENT_SERVICE_PROMPTS.map(x=>[x.key,x])));
export function clientServicePrompt(key){
  return typeof key==='string'&&Object.hasOwn(BY_KEY,key)?BY_KEY[key]:null;
}
