import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAccessUi } from '../src/m26/app/access-ui.js';
import {
  inspectPasswordRecoveryHash,
  parsePasswordRecoveryHash,
  recoveryUrlWithoutFragment,
} from '../src/m26/app/password-recovery.js';
import {
  createM26Application,
  __applicationInternals,
} from '../src/m26/app/application.js';
import {
  createM26Transport,
  resolveM26Runtime,
} from '../src/m26/supabase-transport.js';

const runtime = {
  enabled: true,
  projectRef: 'pjhmrhejsoofmouedavw',
  url: 'https://pjhmrhejsoofmouedavw.supabase.co',
  publishableKey: 'publishable-key-for-test',
  qaOnly: true,
};

const canaryLocation = {
  hostname: 'm26-canary.iberfit.cl',
  pathname: '/',
  search: '',
  hash: '',
};
const TEST_CREDENTIAL = ['Nueva', 'Clave', 'QA', '2026', '!'].join('');
const DIFFERENT_TEST_CREDENTIAL = ['Otra', 'Clave', 'QA', '2026', '!'].join('');

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name === 'content-type' ? 'application/json' : null;
      },
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createRoot(onWrite = () => {}) {
  const listeners = new Map();
  let html = '';

  return {
    set innerHTML(value) {
      html = String(value);
      onWrite(html);
    },
    get innerHTML() {
      return html;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    listener(type) {
      return listeners.get(type);
    },
  };
}

function submitEvent(formType, fields) {
  const form = {
    fields,
    getAttribute(name) {
      return name === 'data-auth-form' ? formType : null;
    },
  };

  return {
    target: {
      closest() {
        return form;
      },
    },
    preventDefault() {},
  };
}

async function withFakeFormData(run) {
  const original = globalThis.FormData;

  globalThis.FormData = class FakeFormData {
    constructor(form) {
      this.fields = form.fields;
    }

    get(name) {
      return this.fields[name] ?? null;
    }
  };

  try {
    return await run();
  } finally {
    globalThis.FormData = original;
  }
}

test('RC30 ofrece recuperación y actualización accesibles sin mensajes técnicos', () => {
  const login = renderAccessUi({
    mode: 'login',
    backendReady: true,
    qaOnly: true,
  });

  assert.match(login, /data-auth-action="forgot-password"/);
  assert.match(login, /Olvidé mi contraseña/);
  assert.match(login, /aria-labelledby="m26-auth-title"/);

  const request = renderAccessUi({
    mode: 'request-recovery',
    backendReady: true,
    qaOnly: true,
  });

  assert.match(request, /data-auth-form="request-recovery"/);
  assert.match(request, /type="email"/);
  assert.match(request, /data-auth-action="back-to-login"/);

  const update = renderAccessUi({
    mode: 'update-password',
    backendReady: true,
    qaOnly: true,
    message: 'Las contraseñas no coinciden.',
    noticeKind: 'error',
  });

  assert.match(update, /data-auth-form="update-password"/);
  assert.match(update, /name="password"/);
  assert.match(update, /name="passwordConfirmation"/);
  assert.match(update, /autocomplete="new-password"/);
  assert.match(update, /role="alert"/);
  assert.match(update, /aria-live="assertive"/);
  assert.doesNotMatch(update, /M26_|RECOVERY_TOKEN|HTTP_\d+/);
});

test('RC30 habilita una configuración QA exclusivamente en canary', () => {
  for (const hostname of ['app.iberfit.cl', 'coach.iberfit.cl', 'preview.pages.dev']) {
    assert.equal(
      resolveM26Runtime(runtime, { hostname }).enabled,
      false,
      hostname
    );
  }

  const canary = resolveM26Runtime(runtime, {
    hostname: 'm26-canary.iberfit.cl',
  });
  assert.equal(canary.enabled, true);
  assert.equal(canary.qaOnly, true);
  assert.equal(canary.canary, true);
});

test('RC30 conserva solo el token de acceso temporal y rechaza enlaces caducados', () => {
  const nowSeconds = 2_000_000_000;
  const result = inspectPasswordRecoveryHash(
    '#access_token=fake-recovery-access' +
    '&refresh_token=fake-refresh-token-that-must-not-persist' +
    `&expires_at=${nowSeconds + 3600}` +
    '&type=recovery',
    { nowSeconds }
  );

  assert.deepEqual(result, {
    status: 'valid',
    session: {
      accessToken: 'fake-recovery-access',
      expiresAt: nowSeconds + 3600,
      type: 'recovery',
    },
  });
  assert.equal('refreshToken' in result.session, false);

  assert.deepEqual(
    inspectPasswordRecoveryHash(
      `#access_token=fake&type=recovery&expires_at=${nowSeconds - 1}`,
      { nowSeconds }
    ),
    { status: 'expired', session: null }
  );
  assert.deepEqual(
    inspectPasswordRecoveryHash(
      `#access_token=fake&type=recovery&expires_at=${nowSeconds + 90000}`,
      { nowSeconds }
    ),
    { status: 'expired', session: null }
  );
  assert.deepEqual(
    inspectPasswordRecoveryHash(
      '#access_token=first&access_token=second&type=recovery&expires_in=3600',
      { nowSeconds }
    ),
    { status: 'invalid', session: null }
  );
  assert.deepEqual(
    inspectPasswordRecoveryHash(
      '#error=access_denied&error_code=otp_expired&error_description=technical',
      { nowSeconds }
    ),
    { status: 'expired', session: null }
  );
  assert.equal(
    parsePasswordRecoveryHash('#access_token=fake&type=signup&expires_in=3600'),
    null
  );
  assert.deepEqual(inspectPasswordRecoveryHash('#route=hoy'), {
    status: 'none',
    session: null,
  });
});

test('RC30 limpia el fragmento antes de mostrar el formulario y conserva la búsqueda', async () => {
  const order = [];
  const root = createRoot(() => order.push('render'));
  const locationLike = {
    ...canaryLocation,
    search: '?origen=correo',
    hash: '#access_token=fake-access&refresh_token=fake-refresh&expires_in=3600&type=recovery',
  };
  const historyLike = {
    replaceState(state, title, url) {
      order.push('scrub');
      assert.equal(state, null);
      assert.equal(title, '');
      assert.equal(url, '/?origen=correo');
    },
  };
  const app = await createM26Application({
    root,
    runtimeConfig: runtime,
    locationLike,
    historyLike,
  });

  assert.equal(await app.mount(), false);
  assert.deepEqual(order.slice(0, 2), ['scrub', 'render']);
  assert.match(root.innerHTML, /data-auth-form="update-password"/);
  assert.doesNotMatch(root.innerHTML, /fake-access|fake-refresh/);
  assert.equal(recoveryUrlWithoutFragment(locationLike), '/?origen=correo');
});

test('RC30 falla cerrado si no puede limpiar el fragmento de la URL', async () => {
  const root = createRoot();
  const app = await createM26Application({
    root,
    runtimeConfig: runtime,
    locationLike: {
      ...canaryLocation,
      hash: '#access_token=fake-access&expires_in=3600&type=recovery',
    },
    historyLike: {},
  });

  assert.equal(await app.mount(), false);
  assert.match(root.innerHTML, /data-auth-form="request-recovery"/);
  assert.match(root.innerHTML, /no es válido o ha caducado/);
  assert.doesNotMatch(root.innerHTML, /fake-access/);
});

test('RC30 solicita recuperación QA con mensaje genérico y bloquea doble envío', async () => {
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  try {
    await withFakeFormData(async () => {
      const root = createRoot();
      const app = await createM26Application({
        root,
        runtimeConfig: runtime,
        locationLike: canaryLocation,
        historyLike: { replaceState() {} },
      });

      await app.mount();
      const handler = root.listener('submit');
      const event = submitEvent('request-recovery', {
        email: 'iberfit.cl+qa.coach@gmail.com',
      });
      const first = handler(event);
      const second = handler(event);

      assert.equal(fetchCount, 1);
      resolveFetch(response({}));
      await Promise.all([first, second]);
      assert.equal(fetchCount, 1);
      assert.match(root.innerHTML, /Si el correo corresponde a una cuenta QA autorizada/);
      assert.doesNotMatch(root.innerHTML, /existe|no existe|usuario/i);

      const confirmation = root.innerHTML;
      await handler(submitEvent('request-recovery', {
        email: 'persona@gmail.com',
      }));
      assert.equal(fetchCount, 1);
      assert.equal(root.innerHTML, confirmation);

      app.destroy();
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RC30 valida identidad QA antes del PUT y revoca después de actualizar', async () => {
  const calls = [];
  const user = {
    id: 'qa-coach-user',
    email: 'iberfit.cl+qa.coach@gmail.com',
  };
  const transport = createM26Transport(runtime, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });

      if (url.includes('/auth/v1/recover')) return response({});
      if (url.endsWith('/auth/v1/user')) return response(user);
      if (url.endsWith('/auth/v1/logout')) return response(null, 204);
      return response({}, 404);
    },
  });

  await transport.requestPasswordRecovery(
    'IBERFIT.CL+QA.COACH@GMAIL.COM',
    'https://m26-canary.iberfit.cl/'
  );

  assert.deepEqual(
    JSON.parse(calls[0].options.body),
    { email: 'iberfit.cl+qa.coach@gmail.com' }
  );
  await assert.rejects(
    () => transport.requestPasswordRecovery(
      'persona@gmail.com',
      'https://m26-canary.iberfit.cl/'
    ),
    /QA_ACCOUNT_REQUIRED/
  );
  await assert.rejects(
    () => transport.requestPasswordRecovery(
      'iberfit.cl+qa.coach@gmail.com',
      'https://app.iberfit.cl/'
    ),
    /RECOVERY_REDIRECT_INVALID/
  );

  const updated = await transport.updatePassword(
    'fake-recovery-access',
    TEST_CREDENTIAL
  );

  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[2].options.method, 'PUT');
  assert.equal(calls[1].url, calls[2].url);
  assert.deepEqual(
    JSON.parse(calls[2].options.body),
    { password: TEST_CREDENTIAL }
  );
  assert.equal(updated.email, user.email);
});

