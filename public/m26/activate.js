const PROD_REF='pjhmrhejsoofmouedavw';
const QA_REF='gjztkdwfmunnzhtvxrsu';
const MAX_TOKEN=16_384;
const root=document.querySelector('.iberfit-activate');
const form=document.querySelector('[data-activation-form]');
const notice=document.querySelector('[data-activation-notice]');
const intro=document.querySelector('[data-activation-intro]');
const identity=document.querySelector('[data-activation-identity]');
const emailNode=document.querySelector('[data-activation-email]');
const enter=document.querySelector('[data-activation-enter]');
const submit=document.querySelector('[data-activation-submit]');

function setNotice(message,kind='status'){
  notice.textContent=message;notice.classList.toggle('is-error',kind==='error');notice.classList.toggle('is-success',kind==='success');
}
function clearSecretUrl(){
  try{history.replaceState(null,'',`${location.pathname}${location.search}`);}catch{}
}
function runtime(){
  const raw=globalThis.__IBERFIT_M26_RUNTIME__||{};
  const host=String(location.hostname||'').toLowerCase();
  const qa=host==='m26-canary.iberfit.cl';
  const expectedRef=qa?QA_REF:PROD_REF;
  const expectedOrigin=`https://${expectedRef}.supabase.co`;
  if(raw?.enabled!==true||raw?.projectRef!==expectedRef||raw?.qaOnly!==qa)throw new Error('M26_ACTIVATION_RUNTIME_INVALID');
  let url;try{url=new URL(String(raw.url||''));}catch{throw new Error('M26_ACTIVATION_RUNTIME_INVALID');}
  if(url.origin!==expectedOrigin||url.pathname!=='/'||url.search||url.hash)throw new Error('M26_ACTIVATION_RUNTIME_INVALID');
  const key=String(raw.publishableKey||raw.anonKey||'');if(!key||key.length>MAX_TOKEN)throw new Error('M26_ACTIVATION_RUNTIME_INVALID');
  if(!qa&&host!=='app.iberfit.cl'&&!['localhost','127.0.0.1'].includes(host))throw new Error('M26_ACTIVATION_HOST_INVALID');
  return Object.freeze({url:url.origin,key,version:String(raw.version||'26.0.0')});
}
function invitation(){
  const raw=String(location.hash||'');if(!raw.startsWith('#')||raw.length>MAX_TOKEN*2+4096)throw new Error('M26_INVITE_LINK_INVALID');
  const params=new URLSearchParams(raw.slice(1));
  if(params.get('type')!=='invite'||params.getAll('access_token').length!==1)throw new Error('M26_INVITE_LINK_INVALID');
  const token=String(params.get('access_token')||'');if(!token||token.length>MAX_TOKEN||/[\u0000-\u001f\u007f]/u.test(token))throw new Error('M26_INVITE_LINK_INVALID');
  const expiresAt=Number(params.get('expires_at')||0);if(Number.isFinite(expiresAt)&&expiresAt>0&&expiresAt<=Math.floor(Date.now()/1000))throw new Error('M26_INVITE_LINK_EXPIRED');
  return Object.freeze({token});
}
async function request(rt,path,{token,method='GET',body}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12_000);
  try{
    const response=await fetch(`${rt.url}${path}`,{method,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{apikey:rt.key,authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{}),'x-client-info':`iberfit-m26-activation/${rt.version}`},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(String(data?.code||data?.message||data?.error||`M26_HTTP_${response.status}`));error.status=response.status;throw error;}return data;
  }catch(error){if(error?.name==='AbortError')throw new Error('M26_TIMEOUT');throw error;}finally{clearTimeout(timer);}
}
function friendly(error){
  const code=String(error?.message||'');
  if(/EXPIRED|OTP_EXPIRED|401/.test(code))return 'Esta invitación ha caducado. Pide a tu Entrenador que te envíe una nueva.';
  if(/INVITE_LINK|ACTIVATION_LINK|403/.test(code))return 'Este enlace de invitación no es válido para activar una cuenta IBERFIT.';
  if(/PASSWORD/.test(code))return 'La contraseña debe tener al menos 8 caracteres.';
  if(/TIMEOUT|NETWORK|FETCH/.test(code))return 'No fue posible conectar. Comprueba tu conexión e inténtalo de nuevo.';
  return 'No fue posible completar la activación. El acceso no se ha habilitado.';
}
async function bootstrap(){
  try{
    const rt=runtime();const invite=invitation();const user=await request(rt,'/auth/v1/user',{token:invite.token});
    const email=String(user?.email||'').trim();if(!email.includes('@'))throw new Error('M26_INVITE_IDENTITY_INVALID');
    root.dataset.activationState='ready';emailNode.textContent=email;identity.hidden=false;form.hidden=false;intro.textContent='Define tu contraseña para terminar de activar tu espacio privado IBERFIT.';setNotice('Invitación validada. Tu acceso aún no está activo.');
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submit.disabled)return;
      const data=new FormData(form);const password=String(data.get('password')||'');const confirmation=String(data.get('passwordConfirmation')||'');
      if(password.length<8||password.length>1024){setNotice('La contraseña debe tener al menos 8 caracteres.','error');return;}
      if(password!==confirmation){setNotice('Las contraseñas no coinciden.','error');return;}
      submit.disabled=true;setNotice('Activando tu acceso seguro…');
      try{
        await request(rt,'/auth/v1/user',{token:invite.token,method:'PUT',body:{password}});
        await request(rt,'/functions/v1/iberfit-client-access-v1',{token:invite.token,method:'POST',body:{action:'activate'}});
        clearSecretUrl();root.dataset.activationState='success';form.hidden=true;identity.hidden=true;intro.textContent='Tu cuenta está preparada para entrar en IBERFIT.';setNotice('Tu acceso a IBERFIT está activo.','success');enter.hidden=false;enter.focus?.();
      }catch(error){submit.disabled=false;setNotice(friendly(error),'error');}
    });
    document.querySelector('[data-password-toggle]')?.addEventListener('click',event=>{
      const button=event.currentTarget;const input=document.getElementById('activate-password');const visible=input.type==='text';input.type=visible?'password':'text';button.textContent=visible?'Mostrar':'Ocultar';button.setAttribute('aria-pressed',visible?'false':'true');input.focus?.();
    });
  }catch(error){clearSecretUrl();root.dataset.activationState='error';intro.textContent='No pudimos validar esta invitación.';setNotice(friendly(error),'error');form.hidden=true;identity.hidden=true;enter.hidden=false;enter.textContent='Volver a IBERFIT';}
}

await bootstrap();
