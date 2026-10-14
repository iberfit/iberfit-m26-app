// M42 · Optional private profile avatar, independent from initial IRI photography.
// Every download and mutation uses the current Supabase user token; blob URLs
// are memory-only, revoked at logout, never persisted or put in public markup.
export const AVATAR_BUCKET='iberfit-profile-avatars';
export const AVATAR_SOURCE_MIME='image/webp';
export const AVATAR_MAX_SOURCE_BYTES=5*1024*1024;
export const AVATAR_MAX_OUTPUT_BYTES=524288;
const ID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INPUT_MIMES=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
export const AVATAR_REVALIDATE_MS=120_000;

export function profileAvatarPath(clientId){
  const id=String(clientId||'').trim().toLowerCase();
  if(!ID_PATTERN.test(id))throw new Error('M42_AVATAR_CLIENT_ID_INVALID');
  return id+'/avatar.webp';
}
export function validateProfileAvatarFile(file){
  if(!file||!INPUT_MIMES.has(String(file.type||'').toLowerCase()))
    throw new Error('M42_AVATAR_UNSUPPORTED_IMAGE');
  if(!Number.isFinite(file.size)||file.size<=0||file.size>AVATAR_MAX_SOURCE_BYTES)
    throw new Error('M42_AVATAR_FILE_TOO_LARGE');
  return file;
}
export function canEditOwnProfileAvatar(identity={}){
  return String(identity.role||'')==='client'
    &&ID_PATTERN.test(String(identity.clientId||''))
    &&Boolean(identity.id);
}
export function avatarUploadMessage(error){
  switch(String(error?.message||error||'')){
    case 'M42_AVATAR_UNSUPPORTED_IMAGE':return 'Utiliza una foto JPG, PNG, WebP o HEIC compatible con tu dispositivo.';
    case 'M42_AVATAR_FILE_TOO_LARGE':return 'La imagen debe ocupar menos de 5 MB.';
    case 'M42_AVATAR_FILE_TOO_LARGE_PROCESSED':return 'No se ha podido reducir la foto. Prueba con otra imagen.';
    case 'M42_AVATAR_IMAGE_INVALID':return 'No se pudo abrir la imagen. Elige una fotografía válida.';
    case 'M42_AVATAR_FORBIDDEN':return 'No tienes permiso para modificar esta fotografía.';
    case 'M42_AVATAR_OFFLINE':return 'Necesitas conexión para actualizar tu fotografía.';
    default:return 'No se pudo actualizar la foto. Inténtalo de nuevo.';
  }
}
// Prefer the native bitmap pipeline; Mobile Safari can lack createImageBitmap
// even though it can decode camera HEIC photos through an <img> element.
async function decodeAvatarSource(file,scope){
  if(typeof scope.createImageBitmap==='function'){
    try{
      const bitmap=await scope.createImageBitmap(file);
      return {image:bitmap,dispose:()=>bitmap?.close?.()};
    }catch{} // Alternate browser decoder, never send source file to backend.
  }
  if(!scope.document?.createElement||!scope.URL?.createObjectURL)
    throw Error('M42_AVATAR_IMAGE_INVALID');
  const image=scope.document.createElement('img'),url=scope.URL.createObjectURL(file);
  try{
    await new Promise((resolve,reject)=>{
      let timer=null,completed=false;
      const end=(error)=>{
        if(completed)return;
        completed=true;if(timer!==null)(scope.clearTimeout||clearTimeout)(timer);
        image.onload=null;image.onerror=null;
        error?reject(error):resolve();
      };
      image.onload=()=>end(null);
      image.onerror=()=>end(Error('M42_AVATAR_IMAGE_INVALID'));
      timer=(scope.setTimeout||setTimeout)(()=>end(Error('M42_AVATAR_IMAGE_INVALID')),12000);
      image.src=url;
    });
    return {image,dispose:()=>scope.URL.revokeObjectURL(url)};
  }catch(error){scope.URL.revokeObjectURL(url);throw error;}
}
export async function normalizeAvatar(file,{scope=globalThis}={}){
  validateProfileAvatarFile(file);
  if(!scope.document?.createElement)throw Error('M42_AVATAR_IMAGE_INVALID');
  const decoded=await decodeAvatarSource(file,scope);
  const bitmap=decoded.image;
  try{
    const width=Number(bitmap.naturalWidth||bitmap.width),height=Number(bitmap.naturalHeight||bitmap.height);
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||
      width>6000||height>6000||width*height>16000000)
      throw Error('M42_AVATAR_IMAGE_INVALID');
    const canvas=scope.document.createElement('canvas');
    canvas.width=320;canvas.height=320;
    const ctx=canvas.getContext?.('2d');
    if(!ctx)throw Error('M42_AVATAR_IMAGE_INVALID');
    const edge=Math.min(width,height);
    ctx.drawImage(bitmap,(width-edge)/2,(height-edge)/2,edge,edge,0,0,320,320);
    for(const quality of [0.82,0.67,0.5]){
      const image=await new Promise(resolve=>canvas.toBlob(resolve,AVATAR_SOURCE_MIME,quality));
      if(image?.type===AVATAR_SOURCE_MIME&&image.size>0&&image.size<=AVATAR_MAX_OUTPUT_BYTES)
        return image;
    }
    throw Error('M42_AVATAR_FILE_TOO_LARGE_PROCESSED');
  }finally{decoded.dispose();}
}