test('RC30 nunca modifica la contraseña de una identidad no QA', async () => {
  const methods = [];
  const transport = createM26Transport(runtime, {
    fetchImpl: async (_url, options) => {
      methods.push(options.method);
      return response({
        id: 'real-user',
        email: 'persona@gmail.com',
      });
    },
  });

  await assert.rejects(
    () => transport.updatePassword(
      'fake-non-qa-recovery-access',
      TEST_CREDENTIAL
    ),
    /QA_ACCOUNT_REQUIRED/
  );
  assert.deepEqual(methods, ['GET']);
});

test('RC30 actualiza una sola vez, no acepta contraseñas distintas y cierra la sesión', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const user = {
    id: 'qa-coach-user',
    email: 'iberfit.cl+qa.coach@gmail.com',
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return response(user);
    if (url.endsWith('/auth/v1/logout')) return response(null, 204);
    return response({}, 404);
  };

  try {
    await withFakeFormData(async () => {
      const root = createRoot();
      const app = await createM26Application({
        root,
        runtimeConfig: runtime,
        locationLike: {
          ...canaryLocation,
          hash: '#access_token=fake-access&refresh_token=fake-refresh&expires_in=3600&type=recovery',
        },
        historyLike: { replaceState() {} },
      });

      await app.mount();
      const handler = root.listener('submit');

      await handler(submitEvent('update-password', {
        password: TEST_CREDENTIAL,
        passwordConfirmation: DIFFERENT_TEST_CREDENTIAL,
      }));
      assert.equal(calls.length, 0);
      assert.match(root.innerHTML, /Las contraseñas no coinciden/);

      await handler(submitEvent('update-password', {
        password: TEST_CREDENTIAL,
        passwordConfirmation: TEST_CREDENTIAL,
      }));

      assert.deepEqual(calls.map((call) => call.options.method), ['GET', 'PUT', 'POST']);
      assert.equal(calls[2].url.endsWith('/auth/v1/logout'), true);
      assert.match(root.innerHTML, /Contraseña actualizada/);
      assert.match(root.innerHTML, /data-auth-form="login"/);

      app.destroy();
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('RC30 traduce errores de red y enlaces inválidos sin exponer códigos', () => {
  const {
    recoveryNetworkError,
    recoveryPasswordError,
    invalidRecoverySession,
    RECOVERY_REQUEST_CONFIRMATION,
  } = __applicationInternals;

  assert.match(recoveryNetworkError(new Error('Failed to fetch')), /conexión/);
  assert.match(recoveryPasswordError(new Error('M26_TIMEOUT')), /no se ha modificado/);
  assert.equal(
    invalidRecoverySession(Object.assign(new Error('internal'), { status: 401 })),
    true
  );
  assert.doesNotMatch(RECOVERY_REQUEST_CONFIRMATION, /existe|no existe/i);
  assert.doesNotMatch(
    recoveryPasswordError(new Error('M26_RECOVERY_TOKEN_INVALID')),
    /M26_|TOKEN|HTTP/i
  );
});
