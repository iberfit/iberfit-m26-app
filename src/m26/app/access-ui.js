import {createSessionVault} from './session-vault.js';
import {runWebAuthnCeremony,webAuthnSupported} from './webauthn.js';
import {resolveM26Runtime,createM26Transport} from '../supabase-transport.js';

function e(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const REMEMBERED_EMAIL_STORAGE_KEY='iberfit.m26.remembered-email.v1';

const ACCESS_MODES=new Set([
  'login',
  'request-recovery',
  'update-password',
  'mfa-required',
  'mfa-challenge',
  'mfa-email-code',
]);

export function normalizeRememberedEmail(value=''){
  const email=String(value||'').trim();
  if(!email||email.length>254||!email.includes('@'))return '';
  return email;
}

export function maskAccessEmail(value=''){
  const email=normalizeRememberedEmail(value);
  const [local='',domain='']=email.split('@');
  if(!local||!domain)return '';
  const visible=local.length<=2?local.slice(0,1):local.slice(0,2);
  const hiddenCount=Math.max(2,Math.min(6,local.length-visible));
  return `${visible}${'\u2022'.repeat(hiddenCount)}@${domain}`;
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

async function registerCurrentDevice(button){
  if(!webAuthnSupported())throw new Error('M26_WEBAUTHN_UNSUPPORTED');
  const runtime=resolveM26Runtime(globalThis.__IBERFIT_M26_RUNTIME__||{},globalThis.location);
  if(!runtime.enabled)throw new Error('M26_BACKEND_DISABLED');
  const session=createSessionVault().load();
  if(!session?.token||!session?.user?.id)throw new Error('M26_AUTH_REQUIRED');
  const transport=createM26Transport(runtime);
  const originalLabel=String(button?.textContent||'Configurar este dispositivo').trim();
  if(button){button.disabled=true;button.setAttribute('aria-disabled','true');button.textContent='Abriendo seguridad del dispositivo…';}
  try{
    const user=await transport.authUser(session.token);
    if(user.id!==session.user.id)throw new Error('M26_MFA_IDENTITY_MISMATCH');
    const enrollment=await transport.enrollWebAuthn(session.token);
    const challenge=await transport.challengeWebAuthn(session.token,enrollment.factorId);
    if(challenge.type!=='create')throw new Error('M26_WEBAUTHN_CHALLENGE_TYPE_MISMATCH');
    const ceremony=await runWebAuthnCeremony(challenge,{friendlyName:'IBERFIT · este dispositivo'});
    const verified=await transport.verifyWebAuthn(session.token,{
      factorId:enrollment.factorId,
      challengeId:challenge.challengeId,
      type:ceremony.type,
      credentialResponse:ceremony.credentialResponse,
    });
    if(verified.user.id!==session.user.id)throw new Error('M26_MFA_IDENTITY_MISMATCH');
    const assurance=await transport.authAssuranceContext(session.token);
    if(assurance.iberfitAssurance!=='verified')throw new Error('M26_PRIVILEGED_WEBAUTHN_REQUIRED');
    if(button)button.textContent='Dispositivo configurado';
    globalThis.location?.reload?.();
    return true;
  }catch(error){
    if(button){button.disabled=false;button.removeAttribute('aria-disabled');button.textContent=originalLabel;}
    throw error;
  }
}

function surfaceDeviceRegistrationError(root){
  const card=root?.querySelector?.('.m26-auth-card');
  const actions=card?.querySelector?.('.m26-auth-actions');
  if(!card||!actions)return;
  let notice=card.querySelector?.('.m26-auth-notice[data-device-registration-error]');
  if(!notice&&globalThis.document?.createElement){
    notice=globalThis.document.createElement('p');
    notice.className='m26-auth-notice is-error';
    notice.dataset.deviceRegistrationError='true';
    notice.setAttribute('role','alert');
    actions.before(notice);
  }
  if(notice)notice.textContent='No se pudo configurar este dispositivo. Comprueba que tiene PIN, contraseña o biometría activados e inténtalo de nuevo.';
}

function enhanceDeviceRegistration(root){
  let enhanced=false;
  for(const button of root?.querySelectorAll?.('[data-auth-action="mfa-register-device"]')||[]){
    if(button.dataset?.iberfitDeviceRegistrationEnhanced==='true')continue;
    if(button.dataset)button.dataset.iberfitDeviceRegistrationEnhanced='true';
    button.addEventListener('click',(event)=>{
      event.preventDefault?.();
      event.stopPropagation?.();
      void registerCurrentDevice(button).catch(()=>surfaceDeviceRegistrationError(root));
    });
    enhanced=true;
  }
  return enhanced;
}

function enhancePasswordVisibility(root){
  let enhanced=false;
  for(const toggle of root?.querySelectorAll?.('[data-password-toggle]')||[]){
    if(toggle.dataset?.iberfitPasswordToggleEnhanced==='true')continue;
    if(toggle.dataset)toggle.dataset.iberfitPasswordToggleEnhanced='true';
    toggle.addEventListener('click',()=>{
      const targetId=toggle.getAttribute?.('aria-controls');
      const input=targetId?root?.querySelector?.(`#${targetId}`):null;
      if(!input)return;
      const reveal=input.type==='password';
      input.type=reveal?'text':'password';
      toggle.textContent=reveal?'Ocultar':'Mostrar';
      toggle.setAttribute?.('aria-pressed',reveal?'true':'false');
      toggle.setAttribute?.('aria-label',reveal?'Ocultar contraseña':'Mostrar contraseña');
      input.focus?.({preventScroll:true});
    });
    enhanced=true;
  }
  return enhanced;
}

export function enhanceAccessUi(root=globalThis.document,{storage:providedStorage=null}={}){
  const deviceEnhanced=enhanceDeviceRegistration(root);
  const passwordEnhanced=enhancePasswordVisibility(root);
  const form=root?.querySelector?.('[data-auth-form="login"]');
  if(!form||form.dataset?.iberfitAccessEnhanced==='true')return deviceEnhanced||passwordEnhanced;
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

function recoveryFlowMarkup(currentStep){
  const steps=[
    ['Correo','Identifica tu cuenta'],
    ['Enlace','Abre el acceso seguro'],
    ['Contraseña','Crea la nueva clave'],
  ];
  return `
    <ol class="m26-auth-flow" aria-label="Recuperación de acceso">
      ${steps.map(([label,description],index)=>{
        const step=index+1;
        const state=step<currentStep?'complete':step===currentStep?'current':'upcoming';
        return `<li class="m26-auth-flow-step is-${state}"${state==='current'?' aria-current="step"':''}>
          <span class="m26-auth-flow-index" aria-hidden="true">${step}</span>
          <span class="m26-auth-flow-label"><strong>${label}</strong><span>${description}</span></span>
        </li>`;
      }).join('')}
    </ol>
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
  sessionRetryAvailable = false,
} = {}) {
  const normalizedMode=ACCESS_MODES.has(mode)?mode:'login';
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
      : '<p class="m26-notice is-warning" role="status">El acceso no está disponible temporalmente en este sitio.</p>';

  const rawMessage=String(message||'');
  const contextBlocked=/M26_ROLE_CONTEXT_MISSING/u.test(rawMessage);
  const sessionExpired=/sesión (?:expiró|perdió autorización)|sesión perdió autorización/iu.test(rawMessage);
  const recoveryInvalid=normalizedMode==='request-recovery'&&noticeKind==='error'&&/enlace de recuperación|caducad/iu.test(rawMessage);
  const normalizedNoticeKind=contextBlocked?'blocked':noticeKind==='error'?'error':noticeKind==='success'?'success':'status';
  const assertive=['error','blocked'].includes(normalizedNoticeKind);
  const noticeClass=normalizedNoticeKind==='error'
    ?' is-error'
    :normalizedNoticeKind==='blocked'
      ?' is-blocked'
      :normalizedNoticeKind==='success'
        ?' is-success'
        :'';
  const notice = message
    ? `<p class="m26-auth-notice${noticeClass}" role="${assertive?'alert':'status'}" aria-live="${assertive?'assertive':'polite'}" aria-atomic="true">${e(message)}</p>`
    : '';
  const contextNotice=contextBlocked
    ? `<div class="m26-auth-context-state" role="status" aria-label="Estado del acceso">
        <span class="m26-auth-context-mark" aria-hidden="true"></span>
        <div>
          <strong>Identidad confirmada · acceso pendiente</strong>
          <p>La cuenta es válida, pero todavía no tiene una aplicación IBERFIT habilitada. Puedes volver a intentar el acceso o entrar con otra cuenta mientras se revisa la asignación.</p>
        </div>
      </div>`
    :'';
  const authState=previewBlocked
    ?'blocked'
    :!backendReady
      ?'unavailable'
      :busy
        ?'busy'
        :contextBlocked
          ?'context-blocked'
          :sessionExpired
            ?'session-expired'
            :recoveryInvalid
              ?'recovery-invalid'
              :normalizedNoticeKind==='error'
                ?'error'
                :normalizedNoticeKind==='success'
                  ?'success'
                  :message
                    ?'status'
                    :'ready';

  const accessNote = qaOnly
    ? 'Acceso restringido a las cuentas autorizadas para esta revisión.'
    : 'Acceso privado para clientes y equipo IBERFIT.';
  const retrySessionNotice=sessionRetryAvailable
    ? `<div class="m26-auth-context-state m26-auth-retry-state" role="status" aria-label="Sesión disponible para reintentar">
        <span class="m26-auth-context-mark" aria-hidden="true"></span>
        <div>
          <strong>Tu sesión sigue guardada</strong>
          <p>No necesitas volver a escribir la contraseña. Reintenta la conexión o usa otra cuenta si lo prefieres.</p>
          <button
            type="button"
            class="m26-secondary-action"
            data-auth-action="retry-session"
            ${busy ? 'disabled aria-disabled="true"' : ''}
          >${busy ? 'Reconectando…' : 'Reintentar acceso'}</button>
        </div>
      </div>`
    :'';

  let content = '';

  if (normalizedMode === 'mfa-required') {
    content = `
      <div class="m26-auth-copy">
        <p class="m26-auth-kicker">Verificación del dispositivo</p>
        <h1 id="m26-auth-title" tabindex="-1">Protege tu acceso</h1>
        <p>Configura este dispositivo una sola vez. La confirmación se hará con Face ID, Touch ID, Windows Hello, PIN o la contraseña del propio dispositivo.</p>
      </div>

      ${contextNotice}
      ${notice}

      <div class="m26-auth-actions">
        <button
          type="button"
          class="m26-primary-action"
          data-auth-action="mfa-continue-webauthn"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Configurando…' : 'Configurar este dispositivo'}
        </button>

        <button
          type="button"
          class="m26-secondary-action"
          data-auth-action="mfa-send-email-code"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          Usar código por correo
        </button>

        <button type="button" class="m26-tertiary-action" data-auth-action="mfa-logout">
          Volver y usar otra cuenta
        </button>
      </div>

      <p class="m26-field-help m26-device-assurance">IBERFIT no recibe tu PIN, contraseña ni biometría. La verificación ocurre de forma nativa en este dispositivo, sin QR ni otro equipo.</p>
    `;
  } else if (normalizedMode === 'mfa-challenge') {
    content = `
      <div class="m26-auth-copy">
        <p class="m26-auth-kicker">Verificación del dispositivo</p>
        <h1 id="m26-auth-title" tabindex="-1">Confirma que eres tú</h1>
        <p>Usa la seguridad nativa de este dispositivo para continuar. No necesitas escanear ningún QR ni usar otro equipo.</p>
      </div>

      ${contextNotice}
      ${notice}

      <div class="m26-auth-actions">
        <button
          type="button"
          class="m26-primary-action"
          data-auth-action="mfa-continue-webauthn"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          ${busy ? 'Confirmando…' : 'Confirmar en este dispositivo'}
        </button>

        <button
          type="button"
          class="m26-secondary-action"
          data-auth-action="mfa-send-email-code"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          Usar código por correo
        </button>

        <button
          type="button"
          class="m26-auth-link"
          data-auth-action="mfa-register-device"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >
          Configurar este dispositivo
        </button>

        <button type="button" class="m26-tertiary-action" data-auth-action="mfa-logout">
          Volver y usar otra cuenta
        </button>
      </div>

      <p class="m26-field-help m26-device-assurance">Si es la primera vez que entras desde este teléfono u ordenador, configúralo aquí. Tus otros dispositivos siguen intactos.</p>
    `;
  } else if (normalizedMode === 'mfa-email-code') {
    const maskedEmail=maskAccessEmail(mfa?.email||'');
    content = `
      <div class="m26-auth-copy">
        <p class="m26-auth-kicker">Verificación por correo</p>
        <h1 id="m26-auth-title" tabindex="-1">Introduce tu código IBERFIT</h1>
        <p>Te hemos enviado un código de 6 dígitos al correo asociado${maskedEmail?` (${e(maskedEmail)})`:''}. Es personal y de un solo uso.</p>
      </div>

      ${contextNotice}
      ${notice}

      <form data-auth-form="mfa-email-code" aria-label="Verificar acceso con código IBERFIT">
        <label>
          Código de acceso
          <input
            type="text"
            name="otp"
            autocomplete="one-time-code"
            inputmode="numeric"
            pattern="[0-9]{6}"
            minlength="6"
            maxlength="6"
            enterkeyhint="done"
            aria-describedby="m26-email-code-help"
            required
          >
        </label>
        <p id="m26-email-code-help" class="m26-field-help">El código caduca por seguridad y nunca debes compartirlo con otra persona.</p>

        <button
          type="submit"
          class="m26-primary-action"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >${busy ? 'Verificando…' : 'Verificar y entrar'}</button>

        <button
          type="button"
          class="m26-secondary-action"
          data-auth-action="mfa-resend-email-code"
          ${disabled ? 'disabled aria-disabled="true"' : ''}
        >Reenviar código</button>

        <button
          type="button"
          class="m26-auth-link"
          data-auth-action="mfa-back-device"
          ${busy ? 'disabled aria-disabled="true"' : ''}
        >Usar seguridad del dispositivo</button>

        <button type="button" class="m26-tertiary-action" data-auth-action="mfa-logout">
          Volver y usar otra cuenta
        </button>
      </form>
    `;
  } else if (normalizedMode === 'request-recovery') {
    content = `
      <div class="m26-auth-copy">
        <p class="m26-auth-kicker">Recuperación segura</p>
        <h1 id="m26-auth-title" tabindex="-1">Crear o recuperar contraseña</h1>
        <p>Introduce el correo asociado a tu cuenta. Te enviaremos un enlace seguro para crear una contraseña nueva.</p>
      </div>

      ${recoveryFlowMarkup(1)}
      ${contextNotice}
      ${notice}

      <form data-auth-form="request-recovery" aria-label="Recuperar acceso a IBERFIT">
        <label>
          Correo
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            enterkeyhint="send"
            autocorrect="off"
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
          class="m26-tertiary-action"
          data-auth-action="back-to-login"
        >
          Volver al acceso
        </button>
      </form>
    `;
  } else if (normalizedMode === 'update-password') {
    content = `
      <div class="m26-auth-copy">
        <p class="m26-auth-kicker">Recuperación segura</p>
        <h1 id="m26-auth-title" tabindex="-1">Crear contraseña nueva</h1>
        <p>Introduce y confirma la contraseña que utilizarás para acceder.</p>
      </div>

      ${recoveryFlowMarkup(3)}
      ${contextNotice}
      ${notice}

      <form data-auth-form="update-password" aria-label="Crear contraseña nueva">
        <label>
          Contraseña nueva
          <span class="m26-password-field">
            <input
              id="m26-new-password"
              type="password"
              name="password"
              autocomplete="new-password"
              aria-describedby="m26-password-requirements"
              required
              minlength="8"
              maxlength="1024"
            >
            <button
              type="button"
              class="m26-password-toggle"
              data-password-toggle
              aria-controls="m26-new-password"
              aria-pressed="false"
              aria-label="Mostrar contraseña"
            >Mostrar</button>
          </span>
        </label>

        <label>
          Confirmar contraseña
          <span class="m26-password-field">
            <input
              id="m26-new-password-confirmation"
              type="password"
              name="passwordConfirmation"
              autocomplete="new-password"
              enterkeyhint="done"
              aria-describedby="m26-password-requirements"
              required
              minlength="8"
              maxlength="1024"
            >
            <button
              type="button"
              class="m26-password-toggle"
              data-password-toggle
              aria-controls="m26-new-password-confirmation"
              aria-pressed="false"
              aria-label="Mostrar contraseña"
            >Mostrar</button>
          </span>
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
          class="m26-tertiary-action"
          data-auth-action="back-to-login"
        >
          Volver al acceso
        </button>
      </form>
    `;
  } else {
    content = `
      <div class="m26-auth-copy">
        <p class="m26-auth-kicker">Acceso privado</p>
        <h1 id="m26-auth-title" tabindex="-1">Entrenamiento personal con criterio</h1>
        <p>Diagnóstico, planificación, control y seguimiento.</p>
      </div>

      ${contextNotice}
      ${notice}
      ${retrySessionNotice}

      <form data-auth-form="login" aria-label="Acceso a IBERFIT">
        <label>
          Correo
          <input
            type="email"
            name="email"
            autocomplete="username"
            inputmode="email"
            enterkeyhint="next"
            autocorrect="off"
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
              enterkeyhint="go"
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
            title="Olvidé mi contraseña"
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
    <main class="m26-auth-page" data-auth-mode="${normalizedMode}" data-auth-state="${authState}">
      <section class="m26-auth-card" data-auth-mode="${normalizedMode}" data-auth-state="${authState}" aria-labelledby="m26-auth-title" aria-busy="${busy ? 'true' : 'false'}">
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