async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export const api = {
  health: () => request('/api/health', { method: 'GET' }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  bootstrap: (token) => request('/api/bootstrap', { method: 'GET', token }),
  reconcile: (token, operations) => request('/api/sync/reconcile', { method: 'POST', token, body: JSON.stringify({ operations }) }),
  rlsProbe: (token, probe) => request('/api/rls/probe', { method: 'POST', token, body: JSON.stringify(probe) }),
};
