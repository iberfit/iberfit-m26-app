import { sessionExecutionSummary } from './domain.js';

export const SESSION_CLOSE_STATES = Object.freeze([
  'activa',
  'pausada',
  'cerrada_local_pendiente_sync',
  'cerrada_confirmada',
  'cierre_conflicto',
  'cierre_rechazado',
]);

export function localCloseGate(session, { durableStateSaved = true } = {}) {
  if (!session) return { ok: false, reasons: ['No existe una sesión activa'] };
  const summary = sessionExecutionSummary(session);
  const reasons = [];
  if (summary.pendiente > 0) reasons.push(`${summary.pendiente} series siguen pendientes`);
  if (!session.feedback) reasons.push('Falta feedback post-sesión');
  if (!durableStateSaved) reasons.push('El estado local aún no está guardado de forma durable');
  if (['cerrada_local_pendiente_sync', 'cerrada_confirmada'].includes(session.status)) reasons.push('La sesión ya fue cerrada');
  return { ok: reasons.length === 0, reasons, summary };
}

export function closeSessionLocally(session, {
  closeOperationId,
  actor = 'unknown',
  durableStateSaved = true,
  at = new Date().toISOString(),
} = {}) {
  if (!closeOperationId) throw new Error('El cierre local requiere operationId');
  const gate = localCloseGate(session, { durableStateSaved });
  if (!gate.ok) throw new Error(gate.reasons.join(' · '));
  return {
    ...session,
    status: 'cerrada_local_pendiente_sync',
    executionLocked: true,
    localClosedAt: at,
    closedAt: at,
    closeSync: {
      operationId: closeOperationId,
      state: 'pendiente',
      actor,
      localClosedAt: at,
      confirmedAt: null,
      remoteRevision: null,
      error: null,
    },
  };
}

export function applySessionCloseReconcile(session, result, { at = new Date().toISOString() } = {}) {
  const operationId = session?.closeSync?.operationId;
  if (!operationId) return session;
  const ack = (result?.ack || []).find((item) => item.operationId === operationId);
  if (ack) {
    return {
      ...session,
      status: 'cerrada_confirmada',
      executionLocked: true,
      remoteConfirmedAt: ack.serverAt || at,
      closeSync: {
        ...session.closeSync,
        state: 'confirmada',
        confirmedAt: ack.serverAt || at,
        remoteRevision: Number(ack.remoteRevision || 0),
        duplicate: Boolean(ack.duplicate),
        error: null,
      },
    };
  }
  const conflict = (result?.conflicts || []).find((item) => item.operationId === operationId);
  if (conflict) {
    return {
      ...session,
      status: 'cierre_conflicto',
      closeSync: { ...session.closeSync, state: 'conflicto', error: conflict.reason || 'Conflicto de sincronización', conflict },
    };
  }
  const rejection = (result?.rejected || []).find((item) => item.operationId === operationId);
  if (rejection) {
    return {
      ...session,
      status: 'cierre_rechazado',
      closeSync: { ...session.closeSync, state: 'rechazado', error: rejection.reason || 'Cierre rechazado por el servidor', rejection },
    };
  }
  return session;
}

export function sessionClosePresentation(session) {
  const status = session?.status;
  if (status === 'cerrada_local_pendiente_sync') return {
    tone: 'warning',
    label: 'Cerrada en este dispositivo',
    title: 'Cierre guardado; falta confirmación remota',
    detail: 'El registro está protegido localmente. No se mostrará como confirmado hasta recibir ACK del servidor.',
    canArchive: false,
  };
  if (status === 'cerrada_confirmada' || status === 'cerrada') return {
    tone: 'success',
    label: 'Cierre confirmado',
    title: 'Registro protegido y confirmado',
    detail: 'El servidor confirmó el cierre y su auditoría.',
    canArchive: true,
  };
  if (status === 'cierre_conflicto') return {
    tone: 'danger',
    label: 'Cierre con conflicto',
    title: 'El cierre local está protegido, pero requiere resolución',
    detail: session?.closeSync?.error || 'Revisa la diferencia antes de continuar.',
    canArchive: false,
  };
  if (status === 'cierre_rechazado') return {
    tone: 'danger',
    label: 'Cierre no confirmado',
    title: 'El servidor rechazó el cierre',
    detail: session?.closeSync?.error || 'Corrige la causa y vuelve a sincronizar.',
    canArchive: false,
  };
  return null;
}

export function canMutateSessionExecution(session) {
  return Boolean(session) && !session.executionLocked && !String(session.status || '').startsWith('cerrada') && !String(session.status || '').startsWith('cierre_');
}