export function createClientAvatarController({
  root,runtime,getToken,getIdentity,fetchImpl=globalThis.fetch,scope=globalThis,
}={}){
  if(!root?.addEventListener||typeof getToken!=='function'||typeof getIdentity!=='function')
    throw new Error('M42_AVATAR_CONTROLLER_REQUIRED');
  let mounted=false,generation=0,observer=null,intersection=null,scheduled=false,busy=false;
  let lastRoleKey='';
  const cache=new Map(),inFlight=new Map(),missing=new Set(),checkedAt=new Map();
  const base=String(runtime?.url||'').replace(/\/+$/,'');
  const apikey=String(runtime?.publishableKey||'');
  const resource=(path)=>base+'/storage/v1/object/'+path;
  const endpoint=(clientId)=>resource('authenticated/'+AVATAR_BUCKET+'/'+profileAvatarPath(clientId));
  const status=(message,kind='status')=>{
    const el=root.querySelector?.('[data-iberfit-avatar-status]');
    if(el){el.textContent=message;el.dataset.status=kind;}
  };
  function clearCache(){
    for(const url of cache.values())try{scope.URL?.revokeObjectURL?.(url);}catch{}
    cache.clear();missing.clear();checkedAt.clear();inFlight.clear();
  }
  function renderImage(node,url){
    if(!node||!url)return;
    let img=node.querySelector?.('img[data-iberfit-avatar-image]');
    if(!img){
      img=node.ownerDocument?.createElement?.('img');
      if(!img)return;
      img.setAttribute('data-iberfit-avatar-image','');
      img.setAttribute('alt','');
      img.setAttribute('aria-hidden','true');
      img.setAttribute('decoding','async');
      node.append(img);
    }
    if(img.src!==url)img.src=url;
    node.classList.add('has-iberfit-avatar');
  }
  function show(clientId,url){
    for(const node of root.querySelectorAll?.('[data-iberfit-avatar-client]')||[])
      if(node.getAttribute('data-iberfit-avatar-client')===clientId)renderImage(node,url);
  }
  async function token(){
    const value=await getToken();
    if(!value)throw new Error('M42_AVATAR_FORBIDDEN');
    return String(value);
  }
  function header(bearer){return {apikey,Authorization:'Bearer '+bearer};}
  function identityScope(){
    const identity=getIdentity()||{};
    return [identity.id||'',identity.role||'',identity.clientId||''].join('|');
  }
  function unchangedScope(expected,epoch){
    return mounted&&generation===epoch&&identityScope()===expected;
  }
  function evict(clientId){
    const old=cache.get(clientId);
    if(old)try{scope.URL?.revokeObjectURL?.(old);}catch{}
    cache.delete(clientId);
    showFallback(clientId);
  }
  async function load(clientId,{force=false}={}){
    const path=profileAvatarPath(clientId);
    if(!mounted||!base||!apikey||typeof fetchImpl!=='function')return null;
    const fresh=Date.now()-(checkedAt.get(clientId)||0)<AVATAR_REVALIDATE_MS;
    if(!force&&fresh&&cache.has(clientId)){show(clientId,cache.get(clientId));return cache.get(clientId);}
    if(!force&&fresh&&missing.has(clientId))return null;
    if(inFlight.has(clientId))return inFlight.get(clientId);
    const generationAtStart=generation,scopeAtStart=identityScope();
    checkedAt.set(clientId,Date.now());
    const request=(async()=>{
      try{
        const auth=await token();
        const res=await fetchImpl(resource('authenticated/'+AVATAR_BUCKET+'/'+path),{
          method:'GET',headers:header(auth),credentials:'omit',cache:'no-store',
        });
        if(!unchangedScope(scopeAtStart,generationAtStart))return null;
        let missingAtStorage=false;
        if(res.status===400){
          try{const detail=await res.clone().json();missingAtStorage=detail?.code==='NoSuchKey';}
          catch{}
        }
        if(!unchangedScope(scopeAtStart,generationAtStart))return null;
        if(missingAtStorage||[401,403,404].includes(res.status)){
          evict(clientId);missing.add(clientId);return null;
        }
        if(!res.ok)return null; // No public fallback on transient errors
        const blob=await res.blob();
        if(blob.size<=0||blob.size>AVATAR_MAX_OUTPUT_BYTES)return null;
        const url=scope.URL?.createObjectURL?.(blob);
        if(!url)return null;
        if(!unchangedScope(scopeAtStart,generationAtStart)){scope.URL.revokeObjectURL(url);return null;}
        const prior=cache.get(clientId);
        if(prior)scope.URL.revokeObjectURL(prior);
        cache.set(clientId,url);missing.delete(clientId);
        show(clientId,url);
        return url;
      }catch{return null;}
      finally{inFlight.delete(clientId);}
    })();
    inFlight.set(clientId,request);return request;
  }
  function scan(){
    scheduled=false;
    if(!mounted)return;
    const identity=getIdentity()||{};
    const key=String(identity.id||'')+'|'+String(identity.role||'')+'|'+String(identity.clientId||'');
    if(lastRoleKey!==key){
      ++generation;
      clearCache();
      lastRoleKey=key;
    }
    const nodes=root.querySelectorAll?.('[data-iberfit-avatar-client]')||[];
    for(const node of nodes){
      const clientId=node.getAttribute?.('data-iberfit-avatar-client');
      if(!ID_PATTERN.test(String(clientId||'')))continue;
      if(cache.has(clientId))renderImage(node,cache.get(clientId));
      const fresh=Date.now()-(checkedAt.get(clientId)||0)<AVATAR_REVALIDATE_MS;
      if(fresh||inFlight.has(clientId))continue;
      if(intersection)intersection.observe(node);
      else void load(clientId);
    }
  }
  function schedule(){
    if(!mounted||scheduled)return;
    scheduled=true;
    scope.queueMicrotask?scope.queueMicrotask(scan):Promise.resolve().then(scan);
  }
  function showFallback(clientId){
    for(const node of root.querySelectorAll?.('[data-iberfit-avatar-client]')||[]){
      if(node.getAttribute('data-iberfit-avatar-client')!==clientId)continue;
      node.querySelector?.('img[data-iberfit-avatar-image]')?.remove();
      node.classList.remove('has-iberfit-avatar');
    }
  }
  async function onFileChange(event){
    const input=event.target?.closest?.('[data-iberfit-avatar-upload]');
    if(!input||busy)return;
    const identity=getIdentity();
    if(!canEditOwnProfileAvatar(identity))return;
    const file=input.files?.[0];
    if(!file)return;
    const generationAtStart=generation,scopeAtStart=identityScope();
    busy=true;status('Preparando tu fotografía…');
    try{
      if(scope.navigator?.onLine===false)throw new Error('M42_AVATAR_OFFLINE');
      const blob=await normalizeAvatar(file,{scope});
      if(!unchangedScope(scopeAtStart,generationAtStart))return;
      const auth=await token();
      if(!unchangedScope(scopeAtStart,generationAtStart))return;
      const res=await fetchImpl(resource(AVATAR_BUCKET+'/'+profileAvatarPath(identity.clientId)),{
        method:'POST',credentials:'omit',cache:'no-store',
        headers:{...header(auth),'content-type':AVATAR_SOURCE_MIME,'x-upsert':'true'},
        body:blob,
      });
      if(!unchangedScope(scopeAtStart,generationAtStart))return;
      if(!res.ok){
        if([401,403].includes(res.status))throw new Error('M42_AVATAR_FORBIDDEN');
        throw new Error('M42_AVATAR_UPLOAD_FAILED');
      }
      const id=String(identity.clientId).toLowerCase();
      const old=cache.get(id);
      if(old)scope.URL?.revokeObjectURL?.(old);
      cache.delete(id);missing.delete(id);
      const verified=await load(id,{force:true});
      if(!unchangedScope(scopeAtStart,generationAtStart))return;
      if(verified)status('Foto actualizada. Tu Coach autorizado podrá verla.','success');
      else status('Foto guardada, pero no se pudo recuperar su vista. Comprueba la conexión y actualiza la pantalla.','pending');
    }catch(error){
      if(unchangedScope(scopeAtStart,generationAtStart))status(avatarUploadMessage(error),'error');
    }finally{busy=false;input.value='';}
  }
  async function onRemove(event){
    const button=event.target?.closest?.('[data-iberfit-avatar-remove]');
    if(!button||busy)return;
    const identity=getIdentity();
    if(!canEditOwnProfileAvatar(identity))return;
    if(typeof scope.confirm==='function'&&!scope.confirm('¿Quitar tu foto de perfil?'))return;
    if(scope.navigator?.onLine===false){status(avatarUploadMessage('M42_AVATAR_OFFLINE'),'error');return;}
    const generationAtStart=generation,scopeAtStart=identityScope();
    busy=true;button.disabled=true;status('Quitando tu fotografía…');
    try{
      const auth=await token();
      if(!unchangedScope(scopeAtStart,generationAtStart))return;
      const res=await fetchImpl(resource(AVATAR_BUCKET),{
        method:'DELETE',credentials:'omit',cache:'no-store',
        headers:{...header(auth),'content-type':'application/json'},
        body:JSON.stringify({prefixes:[profileAvatarPath(identity.clientId)]}),
      });
      if(!unchangedScope(scopeAtStart,generationAtStart))return;
      if(!res.ok)throw new Error('M42_AVATAR_DELETE_FAILED');
      const id=String(identity.clientId).toLowerCase(),old=cache.get(id);
      if(old)scope.URL?.revokeObjectURL?.(old);
      cache.delete(id);missing.add(id);checkedAt.set(id,Date.now());
      showFallback(id);
      status('Foto retirada. Se muestra de nuevo tu inicial.','success');
    }catch(error){
      if(unchangedScope(scopeAtStart,generationAtStart))status(avatarUploadMessage(error),'error');
    }finally{busy=false;button.disabled=false;}
  }
  const onClick=(event)=>{void onRemove(event);};
  const onChange=(event)=>{void onFileChange(event);};
  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('change',onChange);
      root.addEventListener('click',onClick);
      if(typeof scope.IntersectionObserver==='function'){
        intersection=new scope.IntersectionObserver((entries)=>{
          for(const entry of entries){
            if(!entry.isIntersecting)continue;
            intersection.unobserve(entry.target);
            const id=entry.target.getAttribute('data-iberfit-avatar-client');
            if(ID_PATTERN.test(String(id||'')))void load(id);
          }
        },{rootMargin:'160px'});
      }
      if(typeof scope.MutationObserver==='function'){
        observer=new scope.MutationObserver(schedule);
        observer.observe(root,{childList:true,subtree:true});
      }
      schedule();
    },
    refresh:schedule,
    destroy(){
      ++generation;mounted=false;
      root.removeEventListener('change',onChange);
      root.removeEventListener('click',onClick);
      observer?.disconnect?.();observer=null;
      intersection?.disconnect?.();intersection=null;
      for(const el of root.querySelectorAll?.('[data-iberfit-avatar-client]')||[]){
        el.querySelector?.('img[data-iberfit-avatar-image]')?.remove();
        el.classList?.remove('has-iberfit-avatar');
      }
      clearCache();lastRoleKey='';
    },
  });
}
