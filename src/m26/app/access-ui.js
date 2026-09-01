function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function passwordControl({
  id,
  name,
  autocomplete,
  describedBy='',
  minlength=8,
  maxlength=1024,
}={}){
  const safeId=e(id);
  return `
    <div class="m26-password-control">
      <input
        id="${safeId}"
        type="password"
        name="${e(name)}"
        autocomplete="${e(autocomplete)}"
        ${describedBy?`aria-describedby="${e(describedBy)}"`:''}
        required
        minlength="${Number(minlength)}"
        maxlength="${Number(maxlength)}"
      >
      <button
        type="button"
        class="m26-password-toggle"
        data-auth-action="toggle-password"
        aria-controls="${safeId}"
        aria-pressed="false"
        aria-label="Mostrar contraseña"
      >Mostrar</button>
    </div>
  `;
}

function brandLockup(){
  return `
    <div class="m26-auth-brand-lockup" aria-label="IBERFIT">
      <span class="m26-auth-brand-mark" aria-hidden="true"></span>
      <p class="m26-eyebrow">IBERFIT</p>
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
      <h1 id="m26-auth-title" tabindex="-1">Protege tu cuenta</h1>
      <p>Activa el acceso seguro de este dispositivo. IBERFIT utilizará Windows Hello, Face ID, Touch ID, huella o el PIN nativo disponible.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-continue-webauthn"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Preparando…' : 'Activar en este dispositivo'}
      </button>

      <p class="m26-field-help">La biometría o PIN se valida dentro del sistema operativo. IBERFIT no recibe ni almacena esos datos.</p>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'mfa-challenge') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Confirma tu identidad</h1>
      <p>Usa primero el bloqueo nativo de este dispositivo para continuar.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-continue-webauthn"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Confirmando…' : 'Usar este dispositivo'}
      </button>

      <button
        type="button"
        class="m26-text-action"
        data-auth-action="mfa-use-other-device"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        Usar una llave u otro dispositivo
      </button>

      <p class="m26-field-help">La opción de otro dispositivo puede mostrar un QR. Solo se utiliza si tú la eliges.</p>

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
        <label for="m26-new-password">
          Contraseña nueva
          ${passwordControl({id:'m26-new-password',name:'password',autocomplete:'new-password',describedBy:'m26-password-requirements'})}
        </label>

        <label for="m26-new-password-confirmation">
          Confirmar contraseña
          ${passwordControl({id:'m26-new-password-confirmation',name:'passwordConfirmation',autocomplete:'new-password',describedBy:'m26-password-requirements'})}
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

        <label for="m26-login-password">
          Contraseña
          ${passwordControl({id:'m26-login-password',name:'password',autocomplete:'current-password'})}
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
        ${brandLockup()}

        ${content}

        ${blockedSiteNotice}
        <iberfit-install-control></iberfit-install-control>

        <small>${e(accessNote)}</small>
      </section>
    </main>
  `;
}
