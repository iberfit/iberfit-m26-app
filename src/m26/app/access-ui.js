function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeMfaQrSrc(value){
  const raw=String(value||'').trim();
  if(!raw||raw.length>120000)return '';
  if(/^data:image\/svg\+xml(?:;charset=utf-8|;utf-8)?,/iu.test(raw))return raw;
  if(/^<svg[\s>]/iu.test(raw)){
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
  }
  return '';
}

export function renderAccessUi({
  message = '',
  busy = false,
  backendReady = true,
  qaOnly = false,
  mode = 'login',
  noticeKind = 'status',
  mfa = null,
  host = '',
} = {}) {
  const disabled = busy || !backendReady;
  const normalizedHost = String(host || '').trim().toLowerCase();
  const previewBlocked =
    qaOnly === true &&
    backendReady === false &&
    (
      normalizedHost === 'iberfit-m26-canary.pages.dev' ||
      normalizedHost.endsWith('.iberfit-m26-canary.pages.dev')
    );
  const blockedSiteNotice = backendReady
    ? ''
    : previewBlocked
      ? `<div class="m26-notice is-warning m26-auth-site-blocked" role="status">
          <p>Este enlace de revisión no admite acceso. Abre el Canary oficial para continuar.</p>
          <a class="m26-auth-canonical-link" href="https://m26-canary.iberfit.cl/">Abrir Canary oficial</a>
        </div>`
      : '<p class="m26-notice is-warning">El acceso no está disponible temporalmente en este sitio.</p>';

  const notice = message
    ? `<p class="m26-auth-notice${noticeKind === 'error' ? ' is-error' : ''}" role="${noticeKind === 'error' ? 'alert' : 'status'}" aria-live="${noticeKind === 'error' ? 'assertive' : 'polite'}" aria-atomic="true">${e(message)}</p>`
    : '';

  const accessNote = qaOnly
    ? 'Acceso restringido a las cuentas autorizadas para esta revisión.'
    : 'Acceso privado para clientes y equipo IBERFIT.';

  let content = '';

  if (mode === 'mfa-required') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Verificación en dos pasos obligatoria</h1>
      <p>Las cuentas de entrenador y administración requieren un segundo factor antes de acceder a información de clientes.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-start-enrollment"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Preparando…' : 'Configurar verificación'}
      </button>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'mfa-enroll-totp') {
    const qr=safeMfaQrSrc(mfa?.qrCode);
    const qrMarkup=qr
      ? `<img class="m26-mfa-qr" src="${e(qr)}" width="192" height="192" alt="Código QR para configurar la aplicación de autenticación">`
      : '';
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Configura tu verificación en dos pasos</h1>
      <p>Escanea el QR con tu aplicación de autenticación. Si no puedes escanearlo, introduce la clave manualmente.</p>

      ${notice}
      ${qrMarkup}

      <p class="m26-field-help">Clave manual: <strong>${e(mfa?.secret||'')}</strong></p>

      <form data-auth-form="mfa-verify">
        <label>
          Código de 6 dígitos
          <input
            type="text"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            minlength="6"
            maxlength="6"
            required
          >
        </label>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Verificando…' : 'Activar y continuar'}
        </button>
      </form>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'mfa-challenge') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Confirma tu segundo factor</h1>
      <p>Introduce el código de 6 dígitos de tu aplicación de autenticación para continuar.</p>

      ${notice}

      <form data-auth-form="mfa-verify">
        <label>
          Código de 6 dígitos
          <input
            type="text"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            minlength="6"
            maxlength="6"
            required
          >
        </label>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Verificando…' : 'Verificar y entrar'}
        </button>
      </form>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'request-recovery') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Recuperar contraseña</h1>
      <p>Introduce el correo asociado a tu cuenta.</p>

      ${notice}

      <form data-auth-form="request-recovery">
        <label>
          Correo
          <input
            type="email"
            name="email"
            autocomplete="email"
            maxlength="254"
            required
          >
        </label>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Enviando…' : 'Enviar enlace'}
        </button>

        <button
          type="button"
          data-auth-action="back-to-login"
        >
          Volver al acceso
        </button>
      </form>
    `;
  } else if (mode === 'update-password') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Crear contraseña nueva</h1>
      <p>Introduce y confirma la contraseña que utilizarás para acceder.</p>

      ${notice}

      <form data-auth-form="update-password">
        <label>
          Contraseña nueva
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            aria-describedby="m26-password-requirements"
            required
            minlength="8"
            maxlength="1024"
          >
        </label>

        <label>
          Confirmar contraseña
          <input
            type="password"
            name="passwordConfirmation"
            autocomplete="new-password"
            aria-describedby="m26-password-requirements"
            required
            minlength="8"
            maxlength="1024"
          >
        </label>

        <p id="m26-password-requirements" class="m26-field-help">
          Utiliza al menos 8 caracteres y una contraseña distinta de las que uses en otros servicios.
        </p>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>

        <button
          type="button"
          data-auth-action="back-to-login"
        >
          Volver al acceso
        </button>
      </form>
    `;
  } else {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Entrenamiento personal con criterio</h1>
      <p>Diagnóstico, planificación, control y seguimiento.</p>

      ${notice}

      <form data-auth-form="login">
        <label>
          Correo
          <input
            type="email"
            name="email"
            autocomplete="username"
            maxlength="254"
            required
          >
        </label>

        <label>
          Contraseña
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            required
            minlength="8"
            maxlength="1024"
          >
        </label>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Confirmando…' : 'Entrar'}
        </button>

        <button
          type="button"
          data-auth-action="forgot-password"
        >
          Olvidé mi contraseña
        </button>
      </form>
    `;
  }

  return `
    <main class="m26-auth-page">
      <section class="m26-auth-card" aria-labelledby="m26-auth-title" aria-busy="${busy ? 'true' : 'false'}">
        <img
          src="/public/isotipo-iberfit.png"
          alt=""
          aria-hidden="true"
        >

        <p class="m26-eyebrow">IBERFIT</p>

        ${content}

        ${blockedSiteNotice}

        <small>${e(accessNote)}</small>
      </section>
    </main>
  `;
}
