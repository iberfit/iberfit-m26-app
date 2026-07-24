const MAX_TOKEN_CHARS = 16_384;
const MAX_RECOVERY_LIFETIME_SECONDS = 24 * 60 * 60;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function validToken(value) {
  return Boolean(
    value &&
    value.length <= MAX_TOKEN_CHARS &&
    !CONTROL_CHARS.test(value)
  );
}

function integerParameter(params, name) {
  const raw = params.get(name);

  if (raw === null || !/^\d+$/.test(raw)) return null;

  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function recoveryFragmentPresent(params) {
  return (
    params.get('type') === 'recovery' ||
    params.has('access_token') ||
    params.has('refresh_token') ||
    params.has('error') ||
    params.has('error_code')
  );
}

export function inspectPasswordRecoveryHash(
  hash = '',
  { nowSeconds = Math.floor(Date.now() / 1000) } = {}
) {
  const rawHash = String(hash || '').trim();

  if (
    !rawHash.startsWith('#') ||
    rawHash.length > (MAX_TOKEN_CHARS * 2) + 4096
  ) {
    return Object.freeze({ status: 'none', session: null });
  }

  const params = new URLSearchParams(rawHash.slice(1));

  if (!recoveryFragmentPresent(params)) {
    return Object.freeze({ status: 'none', session: null });
  }

  const errorCode = String(params.get('error_code') || '').toLowerCase();

  if (errorCode.includes('expired') || errorCode === 'otp_expired') {
    return Object.freeze({ status: 'expired', session: null });
  }

  if (params.has('error') || params.get('type') !== 'recovery') {
    return Object.freeze({ status: 'invalid', session: null });
  }

  const accessToken = params.get('access_token') || '';

  if (
    params.getAll('type').length !== 1 ||
    params.getAll('access_token').length !== 1 ||
    params.getAll('expires_at').length > 1 ||
    params.getAll('expires_in').length > 1 ||
    !validToken(accessToken)
  ) {
    return Object.freeze({ status: 'invalid', session: null });
  }

  const now = Number(nowSeconds);
  const expiresAtParameter = integerParameter(params, 'expires_at');
  const expiresInParameter = integerParameter(params, 'expires_in');
  let expiresAt = expiresAtParameter;

  if (!Number.isSafeInteger(now) || now < 0) {
    return Object.freeze({ status: 'invalid', session: null });
  }

  if (expiresAt === null) {
    if (
      expiresInParameter === null ||
      expiresInParameter <= 0 ||
      expiresInParameter > MAX_RECOVERY_LIFETIME_SECONDS
    ) {
      return Object.freeze({ status: 'invalid', session: null });
    }

    expiresAt = now + expiresInParameter;
  }

  if (
    expiresAt <= now ||
    expiresAt > now + MAX_RECOVERY_LIFETIME_SECONDS
  ) {
    return Object.freeze({ status: 'expired', session: null });
  }

  return Object.freeze({
    status: 'valid',
    session: Object.freeze({
      accessToken,
      expiresAt,
      type: 'recovery',
    }),
  });
}

export function parsePasswordRecoveryHash(hash = '', options = {}) {
  const inspected = inspectPasswordRecoveryHash(hash, options);
  return inspected.status === 'valid' ? inspected.session : null;
}

export function recoveryUrlWithoutFragment(locationLike = globalThis.location) {
  const pathname = String(locationLike?.pathname || '/');
  const search = String(locationLike?.search || '');

  if (
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    CONTROL_CHARS.test(pathname) ||
    CONTROL_CHARS.test(search) ||
    (search && !search.startsWith('?'))
  ) {
    return '/';
  }

  return `${pathname}${search}`;
}
