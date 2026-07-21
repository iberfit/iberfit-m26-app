const fold=(value)=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');

export const APPOINTMENT_MODALITIES=Object.freeze(['presencial','guiada_en_app','online']);
export const CLIENT_MODALITIES=Object.freeze(['presencial','hibrido','online']);

const APPOINTMENT_ALIASES=Object.freeze(new Map([
  ['presencial','presencial'],
  ['in_person','presencial'],
  ['guiada_en_app','guiada_en_app'],
  ['guiada_app','guiada_en_app'],
  ['online_guiada','guiada_en_app'],
  ['guided_app','guiada_en_app'],
  ['online','online'],
]));
const CLIENT_ALIASES=Object.freeze(new Map([
  ['presencial','presencial'],
  ['hibrido','hibrido'],
  ['hybrid','hibrido'],
  ['online','online'],
]));

export function normalizeAppointmentModality(value){return APPOINTMENT_ALIASES.get(fold(value))||null;}
export function normalizeClientModality(value){return CLIENT_ALIASES.get(fold(value))||null;}
export function isAppointmentModality(value){return normalizeAppointmentModality(value)!==null;}
export function isClientModality(value){return normalizeClientModality(value)!==null;}
export function appointmentModalityLabel(value){return ({presencial:'Presencial',guiada_en_app:'Guiada en la aplicación',online:'En línea'})[normalizeAppointmentModality(value)]||'Sin modalidad';}
export function clientModalityLabel(value){return ({presencial:'Presencial',hibrido:'Híbrido',online:'En línea'})[normalizeClientModality(value)]||'Sin modalidad';}
