import { clientModalityLabel, normalizeClientModality } from './modality.js';

function bodyOf(record) {
  return record?.body &&
    typeof record.body === 'object' &&
    !Array.isArray(record.body)
    ? record.body
    : {};
}

function value(record, ...keys) {
  const body = bodyOf(record);

  for (const key of keys) {
    const found = record?.[key] ?? body?.[key];

    if (found !== undefined && found !== null && found !== '') {
      return found;
    }
  }

  return null;
}

function cleanText(input, max = 500) {
  const text = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, max) : null;
}

function cleanEmail(input) {
  const value = cleanText(input, 254)?.toLowerCase() || null;
  return value && value.includes('@') ? value : null;
}

function cleanPhone(input) {
  return cleanText(input, 40);
}

function listText(input, maxItems = 20) {
  const values = Array.isArray(input)
    ? input
    : String(input ?? '')
        .split(/[,;\n]/)
        .map((item) => item.trim());

  return Object.freeze(
    values
      .map((item) => cleanText(item, 120))
      .filter(Boolean)
      .slice(0, maxItems)
  );
}

export function normalizeSexForNorms(input) {
  const value = String(input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

  if (['female', 'mujer', 'femenino', 'f'].includes(value)) return 'female';
  if (['male', 'hombre', 'masculino', 'm'].includes(value)) return 'male';
  return null;
}

export function sexForNormsLabel(input) {
  const value = normalizeSexForNorms(input);
  return value === 'female' ? 'Mujer' : value === 'male' ? 'Hombre' : 'Sin registro';
}

export function normalizeClientProfile(profile = {}, client = {}) {
  const modality = normalizeClientModality(
    value(profile, 'modality', 'modalidad') ??
      value(client, 'modality', 'modalidad')
  );
  const trainingAddress = cleanText(
    value(
      profile,
      'trainingAddress',
      'training_address',
      'trainingLocation',
      'training_location',
      'address',
      'direccion',
      'direccionEntrenamiento',
      'direccion_entrenamiento'
    ),
    300
  );
  const email = cleanEmail(
    value(profile, 'email', 'correo', 'contactEmail', 'contact_email') ??
      value(client, 'email', 'correo')
  );
  const phone = cleanPhone(
    value(profile, 'phone', 'telefono', 'mobile', 'movil', 'contactPhone', 'contact_phone') ??
      value(client, 'phone', 'telefono')
  );
  const sexForNorms = normalizeSexForNorms(
    value(profile, 'sexForNorms', 'sex_for_norms', 'sexoBaremos', 'sexo_baremos')
  );
  const logisticsRequired = ['presencial', 'hibrido'].includes(modality);
  const equipment = listText(
    value(
      profile,
      'equipmentAvailable',
      'equipment_available',
      'equipment',
      'materialDisponible',
      'material_disponible'
    )
  );
  const secondaryObjectives = listText(
    value(
      profile,
      'secondaryObjectives',
      'secondary_objectives',
      'objetivosSecundarios',
      'objetivos_secundarios'
    )
  );

  const normalized = {
    birthDate: cleanText(value(profile, 'birthDate', 'birth_date', 'fechaNacimiento', 'fecha_nacimiento'), 10),
    sexForNorms,
    sexForNormsLabel: sexForNormsLabel(sexForNorms),
    genderIdentity: cleanText(value(profile, 'genderIdentity', 'gender_identity', 'identidadGenero', 'identidad_genero'), 120),
    pronouns: cleanText(value(profile, 'pronouns', 'pronombres'), 80),
    email,
    phone,
    preferredContactChannel: cleanText(
      value(profile, 'preferredContactChannel', 'preferred_contact_channel', 'canalContacto', 'canal_contacto'),
      80
    ),
    preferredContactTime: cleanText(
      value(profile, 'preferredContactTime', 'preferred_contact_time', 'horarioContacto', 'horario_contacto'),
      120
    ),
    timezone: cleanText(value(profile, 'timezone', 'timeZone', 'zonaHoraria', 'zona_horaria'), 80),
    modality,
    modalityLabel: clientModalityLabel(modality),
    trainingAddress,
    commune: cleanText(value(profile, 'commune', 'comuna', 'city', 'ciudad'), 120),
    locationType: cleanText(value(profile, 'locationType', 'location_type', 'tipoLugar', 'tipo_lugar'), 80),
    accessInstructions: cleanText(
      value(profile, 'accessInstructions', 'access_instructions', 'instruccionesAcceso', 'instrucciones_acceso'),
      500
    ),
    preferredSchedule: cleanText(
      value(profile, 'preferredSchedule', 'preferred_schedule', 'horarioPreferido', 'horario_preferido'),
      240
    ),
    sessionDurationMinutes: Number(
      value(profile, 'sessionDurationMinutes', 'session_duration_minutes', 'duracionSesionMinutos', 'duracion_sesion_minutos')
    ) || null,
    weeklyFrequency: Number(
      value(profile, 'weeklyFrequency', 'weekly_frequency', 'frecuenciaSemanal', 'frecuencia_semanal')
    ) || null,
    equipment,
    primaryObjective: cleanText(
      value(profile, 'primaryObjective', 'primary_objective', 'objective', 'objetivo'),
      500
    ),
    secondaryObjectives,
    emergencyContactName: cleanText(
      value(profile, 'emergencyContactName', 'emergency_contact_name', 'contactoEmergenciaNombre', 'contacto_emergencia_nombre'),
      160
    ),
    emergencyContactRelation: cleanText(
      value(profile, 'emergencyContactRelation', 'emergency_contact_relation', 'contactoEmergenciaRelacion', 'contacto_emergencia_relacion'),
      120
    ),
    emergencyContactPhone: cleanPhone(
      value(profile, 'emergencyContactPhone', 'emergency_contact_phone', 'contactoEmergenciaTelefono', 'contacto_emergencia_telefono')
    ),
  };

  const missing = [];
  if (!normalized.birthDate) missing.push('birthDate');
  if (!normalized.sexForNorms) missing.push('sexForNorms');
  if (!normalized.email) missing.push('email');
  if (!normalized.phone) missing.push('phone');
  if (!normalized.modality) missing.push('modality');
  if (logisticsRequired && !normalized.trainingAddress) missing.push('trainingAddress');

  const requiredCount = logisticsRequired ? 6 : 5;

  return Object.freeze({
    ...normalized,
    logisticsRequired,
    missing: Object.freeze(missing),
    completeness: Math.max(
      0,
      Math.round(((requiredCount - missing.length) / requiredCount) * 100)
    ),
  });
}

export function trainingAddressForProfile(profile = {}, client = {}) {
  return normalizeClientProfile(profile, client).trainingAddress;
}

export const __clientProfileInternals = Object.freeze({
  bodyOf,
  value,
  cleanText,
  cleanEmail,
  cleanPhone,
  listText,
});
