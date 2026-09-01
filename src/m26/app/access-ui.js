function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function setPasswordVisibility(input, button, visible) {
  if (!input || !button) return false;
  const show = visible === true;
  input.type = show ? 'text' : 'password';
  button.setAttribute?.('aria-pressed', show ? 'true' : 'false');
  button.setAttribute?.('aria-label', show ? 'Ocultar contraseña' : 'Ver contraseña');
  const label = button.querySelector?.('[data-password-visibility-label]');
  if (label) label.textContent = show ? 'Ocultar' : 'Ver';
  return show;
}

function registerPasswordVisibilityElement() {
  const registry = globalThis.customElements;
  const BaseElement = globalThis.HTMLElement;
  if (!registry || typeof BaseElement !== 'function' || registry.get('iberfit-password-field')) return;
  registry.define('iberfit-password-field', class extends BaseElement {
    connectedCallback() {
      this._input = this.querySelector?.('[data-password-input]') || null;
      this._button = this.querySelector?.('[data-password-visibility]') || null;
      if (!this._input || !this._button) return;
      this._onToggle = () => {
        const visible = this._input.type === 'password';
        setPasswordVisibility(this._input, this._button, visible);
        this._input.focus?.({ preventScroll: true });
      };
      this._button.addEventListener?.('click', this._onToggle);
      setPasswordVisibility(this._input, this._button, false);
    }
    disconnectedCallback() {
      this._button?.removeEventListener?.('click', this._onToggle);
      this._input = null;
      this._button = null;
      this._onToggle = null;
    }
  });
}

registerPasswordVisibilityElement();

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
      <p>Las cuentas de entrenador y administración requieren una confirmación segura adicional antes de acceder a información de clientes.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-continue-webauthn"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Preparando…' : 'Configurar acceso seguro'}
      </button>

      <p class="m26-field-help">Se priorizará Windows Hello, Touch ID, Face ID, PIN o biometría del propio dispositivo. IBERFIT no recibe ni almacena tus datos biométricos; una llave externa queda disponible como alternativa compatible.</p>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'mfa-challenge') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Confirma tu identidad para continuar</h1>
      <p>Utiliza preferentemente el acceso seguro de este dispositivo para completar la verificación requerida.</p>

      ${notice}

      <button
        type="button"
        class="m26-primary-action"
        data-auth-action="mfa-continue-webauthn"
        ${disabled ? 'disabled aria-disabled="true"' : ''}
      >
        ${busy ? 'Confirmando…' : 'Continuar de forma segura'}
      </button>

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
        <label for="m26-login-email">Correo</label>
        <input
          id="m26-login-email"
          type="email"
          name="email"
          autocomplete="username"
          maxlength="254"
          required
        >

        <label for="m26-login-password">Contraseña</label>
        <iberfit-password-field class="m26-password-field">
          <input
            id="m26-login-password"
            data-password-input
            type="password"
            name="password"
            autocomplete="current-password"
            required
            minlength="8"
            maxlength="1024"
          >
          <button
            type="button"
            class="m26-password-visibility"
            data-password-visibility
            aria-controls="m26-login-password"
            aria-pressed="false"
            aria-label="Ver contraseña"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M2.2 12s3.6-6 9.8-6 9.8 6 9.8 6-3.6 6-9.8 6-9.8-6-9.8-6Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>
            <span data-password-visibility-label>Ver</span>
          </button>
        </iberfit-password-field>

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
        <header class="m26-auth-brand">
          <img
            class="m26-auth-brandmark"
            src="/public/isotipo-iberfit.png"
            alt=""
            aria-hidden="true"
            width="64"
            height="64"
          >
          <p class="m26-eyebrow">IBERFIT</p>
        </header>

        ${content}

        ${blockedSiteNotice}
        <iberfit-install-control></iberfit-install-control>

        <small>${e(accessNote)}</small>
      </section>
    </main>
  `;
}
