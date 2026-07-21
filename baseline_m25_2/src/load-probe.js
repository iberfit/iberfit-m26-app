export function generateSyntheticLoad(count = 500) {
  const size = Math.max(1, Math.min(Number(count || 500), 5000));
  const clients = Array.from({ length: size }, (_, index) => ({
    id: `LOAD-${String(index + 1).padStart(5, '0')}`,
    name: `Cliente Sintético ${index + 1}`,
    modalidad: index % 3 === 0 ? 'Presencial' : index % 3 === 1 ? 'Híbrido' : 'Online',
    objective: index % 2 ? 'Fuerza' : 'Acondicionamiento',
    revision: index % 7,
  }));
  const sessions = clients.map((client, index) => ({ id: `SESSION-${index + 1}`, clientId: client.id, status: index % 5 ? 'publicado' : 'borrador' }));
  const reports = clients.flatMap((client, index) => index % 4 === 0 ? [{ id: `REPORT-${index + 1}`, clientId: client.id, status: 'publicado' }] : []);
  return { clients, sessions, reports };
}

export function runSyntheticLoadProbe(options = {}) {
  const started = globalThis.performance?.now?.() || Date.now();
  const dataset = generateSyntheticLoad(options.clients || 500);
  const index = new Map(dataset.clients.map((client) => [client.id, client]));
  const published = dataset.sessions.filter((session) => session.status === 'publicado');
  const joined = published.slice(0, 250).map((session) => ({ ...session, client: index.get(session.clientId) }));
  const serializedBytes = new TextEncoder().encode(JSON.stringify({ joined, reports: dataset.reports })).byteLength;
  const ended = globalThis.performance?.now?.() || Date.now();
  const durationMs = ended - started;
  const budgetMs = Number(options.budgetMs || 250);
  return {
    pass: durationMs <= budgetMs,
    durationMs,
    budgetMs,
    clients: dataset.clients.length,
    sessions: dataset.sessions.length,
    reports: dataset.reports.length,
    joined: joined.length,
    serializedBytes,
  };
}
