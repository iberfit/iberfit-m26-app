function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function passwordField({
  id,
  name,
  label,
  autocomplete,
  describedBy='',
}={}){
  return `
    <div class="m26-auth-field">
      <label for="${e(id)}">${e(label)}</label>
      <div class="m26-password-control">
        <input
          id="${e(id)}"
          type="password"
          name="${e(name)}"
          autocomplete="${e(autocomplete)}"
          ${describedBy?`aria-describedby="${e(describedBy)}"`:''}
          required
          minlength="8"
          maxlength="1024"
        >
        <button
          type="button"
          class="m26-password-toggle"
          data-auth-password-toggle
          aria-controls="${e(id)}"
          aria-pressed="false"
          aria-label="Mostrar ${e(label.toLowerCase())}"
        >Mostrar</button>
      </div>
    </div>
  `;
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
      <h1 id="m26-auth-title" tabindex="-1">Protege tu cuenta en este dispositivo</h1>
      <p>Activa el acceso seguro del propio dispositivo antes de acceder a información de clientes.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-continue-webauthn"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Preparando…' : 'Activar acceso en este dispositivo'}
      </button>

      <p class="m26-field-help">IBERFIT utilizará Windows Hello, Face ID, Touch ID, huella o PIN, según el bloqueo disponible en este equipo. Los datos biométricos no salen del dispositivo.</p>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'mfa-challenge') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Confirma tu identidad</h1>
      <p>Desbloquea este dispositivo para continuar de forma segura.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-continue-webauthn"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Confirmando…' : 'Usar bloqueo de este dispositivo'}
      </button>

      <p class="m26-field-help">Se prioriza el autenticador integrado de este equipo; no necesitas escanear un QR para el flujo normal.</p>

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
        <div class="m26-auth-field">
          <label for="m26-recovery-email">Correo</label>
          <input
            id="m26-recovery-email"
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            maxlength="254"
            required
          >
        </div>

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
        ${passwordField({id:'m26-new-password',name:'password',label:'Contraseña nueva',autocomplete:'new-password',describedBy:'m26-password-requirements'})}
        ${passwordField({id:'m26-new-password-confirmation',name:'passwordConfirmation',label:'Confirmar contraseña',autocomplete:'new-password',describedBy:'m26-password-requirements'})}

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
        <div class="m26-auth-field">
          <label for="m26-login-email">Correo</label>
          <input
            id="m26-login-email"
            type="email"
            name="email"
            autocomplete="username"
            inputmode="email"
            maxlength="254"
            required
          >
        </div>

        ${passwordField({id:'m26-login-password',name:'password',label:'Contraseña',autocomplete:'current-password'})}

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
        <div class="m26-auth-brand" aria-label="IBERFIT">
          <img
            class="m26-auth-mark"
            src="/public/isotipo-iberfit.png"
            alt=""
            aria-hidden="true"
          >
          <p class="m26-eyebrow">IBERFIT</p>
        </div>

        ${content}

        ${blockedSiteNotice}
        <iberfit-install-control></iberfit-install-control>

        <small>${e(accessNote)}</small>
      </section>
    </main>
  `;
}
