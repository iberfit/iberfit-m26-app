import {
  appointmentModalityLabel,
  normalizeAppointmentModality,
} from './modality.js';

const fold = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

export const APPOINTMENT_STATUSES = Object.freeze([
  'borrador',
  'propuesta',
  'pendiente',
  'confirmada',
  'reprogramada',
  'cancelada',
  'realizada',
  'ausencia_cliente',
  'ausencia_coach',
]);

const STATUS_ALIASES = Object.freeze(
  new Map([
    ['borrador', 'borrador'],
    ['draft', 'borrador'],

    ['propuesta', 'propuesta'],
    ['proposal', 'propuesta'],
    ['proposed', 'propuesta'],

    ['pendiente', 'pendiente'],
    ['pending', 'pendiente'],

    ['confirmada', 'confirmada'],
    ['confirmado', 'confirmada'],
    ['confirmed', 'confirmada'],
    ['scheduled', 'confirmada'],
    ['agendada', 'confirmada'],
    ['agendado', 'confirmada'],

    ['reprogramada', 'reprogramada'],
    ['reprogramado', 'reprogramada'],
    ['rescheduled', 'reprogramada'],

    ['cancelada', 'cancelada'],
    ['cancelado', 'cancelada'],
    ['cancelled', 'cancelada'],
    ['canceled', 'cancelada'],

    ['realizada', 'realizada'],
    ['realizado', 'realizada'],
    ['completada', 'realizada'],
    ['completado', 'realizada'],
    ['completed', 'realizada'],

    ['ausencia_cliente', 'ausencia_cliente'],
    ['client_no_show', 'ausencia_cliente'],

    ['ausencia_coach', 'ausencia_coach'],
    ['coach_no_show', 'ausencia_coach'],
  ])
);

const CLIENT_VISIBLE_STATUSES = new Set([
  'confirmada',
  'realizada',
]);

function bodyOf(record) {
  return record?.body &&
    typeof record.body === 'object' &&
    !Array.isArray(record.body)
    ? record.body
    : {};
}

function field(record, ...keys) {
  const body = bodyOf(record);

  for (const key of keys) {
    const value = record?.[key] ?? body?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
}

function booleanField(record, ...keys) {
  const value = field(record, ...keys);

  if (value === null) return null;
  if (typeof value === 'boolean') return value;

  const normalized = fold(value);

  if (['true', '1', 'si', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  return null;
}

function cleanText(value, max = 300) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, max) : null;
}

export function normalizeAppointmentStatus(value) {
  return STATUS_ALIASES.get(fold(value)) || null;
}

export function appointmentStatusLabel(value) {
  const status = normalizeAppointmentStatus(value);

  return (
    {
      borrador: 'Borrador',
      propuesta: 'Propuesta',
      pendiente: 'Pendiente de confirmación',
      confirmada: 'Confirmada',
      reprogramada: 'Reprogramada',
      cancelada: 'Cancelada',
      realizada: 'Realizada',
      ausencia_cliente: 'Ausencia del cliente',
      ausencia_coach: 'Ausencia del entrenador',
    }[status] || 'Sin estado'
  );
}

export function normalizeAppointmentRecord(record = {}) {
  const modality = normalizeAppointmentModality(
    field(record, 'modality', 'modalidad')
  );

  const status = normalizeAppointmentStatus(
    field(record, 'status', 'estado')
  );

  return Object.freeze({
    id: cleanText(field(record, 'id', 'entityId', 'entity_id'), 200),
    clientId: cleanText(
      field(record, 'clientId', 'client_id', 'clienteId', 'cliente_id'),
      200
    ),
    sessionId: cleanText(
      field(record, 'sessionId', 'session_id'),
      200
    ),
    title:
      cleanText(
        field(record, 'title', 'titulo', 'name', 'nombre'),
        160
      ) || 'Sesión IBERFIT',
    startAt: field(
      record,
      'startAt',
      'start_at',
      'scheduledAt',
      'scheduled_at',
      'date',
      'fecha'
    ),
    endAt: field(record, 'endAt', 'end_at'),
    location: cleanText(
      field(record, 'location', 'ubicacion'),
      300
    ),
    modality,
    modalityLabel: appointmentModalityLabel(modality),
    status,
    statusLabel: appointmentStatusLabel(status),
    visibleToClient: booleanField(
      record,
      'visibleToClient',
      'visible_to_client',
      'clientVisible',
      'client_visible'
    ),
  });
}

export function isClientVisibleAppointment(record) {
  const appointment = normalizeAppointmentRecord(record);

  if (appointment.visibleToClient === false) return false;

  return CLIENT_VISIBLE_STATUSES.has(appointment.status);
}

export function isConfirmedAppointment(record) {
  return normalizeAppointmentRecord(record).status === 'confirmada';
}

export const __appointmentInternals = Object.freeze({
  bodyOf,
  field,
  booleanField,
  cleanText,
  fold,
});
