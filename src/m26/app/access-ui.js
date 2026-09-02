function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const REMEMBERED_EMAIL_STORAGE_KEY='iberfit.m26.remembered-email.v1';

export function normalizeRememberedEmail(value=''){
  const email=String(value||'').trim();
  if(!email||email.length>254||!email.includes('@'))return '';
  return email;
}

function safeStorage(storageLike){
  if(storageLike)return storageLike;
  try{return globalThis.localStorage||null;}catch{return null;}
}

function safeGet(storage,key){
  try{return storage?.getItem?.(key)||'';}catch{return '';}
}

function safeSet(storage,key,value){
  try{storage?.setItem?.(key,value);return true;}catch{return false;}
}

function safeRemove(storage,key){
  try{storage?.removeItem?.(key);return true;}catch{return false;}
}

export function enhanceAccessUi(root=globalThis.document,{storage:providedStorage=null}={}){
  const form=root?.querySelector?.('[data-auth-form="login"]');
  if(!form||form.dataset?.iberfitAccessEnhanced==='true')return false;
  if(form.dataset)form.dataset.iberfitAccessEnhanced='true';

  const emailInput=form.querySelector?.('input[name="email"]');
  const rememberInput=form.querySelector?.('input[name="rememberEmail"]');
  const storage=safeStorage(providedStorage);
  const remembered=normalizeRememberedEmail(safeGet(storage,REMEMBERED_EMAIL_STORAGE_KEY));

  if(emailInput&&remembered&&!String(emailInput.value||'').trim()){
    emailInput.value=remembered;
  }
  if(rememberInput&&remembered){
    rememberInput.checked=true;
  }

  for(const toggle of form.querySelectorAll?.('[data-password-toggle]')||[]){
    toggle.addEventListener('click',()=>{
      const targetId=toggle.getAttribute('aria-controls');
      const input=targetId?root.querySelector?.(`#${targetId}`):form.querySelector?.('input[name="password"]');
      if(!input)return;
      const reveal=input.type==='password';
      input.type=reveal?'text':'password';
      toggle.textContent=reveal?'Ocultar':'Mostrar';
      toggle.setAttribute('aria-pressed',reveal?'true':'false');
      toggle.setAttribute('aria-label',reveal?'Ocultar contraseña':'Mostrar contraseña');
      input.focus?.({preventScroll:true});
    });
  }

  rememberInput?.addEventListener('change',()=>{
    if(!rememberInput.checked)safeRemove(storage,REMEMBERED_EMAIL_STORAGE_KEY);
  });

  form.addEventListener('submit',()=>{
    const email=normalizeRememberedEmail(emailInput?.value||'');
    if(rememberInput?.checked&&email){
      safeSet(storage,REMEMBERED_EMAIL_STORAGE_KEY,email);
    }else{
      safeRemove(storage,REMEMBERED_EMAIL_STORAGE_KEY);
    }
  },{capture:true});

  return true;
}

function scheduleAccessEnhancement(){
  if(!globalThis.document)return;
  const schedule=typeof globalThis.queueMicrotask==='function'
    ?globalThis.queueMicrotask.bind(globalThis)
    :(callback)=>Promise.resolve().then(callback);
  schedule(()=>{try{enhanceAccessUi(globalThis.document);}catch{}});
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

      <p class="m26-field-help">Tu navegador abrirá Windows Hello, biometría, PIN o una llave de seguridad compatible. IBERFIT no recibe ni almacena tus datos biométricos.</p>

      <button type="button" data-auth-action="mfa-logout">
        Cerrar sesión
      </button>
    `;
  } else if (mode === 'mfa-challenge') {
    content = `
      <h1 id="m26-auth-title" tabindex="-1">Confirma tu identidad para continuar</h1>
      <p>Utiliza el acceso seguro de este dispositivo para completar la verificación requerida.</p>

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
      <h1 id="m26-auth-title" tabindex="-1">Crear o recuperar contraseña</h1>
      <p>Introduce el correo asociado a tu cuenta. Te enviaremos un enlace seguro para crear una contraseña nueva.</p>

      ${notice}

      <form data-auth-form="request-recovery">
        <label>
          Correo
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="none"
            spellcheck="false"
            maxlength="254"
            required
          >
        </label>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Enviando…' : 'Enviar enlace seguro'}
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
            inputmode="email"
            autocapitalize="none"
            spellcheck="false"
            maxlength="254"
            required
          >
        </label>

        <label>
          Contraseña
          <span class="m26-password-field">
            <input
              id="m26-login-password"
              type="password"
              name="password"
              autocomplete="current-password"
              required
              minlength="8"
              maxlength="1024"
            >
            <button
              type="button"
              class="m26-password-toggle"
              data-password-toggle
              aria-controls="m26-login-password"
              aria-pressed="false"
              aria-label="Mostrar contraseña"
            >Mostrar</button>
          </span>
        </label>

        <div class="m26-auth-options">
          <label class="m26-remember-email" for="m26-remember-email">
            <input id="m26-remember-email" type="checkbox" name="rememberEmail">
            <span>Recordar correo</span>
          </label>
          <button
            type="button"
            class="m26-auth-link"
            data-auth-action="forgot-password"
          >
            Primera vez o no recuerdo mi contraseña
          </button>
        </div>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Confirmando…' : 'Entrar'}
        </button>
      </form>
    `;
  }

  scheduleAccessEnhancement();

  return `
    <main class="m26-auth-page">
      <section class="m26-auth-card" aria-labelledby="m26-auth-title" aria-busy="${busy ? 'true' : 'false'}">
        <header class="m26-auth-brand">
          <img
            class="m26-auth-logo"
            src="/public/isotipo-iberfit.png"
            alt=""
            aria-hidden="true"
          >
          <p class="m26-eyebrow">IBERFIT</p>
        </header>

        ${content}

        ${blockedSiteNotice}
        <small>${e(accessNote)}</small>
      </section>
    </main>
  `;
}
